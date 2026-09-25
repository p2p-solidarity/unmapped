// The lineage market on Sepolia (contracts/src/lineage). Run it yourself — the live mode spends gas:
//
//   bun run lineage:market [label] --dry-run                # deploy + a whole market day, nothing sent
//   UNWRITTEN_PRIVATE_KEY=0x… bun run lineage:market <label>   # deploy; worlds live under <label>.eth
//
// Live: deploys LineageRegistry (which makes its own resolver and root registry), LineageHook
// (CREATE2, address mined for its permission bits) and LineageRouter, then registers <label>.eth
// pointing at the registry's root — or repoints it, if the key already owns it. Use a label of its
// own: cartridge names from `ens:setup` live under a different parent. The dry run does the same on a
// fresh label, then launches `zelda`, its remix `mushroom` and that one's remix `night`, bids in each
// Continuous Clearing Auction, graduates them into v4 pools, buys down the line, hands a name on,
// claims royalties and sells back — all as simulated blocks on top of Sepolia's real contracts.
//
// Ways the market can fail, each one checked below (the failures an app E2E cannot reach, Rule 0):
// 1. On-chain encoding: LBPStrategy / the CCA factory decode a launch differently (struct layout,
//    step packing, salt), so the auction is not where the registry says or never becomes a pool.
// 2. The hook's address does not carry exactly its permission bits, so v4 refuses to use it.
// 3. A lineage can be faked: a pool opened under the hook by anyone but the graduation, or a world
//    paired with a currency that is not its parent's.
// 4. Silent loss: royalties that do not add up to 1% of each hop, land on the wrong world, or are
//    paid to someone other than whoever holds the world's ENS name now (it changes hands).
// 5. The name tree and the market disagree: `mushroom.zelda.<parent>` does not resolve to the token
//    the registry launched.
// 6. Someone who does not hold a world's name revises it.
// 7. A world's name is not an emancipated ENSv2 token, so it cannot be transferred safely and some
//    root role could still take it back or repoint it.

import { config as loadEnv } from "dotenv";
import {
  type Abi,
  type Address,
  createPublicClient,
  decodeFunctionResult,
  encodeDeployData,
  formatUnits,
  type Hex,
  http,
  keccak256,
  type Log,
  maxUint256,
  type PublicClient,
  parseEventLogs,
  parseUnits,
  toHex,
  zeroAddress,
} from "viem";
import { sepolia } from "viem/chains";
import {
  ENSV2_SEPOLIA,
  registryAbi as ensRegistryAbi,
  textProfileAbi,
  textQuery,
  universalResolverAbi,
  usdcAbi,
} from "../src/main/chain/ensCalls";
import {
  auctionPrices,
  ccaAbi,
  create2,
  ensRegistryAbiEmancipation,
  erc20Abi,
  erc1155Abi,
  lbpStrategyAbi,
  lineageHook,
  lineageRegistry,
  lineageRouter,
  mineHook,
  type PoolKey,
  permit2Abi,
  poolId,
  poolManagerAbi,
  registryInitCode,
  stateViewAbi,
  UNISWAP_SEPOLIA,
} from "../src/main/chain/lineageCalls";
import { call, dryExec, expectRevert, liveExec, read } from "./lib/chainExec";
import { checkEnsDeployment, pointDotEth } from "./lib/ensParent";

loadEnv({ quiet: true });
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const label =
  args.find((arg) => !arg.startsWith("--"))?.toLowerCase() ??
  (dryRun ? `lineage-${Date.now().toString().slice(-6)}` : undefined);
if (label === undefined || !/^[a-z0-9-]{3,63}$/.test(label)) {
  process.stderr.write("Usage: bun run lineage:market <label> [--dry-run]   (label: a-z 0-9 -)\n");
  process.exit(1);
}
const parentName = `${label}.eth`;
const rpcUrl = process.env.UNWRITTEN_ENS_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl) }) as PublicClient;
const say = (line: string) => process.stdout.write(`${line}\n`);
const registryAbi = lineageRegistry.abi;
const hookAbi = lineageHook.abi;

