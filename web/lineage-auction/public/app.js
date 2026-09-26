// Lineage Auction House — a read-only live view of the UNMAPPED lineage market on Sepolia.
// Reads the chain from the browser through a public RPC (no wallet, no server): the ENSv2 name tree
// the LineageRegistry keeps (cartridges, their remixes and players' saves), each launched world's
// Uniswap Continuous Clearing Auction (clearing price over blocks, bids, raised, sold), its v4 pool
// after graduation, and the royalties the lineage hook owes. Refreshes every block (~12 s). Nothing
// here can sign or send.

import {
  createPublicClient,
  decodeAbiParameters,
  encodeAbiParameters,
  encodeFunctionData,
  formatUnits,
  http,
  keccak256,
  namehash,
  parseAbi,
  parseAbiItem,
} from "https://cdn.jsdelivr.net/npm/viem@2.56.5/+esm";

const CONFIG = {
  rpc: "https://ethereum-sepolia-rpc.publicnode.com",
  parent: "unmapped.eth",
  registry: "0xda8051e3e2855C125AAd6050f97Ea64cf203dAf6",
  hook: "0x59FA49D974B4564Eade17EDDC4a3CCf8D819a044",
  router: "0x2201fBDB7f17BD687d8965B9Dc2Ae000689039BE",
  accounts: "0x7B8b8E17590cC85c315d459feD8fC9384C2c9bE5",
  stateView: "0xE1Dd9c3fA50EDB962E442f60DfBc432e24537E4C",
  usdc: "0x16f95d91dba7da3aca778ec053df0ff6c6a8aa8e",
  ccaFactory: "0x000000001f26a0044baa66024e7b6599c61963f8", // continuous-clearing-auction v2.1.0
  fromBlock: 11781460n, // the registry's deployment
  explorer: "https://sepolia.etherscan.io",
};

const client = createPublicClient({ transport: http(CONFIG.rpc) });

const registryAbi = parseAbi([
  "function ownerOf(address token) view returns (address)",
  "function poolKeyOf(address token) view returns ((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks))",
]);
const auctionAbi = parseAbi([
  "function startBlock() view returns (uint64)",
  "function endBlock() view returns (uint64)",
  "function clearingPrice() view returns (uint256)",
  "function floorPrice() view returns (uint256)",
  "function nextBidId() view returns (uint256)",
  "function isGraduated() view returns (bool)",
  "function lastCheckpointedBlock() view returns (uint64)",
  "function currencyRaised() view returns (uint256)",
  "function totalCleared() view returns (uint256)",
  "function totalSupply() view returns (uint128)",
]);
const erc20Abi = parseAbi(["function symbol() view returns (string)"]);
/** The auction's own parameters, as its factory logged them: the only place the CCA (v2.1.0) keeps
 * its required raise readable (it has no getter). Field for field, contracts/src/lineage/LaunchTypes.sol. */
const AUCTION_PARAMETERS = [{
  type: "tuple",
  components: [
    { name: "currency", type: "address" }, { name: "tokensRecipient", type: "address" },
    { name: "fundsRecipient", type: "address" }, { name: "startBlock", type: "uint64" },
    { name: "endBlock", type: "uint64" }, { name: "claimBlock", type: "uint64" },
    { name: "tickSpacing", type: "uint256" }, { name: "validationHook", type: "address" },
    { name: "floorPrice", type: "uint256" }, { name: "requiredCurrencyRaised", type: "uint128" },
    { name: "auctionStepsData", type: "bytes" },
  ],
}];
const checkpointCall = encodeFunctionData({ abi: parseAbi(["function checkpoint()"]), functionName: "checkpoint" });
const stateViewAbi = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
]);
const hookAbi = parseAbi(["function owed(address world, address currency) view returns (uint256)"]);
const EVENTS = {
  launched: parseAbiItem(
    "event WorldLaunched(address indexed token, address indexed parent, address indexed owner, address auction, bytes dnsName)",
  ),
  bid: parseAbiItem("event BidSubmitted(uint256 indexed id, address indexed owner, uint256 priceQ96, uint128 amount)"),
  price: parseAbiItem("event ClearingPriceUpdated(uint256 blockNumber, uint256 clearingPriceQ96)"),
  exited: parseAbiItem("event BidExited(uint256 indexed bidId, address indexed owner, uint256 tokensFilled, uint256 currencyRefunded)"),
  claimed: parseAbiItem("event TokensClaimed(uint256 indexed bidId, address indexed owner, uint256 tokensFilled)"),
  created: parseAbiItem("event AuctionCreated(address indexed auction, address indexed token, uint256 amount, bytes configData)"),
  named: parseAbiItem(
    "event NameRegistered(bytes32 indexed node, bytes32 indexed parent, address indexed owner, uint8 kind, bytes dnsName)",
  ),
  saved: parseAbiItem(
    "event SaveRecorded(bytes32 indexed node, bytes32 indexed cartridge, bytes32 saveHash, string version, string progress)",
  ),
};
const KIND = { cartridge: 1, save: 2 };

