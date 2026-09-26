// Live tools for the lineage market demo on Sepolia — the deployment `bun run lineage:market
// unmapped` made (UNWRITTEN_LINEAGE_* in .env). Every write is paid by UNWRITTEN_PRIVATE_KEY, the
// same relayer the app uses; bids come from passkey accounts. Add --dry-run to any command to
// simulate it on top of Sepolia's latest state instead of sending it.
//
//   bun run lineage:demo status [world]                 # every world, or one, with auction + pool
//   bun run lineage:demo launch <label> [--parent 0x…] [--blocks 250] [--floor 1/100]
//        [--required 10] [--cartridge id --version v --hash sha256:…] [--owner 0x…]
//   bun run lineage:demo seed-bids <world> [--count 3] [--usdc 40,30,20]  # software passkeys bid
//   bun run lineage:demo settle <world>                 # after the auction: exit, claim, graduate
//   bun run lineage:demo players                        # once: the `players.<root>` directory that
//                                                       # holds players' own names (src/main/chain/players.ts)
//
// Seed bidders are software passkeys (scripts/lib/softPasskey.ts) whose keys are kept in
// .cache/lineage/ so their accounts can act again; the app uses the player's real passkey.

import type { JsonWebKey } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { config as loadEnv } from "dotenv";
import {
  type Address,
  createPublicClient,
  formatUnits,
  type Hex,
  http,
  isAddress,
  maxUint256,
  namehash,
  type PublicClient,
  parseAbiItem,
  parseUnits,
  zeroAddress,
} from "viem";
import { sepolia } from "viem/chains";
import { ENSV2_SEPOLIA, usdcAbi } from "../src/main/chain/ensCalls";
import {
  type AccountCall,
  ccaAbi,
  contentHashBytes,
  erc20Abi,
  lineageRegistry,
  lineageRouter,
  type PoolKey,
  permit2Abi,
  poolId,
  stateViewAbi,
  UNISWAP_SEPOLIA,
} from "../src/main/chain/lineageCalls";
import { hashText } from "../src/shared/content-hash";
import { call, dryExec, type Exec, liveExec, read } from "./lib/chainExec";
import { humanPrice, type Launched, marketDay } from "./lib/marketDay";
import { accountOf, passkeyExecute } from "./lib/passkeyRelay";
import { type SoftPasskey, softPasskey } from "./lib/softPasskey";

loadEnv({ quiet: true });
const say = (line: string) => process.stdout.write(`${line}\n`);
const fail = (message: string): never => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const flag = (name: string): string | undefined => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
};
const positional = argv.filter(
  (arg, index) => !arg.startsWith("--") && !argv[index - 1]?.startsWith("--"),
);
const [command, subject] = positional;

const env = (name: string): Address => {
  const value = process.env[`UNWRITTEN_LINEAGE_${name}`];
  if (!value || !isAddress(value))
    return fail(`Set UNWRITTEN_LINEAGE_${name} (bun run lineage:market prints it).`);
  return value;
};
const registry = env("REGISTRY");
const hook = env("HOOK");
const router = env("ROUTER");
const accounts = env("ACCOUNTS");
const parentName = process.env.UNWRITTEN_LINEAGE_PARENT ?? "unmapped.eth";
const usdc = ENSV2_SEPOLIA.mockUsdc;
const rpcUrl = process.env.UNWRITTEN_ENS_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl) }) as PublicClient;
const key = process.env.UNWRITTEN_PRIVATE_KEY;
if (!dryRun && !key)
  fail("Set UNWRITTEN_PRIVATE_KEY (the relayer that pays gas), or pass --dry-run.");
const exec: Exec = dryRun ? dryExec(client) : liveExec(client, key as Hex, rpcUrl);
const day = marketDay(exec, registry, hook);
const TX = "https://sepolia.etherscan.io/tx/";

interface World {
  token: Address;
  parent: Address;
  currency: Address;
  auction: Address;
  label: string;
  name: string;
}