const key = process.env.UNWRITTEN_PRIVATE_KEY;
if (!dryRun && !key) {
  process.stderr.write(
    "Set UNWRITTEN_PRIVATE_KEY (a Sepolia key with test ETH), or pass --dry-run.\n",
  );
  process.exit(1);
}
const exec = dryRun ? dryExec(client) : liveExec(client, key as Hex, rpcUrl);
say(`${dryRun ? "Dry run of" : "Deploying"} the lineage market on Sepolia as ${exec.account}`);
await checkEnsDeployment(client);

// ── Deploy: registry, hook (mined address), router ─────────────────────────────────────────────
const salt = keccak256(toHex(`unwritten.lineage:${exec.account}`));
const registry = create2(
  registryInitCode([
    UNISWAP_SEPOLIA.lbpStrategy,
    UNISWAP_SEPOLIA.ccaFactory,
    ENSV2_SEPOLIA.verifiableFactory,
    ENSV2_SEPOLIA.userRegistryImpl,
    ENSV2_SEPOLIA.permissionedResolverImpl,
    ENSV2_SEPOLIA.mockUsdc,
    ENSV2_SEPOLIA.ethRegistry,
    label,
    exec.account,
  ]),
  salt,
);
// A live deploy can be re-run after a failure: whatever is already on chain is left as it is.
async function deployOnce(what: string, request: { to: Address; data: Hex; address: Address }) {
  const code = dryRun ? undefined : await client.getCode({ address: request.address });
  if (code !== undefined && code !== "0x") {
    say(`  · ${what} already at ${request.address}`);
    return;
  }
  await exec.send({ to: request.to, data: request.data }, `deploy ${what}`);
}

await deployOnce("LineageRegistry", registry);
const hook = mineHook([UNISWAP_SEPOLIA.poolManager, UNISWAP_SEPOLIA.lbpStrategy, registry.address]);
say(`  hook salt ${BigInt(hook.salt)} → ${hook.address}`);
await deployOnce("LineageHook", create2(hook.initCode, hook.salt));
const router = create2(
  encodeDeployData({
    abi: lineageRouter.abi,
    bytecode: lineageRouter.bytecode,
    args: [UNISWAP_SEPOLIA.poolManager, registry.address],
  }),
  salt,
);
await deployOnce("LineageRouter", router);
const currentHook = (await read(exec, registry.address, registryAbi, "hook", [])) as Address;
if (currentHook === zeroAddress) {
  await exec.send(call(registry.address, registryAbi, "setHook", [hook.address]), "set the hook");
} else if (currentHook.toLowerCase() !== hook.address.toLowerCase()) {
  throw new Error(`the registry's hook is ${currentHook}, not ${hook.address}`);
}
const rootRegistry = (await read(
  exec,
  registry.address,
  registryAbi,
  "rootRegistry",
  [],
)) as Address;
const resolver = (await read(exec, registry.address, registryAbi, "resolver", [])) as Address;
const pointed = (await read(
  exec,
  ENSV2_SEPOLIA.ethRegistry,
  ensRegistryAbi as Abi,
  "getSubregistry",
  [label],
)) as Address;
if (pointed.toLowerCase() === rootRegistry.toLowerCase()) {
  say(`  · ${parentName} already points at the registry's root`);
} else {
  await pointDotEth(exec, label, rootRegistry, resolver);
}

if (!dryRun) {
  say("\n# add to .env:");
  say(`UNWRITTEN_LINEAGE_PARENT=${parentName}`);
  say(`UNWRITTEN_LINEAGE_REGISTRY=${registry.address}`);
  say(`UNWRITTEN_LINEAGE_HOOK=${hook.address}`);
  say(`UNWRITTEN_LINEAGE_ROUTER=${router.address}`);
  process.exit(0);
}

// ── A market day (dry run only) ────────────────────────────────────────────────────────────────
const me = exec.account;
const usdc = ENSV2_SEPOLIA.mockUsdc;

interface Launched {
  label: string;
  token: Address;
  auction: Address;
  currency: Address;
}