const $ = (id) => document.getElementById(id);
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const lower = (a) => a.toLowerCase();
const decimalsOf = (currency) => (lower(currency) === CONFIG.usdc ? 6 : 18);
/** Q96 auction price (currency per token, raw units) → whole currency per whole token. */
const human = (q96, decimals) => Number(formatUnits((q96 * 10n ** 18n) >> 96n, decimals));
const fmt = (n, digits = 4) =>
  n === 0 ? "0" : n >= 1000 ? n.toLocaleString("en", { maximumFractionDigits: 0 }) : n.toPrecision(digits).replace(/\.?0+$/, "");
const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function dnsName(packet) {
  const bytes = packet.slice(2).match(/../g).map((h) => parseInt(h, 16));
  const labels = [];
  for (let at = 0; at < bytes.length && bytes[at] !== 0; at += bytes[at] + 1) {
    labels.push(String.fromCharCode(...bytes.slice(at + 1, at + 1 + bytes[at])));
  }
  return labels.join(".");
}

const state = { worlds: [], names: [], saves: new Map(), selected: null, symbols: new Map(), code: new Map(), required: new Map() };

/** An auction's required raise (raw currency units) from its factory log; immutable, so kept. */
async function requiredRaise(world, latest) {
  const key = lower(world.auction);
  if (!state.required.has(key)) {
    const [log] = await client.getLogs({
      address: CONFIG.ccaFactory, event: EVENTS.created, args: { auction: world.auction }, fromBlock: world.block, toBlock: latest,
    });
    if (!log) return null;
    state.required.set(key, decodeAbiParameters(AUCTION_PARAMETERS, log.args.configData)[0].requiredCurrencyRaised);
  }
  return state.required.get(key);
}

/** An ended auction's final outcome. isGraduated() / currencyRaised() read the last checkpoint:
 * a graduation stands (raised only grows), and so does a miss once the end block is checkpointed or
 * nobody bid; otherwise the end checkpoint is simulated (checkpoint(), then the reads). */
async function endedOutcome(world, reads) {
  if (reads.graduated || reads.lastCheckpointed === reads.end || reads.bidCount === 0n) {
    return { graduated: reads.graduated, raised: reads.raised };
  }
  const { results } = await client.simulateCalls({
    calls: [
      { to: world.auction, data: checkpointCall },
      { to: world.auction, abi: auctionAbi, functionName: "isGraduated" },
      { to: world.auction, abi: auctionAbi, functionName: "currencyRaised" },
    ],
  });
  if (results.some((r) => r.status !== "success")) throw new Error("could not simulate the auction's end");
  return { graduated: results[1].result, raised: results[2].result };
}

async function poolOpen(world) {
  const key = await client.readContract({ address: CONFIG.registry, abi: registryAbi, functionName: "poolKeyOf", args: [world.token] });
  const [sqrtPriceX96] = await client.readContract({ address: CONFIG.stateView, abi: stateViewAbi, functionName: "getSlot0", args: [poolIdOf(key)] });
  return sqrtPriceX96 > 0n;
}

const poolIdOf = (key) => keccak256(encodeAbiParameters(
  [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
  [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
));

/** With no world asked for: the newest world whose pool is open, else the newest launch. */
async function defaultWorld() {
  for (const world of [...state.worlds].reverse()) if (await poolOpen(world)) return world;
  return state.worlds.at(-1);
}

async function symbol(token) {
  if (!state.symbols.has(lower(token))) {
    state.symbols.set(lower(token), await client.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }));
  }
  return state.symbols.get(lower(token));
}