/** `\x05zelda\x08unmapped\x03eth\x00` → `zelda.unmapped.eth`. */
function dnsName(packet: Hex): string {
  const bytes = Buffer.from(packet.slice(2), "hex");
  const labels: string[] = [];
  for (let at = 0; at < bytes.length && bytes[at] !== 0; at += (bytes[at] ?? 0) + 1) {
    labels.push(bytes.subarray(at + 1, at + 1 + (bytes[at] ?? 0)).toString("utf8"));
  }
  return labels.join(".");
}

async function world(token: Address): Promise<World> {
  const w = (await read(exec, registry, lineageRegistry.abi, "worldOf", [token])) as {
    node: Hex;
    parent: Address;
    currency: Address;
    auction: Address;
  };
  const n = (await read(exec, registry, lineageRegistry.abi, "nameOf", [w.node])) as {
    label: string;
    dnsName: Hex;
  };
  return {
    token,
    parent: w.parent,
    currency: w.currency,
    auction: w.auction,
    label: n.label,
    name: dnsName(n.dnsName),
  };
}

const decimalsOf = (currency: Address) => (currency.toLowerCase() === usdc ? 6 : 18);
const symbolOf = async (token: Address) =>
  (await read(exec, token, erc20Abi, "symbol", [])) as string;

async function allWorlds(): Promise<Address[]> {
  const latest = await client.getBlockNumber();
  const from = BigInt(process.env.UNWRITTEN_LINEAGE_FROM_BLOCK ?? latest - 50_000n);
  const logs = await client.getLogs({
    address: registry,
    event: parseAbiItem(
      "event WorldLaunched(address indexed token, address indexed parent, address indexed owner, address auction, bytes dnsName)",
    ),
    fromBlock: from,
    toBlock: latest,
  });
  return logs.map((log) => log.args.token as Address);
}

async function status(token: Address): Promise<void> {
  const w = await world(token);
  const decimals = decimalsOf(w.currency);
  const [symbol, currencySymbol, start, end, clearing, bids, graduated, owner, now, raised] =
    await Promise.all([
      symbolOf(w.token),
      symbolOf(w.currency),
      read(exec, w.auction, ccaAbi, "startBlock", []) as Promise<bigint>,
      read(exec, w.auction, ccaAbi, "endBlock", []) as Promise<bigint>,
      read(exec, w.auction, ccaAbi, "clearingPrice", []) as Promise<bigint>,
      read(exec, w.auction, ccaAbi, "nextBidId", []) as Promise<bigint>,
      read(exec, w.auction, ccaAbi, "isGraduated", []) as Promise<boolean>,
      read(exec, registry, lineageRegistry.abi, "ownerOf", [w.token]) as Promise<Address>,
      exec.nextBlock(),
      read(exec, w.auction, ccaAbi, "currencyRaised", []) as Promise<bigint>,
    ]);
  say(`${w.name}  ($${symbol}, token ${w.token})`);
  say(`  owner (ENS holder) ${owner}; priced in $${currencySymbol}`);
  const phase =
    now < start
      ? `starts in ${start - now} blocks`
      : now <= end
        ? `LIVE — ${end - now + 1n} blocks left (~${((end - now + 1n) * 12n) / 60n} min), ends at block ${end}`
        : `ended at block ${end}`;
  say(`  auction ${w.auction}: ${phase}`);
  say(
    `  clearing ${humanPrice(clearing, decimals)} ${currencySymbol}/${symbol}; ${bids} bid(s); raised ${formatUnits(raised, decimals)} ${currencySymbol}; ${graduated ? "enough to graduate" : "not enough to graduate yet"}`,
  );
  const poolKey = (await read(exec, registry, lineageRegistry.abi, "poolKeyOf", [
    w.token,
  ])) as PoolKey;
  const [sqrtPriceX96] = (await read(exec, UNISWAP_SEPOLIA.stateView, stateViewAbi, "getSlot0", [
    poolId(poolKey),
  ])) as [bigint];
  if (sqrtPriceX96 === 0n) {
    say("  pool: not open yet (opens when the auction is settled)");
    return;
  }
  // v4 prices currency1 in currency0; flip it so it reads currency per world token.
  const raw = (sqrtPriceX96 * sqrtPriceX96 * 10n ** 18n) >> 192n;
  const tokenIsZero = poolKey.currency0.toLowerCase() === w.token.toLowerCase();
  const perToken = tokenIsZero ? raw : raw === 0n ? 0n : 10n ** 36n / raw;
  say(`  pool: ${formatUnits(perToken, decimals)} ${currencySymbol}/${symbol} (v4, hook ${hook})`);
}