async function launch(
  label: string,
  parentToken: Address,
  currency: Address,
  floor: { price: [bigint, bigint]; currencyDecimals: number },
  requiredCurrencyRaised: bigint,
): Promise<Launched> {
  const prices = auctionPrices(floor.price[0], floor.price[1], floor.currencyDecimals, 18);
  const logs = await exec.send(
    call(registry.address, registryAbi, "launch", [
      {
        label,
        parent: parentToken,
        owner: me,
        cartridgeId: `${label}-dry-run`,
        version: "1",
        contentHash: keccak256(toHex(label)),
        supply: parseUnits("1000000", 18),
        lpReserve: parseUnits("500000", 18),
        auctionBlocks: 10n,
        floorPriceQ96: prices.floorPriceQ96,
        tickSpacingQ96: prices.tickSpacingQ96,
        requiredCurrencyRaised,
      },
    ]),
    `launch ${label}`,
  );
  const [event] = parseEventLogs({
    abi: registryAbi,
    eventName: "WorldLaunched",
    logs,
  }) as unknown as {
    args: { token: Address; auction: Address };
  }[];
  if (event === undefined) throw new Error(`launch ${label}: no WorldLaunched event`);
  say(`    ${label}: token ${event.args.token}, auction ${event.args.auction}`);
  return { label, token: event.args.token, auction: event.args.auction, currency };
}

/** Bids `amount` of the world's currency at 10 ticks above the floor; returns the bid id. */
async function bid(world: Launched, amount: bigint, floorPriceQ96: bigint, tick: bigint) {
  await exec.send(
    call(world.currency, erc20Abi, "approve", [UNISWAP_SEPOLIA.permit2, maxUint256]),
    "approve Permit2",
  );
  await exec.send(
    call(UNISWAP_SEPOLIA.permit2, permit2Abi, "approve", [
      world.currency,
      world.auction,
      amount,
      2n ** 48n - 1n,
    ]),
    `let ${world.label}'s auction pull the bid`,
  );
  const logs = await exec.send(
    call(world.auction, ccaAbi, "submitBid", [floorPriceQ96 + 10n * tick, amount, me, "0x"]),
    `bid in ${world.label}'s auction`,
  );
  const [event] = parseEventLogs({ abi: ccaAbi, eventName: "BidSubmitted", logs });
  if (event === undefined) throw new Error("no BidSubmitted event");
  return event.args.id;
}

/** Ends the auction, collects the bid's tokens and moves the auction into its v4 pool. */
async function graduate(world: Launched, bidId: bigint, decimals: number): Promise<PoolKey> {
  const end = (await read(exec, world.auction, ccaAbi, "endBlock", [])) as bigint;
  await exec.mineTo(end + 1n);
  const clearing = (await read(exec, world.auction, ccaAbi, "clearingPrice", [])) as bigint;
  const held = await balance(world.token);
  await exec.send(call(world.auction, ccaAbi, "exitBid", [bidId]), `exit the ${world.label} bid`);
  await exec.send(call(world.auction, ccaAbi, "claimTokens", [bidId]), `claim ${world.label}`);
  const filled = (await balance(world.token)) - held;
  const logs: Log[] = await exec.send(
    call(registry.address, registryAbi, "graduate", [world.token]),
    `graduate ${world.label} into its v4 pool`,
  );
  const failed = parseEventLogs({ abi: lbpStrategyAbi, eventName: "MigrationFailed", logs });
  if (failed.length > 0)
    throw new Error(`${world.label} migration failed: ${failed[0]?.args.reason}`);
  if (parseEventLogs({ abi: lbpStrategyAbi, eventName: "Migrated", logs }).length === 0) {
    throw new Error(`${world.label}: no Migrated event`);
  }
  const key = (await read(exec, registry.address, registryAbi, "poolKeyOf", [
    world.token,
  ])) as PoolKey;
  const [sqrtPriceX96] = (await read(exec, UNISWAP_SEPOLIA.stateView, stateViewAbi, "getSlot0", [
    poolId(key),
  ])) as [bigint];
  const owner = (await read(exec, hook.address, hookAbi, "worldOf", [poolId(key)])) as Address;
  if (owner.toLowerCase() !== world.token.toLowerCase())
    throw new Error("hook does not know the pool");
  say(
    `    ${world.label}: cleared at ${humanPrice(clearing, decimals)} per token, bid filled ${formatUnits(filled, 18)}; pool sqrtPriceX96 ${sqrtPriceX96}; hook maps pool → world ✓`,
  );
  return key;
}