/** A bidder with code is a PasskeyAccount clone (the only contracts that bid here). */
async function isAccount(address) {
  if (!state.code.has(lower(address))) {
    const code = await client.getCode({ address });
    state.code.set(lower(address), code !== undefined && code !== "0x");
  }
  return state.code.get(lower(address));
}

async function loadWorlds(latest) {
  const range = { address: CONFIG.registry, fromBlock: CONFIG.fromBlock, toBlock: latest };
  const [logs, named, saved] = await Promise.all([
    client.getLogs({ ...range, event: EVENTS.launched }),
    client.getLogs({ ...range, event: EVENTS.named }),
    client.getLogs({ ...range, event: EVENTS.saved }),
  ]);
  state.names = named.map((log) => ({
    node: log.args.node,
    parent: log.args.parent,
    kind: Number(log.args.kind),
    name: dnsName(log.args.dnsName),
  }));
  // The newest checkpoint each save name records.
  state.saves = new Map(saved.map((log) => [log.args.node, { progress: log.args.progress, version: log.args.version }]));
  state.worlds = logs.map((log) => ({
    token: log.args.token,
    parent: log.args.parent,
    auction: log.args.auction,
    name: dnsName(log.args.dnsName),
    block: log.blockNumber,
  }));
  const select = $("world");
  const current = select.value;
  select.innerHTML = state.worlds.map((w) => `<option value="${w.token}">${escape(w.name)}</option>`).join("");
  const fromHash = location.hash.slice(1);
  const pick = state.worlds.find((w) => w.name === fromHash || w.name.split(".")[0] === fromHash);
  select.value = current || pick?.token || (await defaultWorld())?.token || "";
  renderTree();
}

/** The whole name tree: a launched world is a button (it has an auction here), a cartridge named
 * without a market and a player's save are plain rows, tagged, a save with its latest progress.
 * `players.<root>` is the directory of players' own names (`<you>.players.<root>`, each recorded
 * by the player's passkey account with recordSave), so its children read as players, not saves. */
function renderTree() {
  const directory = `players.${CONFIG.parent}`;
  const byParent = new Map();
  for (const n of state.names) byParent.set(n.parent, [...(byParent.get(n.parent) ?? []), n]);
  const rows = [];
  const walk = (parent, depth) => {
    for (const n of byParent.get(parent) ?? []) {
      const indent = `<span class="depth">${"└ ".padStart(depth * 2 + 2, " ").replace(/ /g, "&nbsp;")}</span>`;
      const world = state.worlds.find((w) => w.name === n.name);
      const save = state.saves.get(n.node);
      const label = world
        ? `<button type="button" data-token="${world.token}" aria-current="${lower(world.token) === lower($("world").value)}">${escape(n.name)}</button><span class="tag good">market</span>`
        : n.name === directory
          ? `<span>${escape(n.name)}</span><span class="tag">player names</span>`
          : n.kind === KIND.save && n.name.endsWith(`.${directory}`)
            ? `<span>${escape(n.name)}</span><span class="tag passkey">player</span>`
            : n.kind === KIND.save
          ? `<span>${escape(n.name)}</span><span class="tag passkey">save</span>${save ? `<span class="hint">${escape(save.progress)} · v${escape(save.version)}</span>` : ""}`
          : `<span>${escape(n.name)}</span><span class="tag">cartridge</span>`;
      rows.push(`<li>${indent}${label}</li>`);
      walk(n.node, depth + 1);
    }
  };
  walk(namehash(CONFIG.parent), 0);
  $("tree").innerHTML = rows.join("") || `<li class="empty">Nothing is named yet.</li>`;
}