async function launch(label: string): Promise<void> {
  const parent = (flag("parent") ?? zeroAddress) as Address;
  const currency = parent === zeroAddress ? usdc : parent;
  const [numerator, denominator] = (flag("floor") ?? (parent === zeroAddress ? "1/100" : "1/10"))
    .split("/")
    .map((part) => BigInt(part));
  const blocks = BigInt(flag("blocks") ?? "250");
  if (10_000_000n % blocks !== 0n)
    fail("--blocks must divide 10,000,000 (e.g. 50, 100, 250, 625).");
  const hash = flag("hash");
  const launched: Launched = await day.launch({
    label,
    parent,
    currency,
    owner: (flag("owner") ?? exec.account) as Address,
    price: [numerator ?? 1n, denominator ?? 100n],
    currencyDecimals: decimalsOf(currency),
    requiredCurrencyRaised: parseUnits(flag("required") ?? "10", decimalsOf(currency)),
    auctionBlocks: blocks,
    cartridgeId: flag("cartridge"),
    version: flag("version"),
    contentHash: hash === undefined ? undefined : contentHashBytes(hash),
  });
  await status(launched.token);
}

function loadBidders(label: string, count: number): SoftPasskey[] {
  const path = `.cache/lineage/bidders-${label}.json`;
  let saved: JsonWebKey[] = [];
  try {
    saved = JSON.parse(readFileSync(path, "utf8")) as JsonWebKey[];
  } catch {
    // First run for this world: make new keys.
  }
  const keys = Array.from({ length: count }, (_, index) => softPasskey(saved[index]));
  mkdirSync(".cache/lineage", { recursive: true });
  if (!dryRun) writeFileSync(path, JSON.stringify(keys.map((k) => k.privateJwk)), { mode: 0o600 });
  return keys;
}

/** Each bidder gets MockUSDC from the faucet, buys the currency if it is a world, then bids. */
async function seedBids(token: Address): Promise<void> {
  const w = await world(token);
  const count = Number(flag("count") ?? "3");
  // MockUSDC each bidder spends; demand above what the floor can sell pushes the clearing price up.
  const spends = (flag("usdc") ?? "40,30,20").split(",");
  const [floor, tick] = (await Promise.all([
    read(exec, w.auction, ccaAbi, "floorPrice", []),
    read(exec, w.auction, ccaAbi, "tickSpacing", []),
  ])) as [bigint, bigint];
  const decimals = decimalsOf(w.currency);
  for (const [index, bidder] of loadBidders(w.label, count).entries()) {
    const account = await accountOf(exec, accounts, bidder);
    const spend = parseUnits(spends[index % spends.length] ?? "10", 6);
    await exec.send(
      call(usdc, usdcAbi, "mint", [account, spend]),
      `faucet: ${formatUnits(spend, 6)} MockUSDC → ${account}`,
    );
    let amount = spend;
    if (w.currency.toLowerCase() !== usdc) {
      await passkeyExecute(
        exec,
        accounts,
        bidder,
        [
          { target: usdc, value: 0n, data: call(usdc, erc20Abi, "approve", [router, spend]).data },
          {
            target: router,
            value: 0n,
            data: call(router, lineageRouter.abi, "buy", [w.currency, spend, 0n, account]).data,
          },
        ],
        `bidder ${index + 1} buys $${await symbolOf(w.currency)} with ${formatUnits(spend, 6)} MockUSDC`,
      );
      amount = await day.balance(w.currency, account);
    }
    // A generous ceiling (5× the floor, on a tick) keeps the bid above the final clearing price, so
    // it settles with a plain exitBid.
    const ceiling = ((floor * 5n) / tick) * tick;
    const calls: AccountCall[] = [
      {
        target: w.currency,
        value: 0n,
        data: call(w.currency, erc20Abi, "approve", [UNISWAP_SEPOLIA.permit2, maxUint256]).data,
      },
      {
        target: UNISWAP_SEPOLIA.permit2,
        value: 0n,
        data: call(UNISWAP_SEPOLIA.permit2, permit2Abi, "approve", [
          w.currency,
          w.auction,
          amount,
          2n ** 48n - 1n,
        ]).data,
      },
      {
        target: w.auction,
        value: 0n,
        data: call(w.auction, ccaAbi, "submitBid", [ceiling, amount, account, "0x"]).data,
      },
    ];
    await passkeyExecute(
      exec,
      accounts,
      bidder,
      calls,
      `bidder ${index + 1} bids ${formatUnits(amount, decimals)} (passkey-signed)`,
    );
  }
  await status(token);
}