/** A Q96 auction price (currency per token, raw units) in whole currency per whole token. */
function humanPrice(priceQ96: bigint, currencyDecimals: number): string {
  return formatUnits((priceQ96 * 10n ** 18n) >> 96n, currencyDecimals);
}

async function balance(token: Address): Promise<bigint> {
  return (await read(exec, token, erc20Abi, "balanceOf", [me])) as bigint;
}

async function text(name: string, key: string): Promise<string> {
  const query = textQuery(name, key);
  const [result] = (await read(
    exec,
    sepolia.contracts.ensUniversalResolver.address,
    universalResolverAbi as Abi,
    "resolve",
    [query.name, query.data],
  )) as [Hex, Address];
  return decodeFunctionResult({ abi: textProfileAbi, functionName: "text", data: result });
}

say("\nMarket day");
await exec.send(
  call(usdc, usdcAbi as Abi, "mint", [me, parseUnits("10000", 6)]),
  "mint 10,000 MockUSDC",
);

// zelda: first generation, priced in MockUSDC from 0.01 per token (check 1).
const zeldaPrices = auctionPrices(1n, 100n, 6, 18);
const zelda = await launch(
  "zelda",
  zeroAddress,
  usdc,
  { price: [1n, 100n], currencyDecimals: 6 },
  parseUnits("100", 6),
);
const zeldaBid = await bid(
  zelda,
  parseUnits("1000", 6),
  zeldaPrices.floorPriceQ96,
  zeldaPrices.tickSpacingQ96,
);
await graduate(zelda, zeldaBid, 6);
say(
  `    holds ${formatUnits(await balance(zelda.token), 18)} ZELDA (the fill, plus the LP reserve the pool did not need, which goes to the owner)`,
);

// mushroom: a remix of zelda, priced in ZELDA from 0.1 per token (checks 1, 5).
const mushroomPrices = auctionPrices(1n, 10n, 18, 18);
const mushroom = await launch(
  "mushroom",
  zelda.token,
  zelda.token,
  { price: [1n, 10n], currencyDecimals: 18 },
  parseUnits("10", 18),
);
const mushroomBid = await bid(
  mushroom,
  parseUnits("1000", 18),
  mushroomPrices.floorPriceQ96,
  mushroomPrices.tickSpacingQ96,
);
const mushroomKey = await graduate(mushroom, mushroomBid, 18);

const mushroomName = `mushroom.zelda.${parentName}`;
const resolvedToken = await text(mushroomName, "unwritten.token");
const resolvedHash = await text(mushroomName, "unwritten.hash");
say(`    ${mushroomName} → unwritten.token ${resolvedToken}, unwritten.hash ${resolvedHash}`);
if (resolvedToken.toLowerCase() !== mushroom.token.toLowerCase())
  throw new Error("the name tree and the market disagree");
if (resolvedHash !== `sha256:${keccak256(toHex("mushroom")).slice(2)}`)
  throw new Error("wrong hash record");

// Buy mushroom with MockUSDC through zelda (check 4).
await exec.send(
  call(usdc, erc20Abi, "approve", [router.address, maxUint256]),
  "approve the router",
);
const before = await balance(mushroom.token);
await exec.send(
  call(router.address, lineageRouter.abi, "buy", [mushroom.token, parseUnits("10", 6), 0n, me]),
  "buy mushroom with 10 MockUSDC (USDC → zelda → mushroom)",
);
const bought = (await balance(mushroom.token)) - before;
const owed = async (world: Address, currency: Address) =>
  (await read(exec, hook.address, hookAbi, "owed", [world, currency])) as bigint;