async function loadWorld(world, latest) {
  const currency = world.parent === "0x0000000000000000000000000000000000000000" ? CONFIG.usdc : world.parent;
  const read = (functionName) => client.readContract({ address: world.auction, abi: auctionAbi, functionName });
  const [start, end, clearing, floor, bidCount, graduatedNow, lastCheckpointed, raisedNow, cleared, supply, owner, tokenSymbol, currencySymbol, required] =
    await Promise.all([
      read("startBlock"), read("endBlock"), read("clearingPrice"), read("floorPrice"), read("nextBidId"),
      read("isGraduated"), read("lastCheckpointedBlock"), read("currencyRaised"), read("totalCleared"), read("totalSupply"),
      client.readContract({ address: CONFIG.registry, abi: registryAbi, functionName: "ownerOf", args: [world.token] }),
      symbol(world.token), symbol(currency), requiredRaise(world, latest),
    ]);
  const { graduated, raised } = latest > end
    ? await endedOutcome(world, { graduated: graduatedNow, raised: raisedNow, lastCheckpointed, end, bidCount })
    : { graduated: graduatedNow, raised: raisedNow };
  const range = { address: world.auction, fromBlock: world.block, toBlock: latest };
  const [bids, prices, exits, claims] = await Promise.all([
    client.getLogs({ ...range, event: EVENTS.bid }),
    client.getLogs({ ...range, event: EVENTS.price }),
    client.getLogs({ ...range, event: EVENTS.exited }),
    client.getLogs({ ...range, event: EVENTS.claimed }),
  ]);
  const key = await client.readContract({ address: CONFIG.registry, abi: registryAbi, functionName: "poolKeyOf", args: [world.token] });
  const poolId = poolIdOf(key);
  const [sqrtPriceX96] = await client.readContract({ address: CONFIG.stateView, abi: stateViewAbi, functionName: "getSlot0", args: [poolId] });
  return {
    world, currency, start, end, clearing, floor, bidCount, graduated, raised, required, cleared, supply, owner,
    tokenSymbol, currencySymbol, bids, prices, exits, claims, key, poolId, sqrtPriceX96, latest,
    decimals: decimalsOf(currency),
  };
}

function renderBoard(d) {
  const { world, decimals, latest, start, end } = d;
  $("world-name").textContent = world.name;
  const phase = phaseOf(d);
  const pill = $("phase");
  pill.dataset.phase = phase;
  pill.textContent = {
    pool: "graduated · pool open", soon: "starts soon", live: "live auction", ended: "auction ended",
    failed: "failed · no pool",
  }[phase];
  $("world-meta").textContent = `$${d.tokenSymbol} ${short(world.token)} · holder ${short(d.owner)} · priced in $${d.currencySymbol}`;
  $("clearing").textContent = fmt(human(d.clearing, decimals));
  $("clearing-unit").textContent = `${d.currencySymbol} per ${d.tokenSymbol}`;
  const floor = human(d.floor, decimals);
  const rise = floor > 0 ? (human(d.clearing, decimals) / floor - 1) * 100 : 0;
  $("price-note").textContent =
    rise > 0.5
      ? `Bids have pushed the price ${rise.toFixed(0)}% above the ${fmt(floor)} floor. Every filled bid pays this one price.`
      : latest > end
        ? `It ended at the ${fmt(floor)} floor: demand never exceeded the supply each block released.`
        : `At the ${fmt(floor)} floor: demand has not yet exceeded the supply each block releases.`;
  const left = end >= latest ? end - latest + 1n : 0n;
  $("time-left").textContent = left > 0n ? `${left} blocks` : "ended";
  $("time-sub").textContent = left > 0n ? `≈ ${Math.ceil(Number(left) * 12 / 60)} min · ends at ${end}` : `ended at block ${end}`;
  $("raised").textContent = `${fmt(Number(formatUnits(d.raised, decimals)))} ${d.currencySymbol}`;
  const need = d.required === null ? "" : ` of ${fmt(Number(formatUnits(d.required, decimals)))} ${d.currencySymbol}`;
  $("raised-sub").textContent = d.graduated
    ? "enough to graduate"
    : phase === "failed"
      ? `ended below the required raise${need}: it will not graduate`
      : `below the required raise${need}`;
  const soldPct = d.supply > 0n ? Number((d.cleared * 10000n) / d.supply) / 100 : 0;
  $("sold").textContent = `${soldPct.toFixed(1)}%`;
  $("sold-sub").textContent = `${fmt(Number(formatUnits(d.cleared, 18)))} of ${fmt(Number(formatUnits(d.supply, 18)))} ${d.tokenSymbol}`;
  $("bid-count").textContent = String(d.bidCount);
  $("bid-sub").textContent = `${d.exits.length} settled`;
}