async function settle(token: Address): Promise<void> {
  const w = await world(token);
  const end = (await read(exec, w.auction, ccaAbi, "endBlock", [])) as bigint;
  const next = await exec.nextBlock();
  if (next <= end)
    fail(
      `${w.name}'s auction ends at block ${end} (~${((end - next + 1n) * 12n) / 60n} min from now).`,
    );
  const bids = (await read(exec, w.auction, ccaAbi, "nextBidId", [])) as bigint;
  for (let id = 0n; id < bids; id++) {
    for (const step of ["exitBid", "claimTokens"] as const) {
      const request = call(w.auction, ccaAbi, step, [id]);
      try {
        await exec.read(request);
      } catch (cause) {
        say(
          `  · bid ${id}: ${step} not possible now (${String(cause).split("\n")[0]?.slice(0, 120)})`,
        );
        continue;
      }
      await exec.send(request, `${step} bid ${id}`);
    }
  }
  const poolKey = (await read(exec, registry, lineageRegistry.abi, "poolKeyOf", [
    w.token,
  ])) as PoolKey;
  const [sqrtPriceX96] = (await read(exec, UNISWAP_SEPOLIA.stateView, stateViewAbi, "getSlot0", [
    poolId(poolKey),
  ])) as [bigint];
  if (sqrtPriceX96 === 0n) {
    await exec.send(
      call(registry, lineageRegistry.abi, "graduate", [w.token]),
      `graduate ${w.name}`,
    );
  }
  await status(token);
}

/**
 * `players.<root>`: the directory players' own names hang under (`<label>.players.<root>`, each
 * recorded by the player's passkey account with recordSave). Held by the operator, who never
 * launches it; its records say what it is, since the registry has no player kind of its own.
 */
async function players(): Promise<void> {
  const rootNode = (await read(exec, registry, lineageRegistry.abi, "rootNode", [])) as Hex;
  const name = `players.${parentName}`;
  const description = `Player names of UNMAPPED: <you>.${name}, held by each player's passkey account.`;
  await exec.send(
    call(registry, lineageRegistry.abi, "register", [
      {
        parent: rootNode,
        label: "players",
        owner: exec.account,
        cartridgeId: "unmapped-players",
        version: "1",
        contentHash: contentHashBytes(await hashText(description)),
      },
    ]),
    `register ${name}`,
  );
  await exec.send(
    call(registry, lineageRegistry.abi, "describe", [namehash(name), description]),
    `describe ${name}`,
  );
}

const target = subject as Address | undefined;
switch (command) {
  case "status":
    if (target !== undefined) await status(target);
    else for (const token of await allWorlds()) await status(token);
    break;
  case "launch":
    if (!subject) fail("Usage: bun run lineage:demo launch <label> [...]");
    await launch(subject as string);
    break;
  case "seed-bids":
    if (!target || !isAddress(target)) fail("Usage: bun run lineage:demo seed-bids <world token>");
    await seedBids(target as Address);
    break;
  case "settle":
    if (!target || !isAddress(target)) fail("Usage: bun run lineage:demo settle <world token>");
    await settle(target as Address);
    break;
  case "players":
    await players();
    break;
  default:
    fail(
      "Commands: status [world] | launch <label> | seed-bids <world> | settle <world> | players",
    );
}
say(dryRun ? "\n(dry run — nothing was sent)" : `\n(parent ${parentName}; transactions on ${TX})`);