const zeldaOwedZelda = await owed(zelda.token, zelda.token);
const zeldaOwedMushroom = await owed(zelda.token, mushroom.token);
const mushroomOwedMushroom = await owed(mushroom.token, mushroom.token);
say(`    got ${formatUnits(bought, 18)} MUSHROOM`);
say(`    royalties: zelda ${formatUnits(zeldaOwedZelda, 18)} ZELDA (hop 1)`);
say(
  `               zelda ${formatUnits(zeldaOwedMushroom, 18)} + mushroom ${formatUnits(mushroomOwedMushroom, 18)} MUSHROOM (hop 2, 30 / 70)`,
);
const hop2 = zeldaOwedMushroom + mushroomOwedMushroom;
// The royalty is 1% of the hop's gross output, so it is 1/99 of what the buyer got (± rounding).
if (bought === 0n || zeldaOwedZelda === 0n)
  throw new Error("nothing bought or no royalty on hop 1");
if (hop2 * 99n > bought + 99n || hop2 * 99n < bought - 99n)
  throw new Error("hop 2 royalty is not 1%");
if (zeldaOwedMushroom !== (hop2 * 30n) / 100n) throw new Error("the parent's share is not 30%");

const zeldaBefore = await balance(zelda.token);
await exec.send(
  call(hook.address, hookAbi, "claim", [zelda.token, zelda.token]),
  "claim zelda's ZELDA royalty",
);
if ((await balance(zelda.token)) - zeldaBefore !== zeldaOwedZelda)
  throw new Error("claim paid the wrong amount");
say(`    zelda's ENS holder received ${formatUnits(zeldaOwedZelda, 18)} ZELDA`);

// Every registry in the tree is emancipated: no root role can repoint or take back a name (7).
const zeldaWorld = (await read(exec, registry.address, registryAbi, "worldOf", [zelda.token])) as {
  subregistry: Address;
};
for (const [what, at] of [
  [`${parentName} (first generation)`, rootRegistry],
  ["zelda's remixes", zeldaWorld.subregistry],
] as const) {
  if (!((await read(exec, at, ensRegistryAbiEmancipation, "isEmancipated", [])) as boolean)) {
    throw new Error(`the registry for ${what} is not emancipated`);
  }
  say(`    registry for ${what} is emancipated ✓`);
}

// The name is the royalty right: hand mushroom's name to someone else and its royalty follows (4).
const heir: Address = "0x000000000000000000000000000000000000bEEF";
const mushroomWorld = (await read(exec, registry.address, registryAbi, "worldOf", [
  mushroom.token,
])) as { entryRegistry: Address; labelId: bigint };
const nameState = (await read(
  exec,
  mushroomWorld.entryRegistry,
  ensRegistryAbi as Abi,
  "getState",
  [mushroomWorld.labelId],
)) as { tokenId: bigint };
await exec.send(
  call(mushroomWorld.entryRegistry, erc1155Abi, "safeTransferFrom", [
    me,
    heir,
    nameState.tokenId,
    1n,
    "0x",
  ]),
  `hand ${mushroomName} to ${heir}`,
);
const oldHolderBefore = await balance(mushroom.token);
await exec.send(
  call(hook.address, hookAbi, "claim", [mushroom.token, mushroom.token]),
  "claim mushroom's MUSHROOM royalty",
);
const heirGot = (await read(exec, mushroom.token, erc20Abi, "balanceOf", [heir])) as bigint;
if (heirGot !== mushroomOwedMushroom) throw new Error("the royalty did not follow the name");
if ((await balance(mushroom.token)) !== oldHolderBefore) throw new Error("the old holder was paid");
say(`    the new holder received ${formatUnits(heirGot, 18)} MUSHROOM; the old one nothing`);