function renderChart(d) {
  const W = 960, H = 320, L = 64, R = 20, T = 18, B = 34, lane = 54;
  const { start, end, latest, decimals } = d;
  const x = (block) => L + (Number(block - start) / Math.max(1, Number(end - start))) * (W - L - R);
  const floor = human(d.floor, decimals);
  const points = [{ block: start, price: floor }, ...d.prices.map((log) => ({ block: log.args.blockNumber, price: human(log.args.clearingPriceQ96, decimals) }))];
  const top = Math.max(floor * 1.6, ...points.map((p) => p.price * 1.25));
  const priceBottom = H - B - lane - 8;
  const y = (price) => priceBottom - (price / top) * (priceBottom - T);
  const nowBlock = latest > end ? end : latest < start ? start : latest;
  let path = `M ${x(start)} ${y(floor)}`;
  let last = floor;
  for (const p of points.slice(1)) {
    path += ` L ${x(p.block)} ${y(last)} L ${x(p.block)} ${y(p.price)}`;
    last = p.price;
  }
  path += ` L ${x(nowBlock)} ${y(last)}`;
  const area = `${path} L ${x(nowBlock)} ${priceBottom} L ${x(start)} ${priceBottom} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => top * f);
  const amounts = d.bids.map((b) => Number(formatUnits(b.args.amount, decimals)));
  const maxAmount = Math.max(1, ...amounts);
  const laneTop = H - B - lane;
  const bars = d.bids.map((b, i) => {
    const h = Math.max(3, (amounts[i] / maxAmount) * (lane - 6));
    return `<rect class="bid" x="${x(b.blockNumber) - 4}" y="${laneTop + lane - h}" width="8" height="${h}" rx="1.5"><title>bid #${b.args.id}: ${fmt(amounts[i])} ${escape(d.currencySymbol)}</title></rect>`;
  });
  const blockTicks = [start, start + (end - start) / 2n, end];
  $("chart").innerHTML = [
    ...ticks.map((t) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${fmt(t, 3)}</text>`),
    `<line class="grid" x1="${L}" x2="${W - R}" y1="${laneTop + lane}" y2="${laneTop + lane}"/>`,
    `<text x="${L - 8}" y="${laneTop + lane / 2 + 4}" text-anchor="end">bids</text>`,
    `<line class="floor" x1="${L}" x2="${W - R}" y1="${y(floor)}" y2="${y(floor)}"/>`,
    `<path class="clear-area" d="${area}"/>`,
    `<path class="clear" d="${path}"/>`,
    ...bars,
    `<line class="end" x1="${x(end)}" x2="${x(end)}" y1="${T}" y2="${H - B}"/>`,
    `<line class="now" x1="${x(nowBlock)}" x2="${x(nowBlock)}" y1="${T}" y2="${H - B}"/>`,
    ...blockTicks.map(
      (b, i) =>
        `<text x="${x(b)}" y="${H - 12}" text-anchor="${["start", "middle", "end"][i]}">block ${b}</text>`,
    ),
  ].join("");
}

async function renderBids(d) {
  const exited = new Map(d.exits.map((log) => [log.args.bidId, log.args]));
  const claimed = new Set(d.claims.map((log) => log.args.bidId));
  const rows = await Promise.all(
    [...d.bids].reverse().map(async (log) => {
      const { id, owner, priceQ96, amount } = log.args;
      const account = await isAccount(owner);
      const exit = exited.get(id);
      const stateText = claimed.has(id)
        ? `<span class="tag good">claimed ${fmt(Number(formatUnits(exit?.tokensFilled ?? 0n, 18)))}</span>`
        : exit
          ? `<span class="tag">exited</span>`
          : `<span class="tag">open</span>`;
      return `<tr><td>${id}</td><td><a href="${CONFIG.explorer}/address/${owner}" target="_blank" rel="noopener">${short(owner)}</a> ${account ? '<span class="tag passkey">passkey</span>' : ""}</td><td class="num">${fmt(Number(formatUnits(amount, d.decimals)))} ${escape(d.currencySymbol)}</td><td class="num">${fmt(human(priceQ96, d.decimals))}</td><td class="num">${log.blockNumber}</td><td>${stateText}</td></tr>`;
    }),
  );
  $("bids").innerHTML = rows.join("") || `<tr><td colspan="6" class="empty">No bids yet.</td></tr>`;
}

/** pool · soon · live · ended (graduated, not yet settled) · failed (ended below its required raise). */
const phaseOf = (d) =>
  d.sqrtPriceX96 > 0n ? "pool" : d.latest < d.start ? "soon" : d.latest <= d.end ? "live" : d.graduated ? "ended" : "failed";

async function renderPool(d) {
  if (d.sqrtPriceX96 === 0n) {
    $("pool").innerHTML = `<p class="empty">${{
      soon: "The pool opens if the auction ends having raised enough, once it is settled.",
      live: "The pool opens if the auction ends having raised enough, once it is settled.",
      ended: "The auction has ended; the pool opens when it is settled (anyone may call graduate).",
      failed: "The auction ended below its required raise, so it will not graduate and no pool will open. Every bid exits with a full refund.",
    }[phaseOf(d)]}</p>`;
    return;
  }
  const raw = (d.sqrtPriceX96 * d.sqrtPriceX96 * 10n ** 18n) >> 192n;
  const tokenIsZero = lower(d.key.currency0) === lower(d.world.token);
  const perToken = Number(formatUnits(tokenIsZero ? raw : 10n ** 36n / raw, d.decimals));
  const [owedCurrency, owedToken] = await Promise.all([
    client.readContract({ address: CONFIG.hook, abi: hookAbi, functionName: "owed", args: [d.world.token, d.currency] }),
    client.readContract({ address: CONFIG.hook, abi: hookAbi, functionName: "owed", args: [d.world.token, d.world.token] }),
  ]);
  $("pool").innerHTML = `<dl>
    <dt>Pool price</dt><dd class="big">${fmt(perToken)} <small>${escape(d.currencySymbol)}/${escape(d.tokenSymbol)}</small></dd>
    <dt>Uniswap v4</dt><dd>fee 0.30% · hook <a href="${CONFIG.explorer}/address/${CONFIG.hook}" target="_blank" rel="noopener">${short(CONFIG.hook)}</a> (1% royalty, 50/30/20 up the line)</dd>
    <dt>Royalties owed</dt><dd>${fmt(Number(formatUnits(owedToken, 18)))} ${escape(d.tokenSymbol)} + ${fmt(Number(formatUnits(owedCurrency, d.decimals)))} ${escape(d.currencySymbol)} → paid to ${short(d.owner)}, the ENS holder</dd>
    <dt>Pool id</dt><dd>${d.poolId.slice(0, 18)}…</dd>
  </dl>`;
}

function renderLinks(d) {
  const link = (label, address) => `<li><span>${label}</span><a href="${CONFIG.explorer}/address/${address}" target="_blank" rel="noopener">${address}</a></li>`;
  $("links").innerHTML = [
    link("World token", d.world.token),
    link("Continuous Clearing Auction", d.world.auction),
    link("LineageRegistry (ENSv2 registrar + launcher)", CONFIG.registry),
    link("LineageHook (Uniswap v4)", CONFIG.hook),
    link("LineageRouter", CONFIG.router),
    link("PasskeyAccountFactory", CONFIG.accounts),
  ].join("");
}

let busy = false;
async function refresh() {
  if (busy) return;
  busy = true;
  try {
    const latest = await client.getBlockNumber();
    $("chain").dataset.live = "yes";
    $("chain-text").textContent = `Sepolia · block ${latest}`;
    if (state.worlds.length === 0 || latest % 5n === 0n) await loadWorlds(latest);
    const world = state.worlds.find((w) => lower(w.token) === lower($("world").value));
    if (!world) {
      $("world-name").textContent = "No world has been launched yet.";
      return;
    }
    const d = await loadWorld(world, latest);
    renderBoard(d);
    renderChart(d);
    renderLinks(d);
    await Promise.all([renderBids(d), renderPool(d)]);
    renderTree();
    $("error").hidden = true;
  } catch (cause) {
    $("chain").dataset.live = "no";
    $("error").hidden = false;
    $("error").textContent = `Could not read Sepolia: ${cause?.shortMessage ?? cause?.message ?? cause}. Retrying on the next block.`;
  } finally {
    busy = false;
  }
}

$("parent-name").textContent = CONFIG.parent;
$("world").addEventListener("change", () => {
  const world = state.worlds.find((w) => lower(w.token) === lower($("world").value));
  if (world) history.replaceState(null, "", `#${world.name.split(".")[0]}`);
  refresh();
});
$("tree").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-token]");
  if (!button) return;
  $("world").value = button.dataset.token;
  $("world").dispatchEvent(new Event("change"));
});
refresh();
setInterval(refresh, 12_000);