// Sell back down the line (mushroom → zelda → MockUSDC).
await exec.send(
  call(mushroom.token, erc20Abi, "approve", [router.address, maxUint256]),
  "approve the router for MUSHROOM",
);
const usdcBefore = await balance(usdc);
await exec.send(
  call(router.address, lineageRouter.abi, "sell", [mushroom.token, parseUnits("1000", 18), 0n, me]),
  "sell 1,000 MUSHROOM (mushroom → zelda → MockUSDC)",
);
const usdcGot = (await balance(usdc)) - usdcBefore;
if (usdcGot === 0n) throw new Error("the sell returned nothing");
say(`    got ${formatUnits(usdcGot, 6)} MockUSDC`);

// Refusals (checks 3, 6).
// night: a remix of mushroom, so a buy is three hops and pays three generations (1, 4).
const nightPrices = auctionPrices(1n, 10n, 18, 18);
const night = await launch(
  "night",
  mushroom.token,
  mushroom.token,
  { price: [1n, 10n], currencyDecimals: 18 },
  parseUnits("10", 18),
);
const nightBid = await bid(
  night,
  parseUnits("1000", 18),
  nightPrices.floorPriceQ96,
  nightPrices.tickSpacingQ96,
);
await graduate(night, nightBid, 18);
const nightBefore = await balance(night.token);
await exec.send(
  call(router.address, lineageRouter.abi, "buy", [night.token, parseUnits("10", 6), 0n, me]),
  "buy night with 10 MockUSDC (USDC → zelda → mushroom → night)",
);
const nightBought = (await balance(night.token)) - nightBefore;
const [toGrandparent, toParent, toSelf] = await Promise.all([
  owed(zelda.token, night.token),
  owed(mushroom.token, night.token),
  owed(night.token, night.token),
]);
const hop3 = toGrandparent + toParent + toSelf;
say(`    got ${formatUnits(nightBought, 18)} NIGHT`);
say(
  `    hop 3 royalty: zelda ${formatUnits(toGrandparent, 18)} + mushroom ${formatUnits(toParent, 18)} + night ${formatUnits(toSelf, 18)} NIGHT (20 / 30 / 50)`,
);
if (hop3 * 99n > nightBought + 99n || hop3 * 99n < nightBought - 99n) {
  throw new Error("hop 3 royalty is not 1%");
}
if (toGrandparent !== (hop3 * 20n) / 100n || toParent !== (hop3 * 30n) / 100n) {
  throw new Error("the grandparent / parent shares are not 20% / 30%");
}

say("\nRefusals");
const stranger: Address = "0x000000000000000000000000000000000000dEaD";
const fakeKey: PoolKey = {
  ...mushroomKey,
  currency0: usdc < mushroom.token ? usdc : mushroom.token,
  currency1: usdc < mushroom.token ? mushroom.token : usdc,
};
await expectRevert(
  "a pool opened under the hook by anyone but LBPStrategy",
  exec.read(call(UNISWAP_SEPOLIA.poolManager, poolManagerAbi, "initialize", [fakeKey, 2n ** 96n])),
);
const faked = (await read(exec, registry.address, registryAbi, "worldOfPool", [
  fakeKey,
])) as Address;
if (faked !== zeroAddress) throw new Error("mushroom paired with USDC was taken for a world pool");
say("  ✓ refused: mushroom paired with MockUSDC is not a world pool");
await expectRevert(
  "a revision by someone who does not hold the name",
  exec.read(
    call(registry.address, registryAbi, "revise", [zelda.token, "2", keccak256("0x01")]),
    stranger,
  ),
);
await expectRevert(
  "a second zelda under the same parent",
  exec.read(
    call(registry.address, registryAbi, "launch", [
      {
        label: "zelda",
        parent: zeroAddress,
        owner: me,
        cartridgeId: "zelda-again",
        version: "1",
        contentHash: keccak256("0x02"),
        supply: parseUnits("1000000", 18),
        lpReserve: parseUnits("500000", 18),
        auctionBlocks: 10n,
        floorPriceQ96: zeldaPrices.floorPriceQ96,
        tickSpacingQ96: zeldaPrices.tickSpacingQ96,
        requiredCurrencyRaised: 1n,
      },
    ]),
  ),
);

say("\nDry run passed — nothing was sent.");
say(`# a live deploy would print UNWRITTEN_LINEAGE_* for ${parentName}`);
