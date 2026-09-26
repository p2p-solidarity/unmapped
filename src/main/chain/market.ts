// Main-side reads for the app's Market section: every world the LineageRegistry launched (ENSv2
// names), each world's Uniswap Continuous Clearing Auction and v4 pool, and — for a passkey's
// public key — the player's PasskeyAccount: its balances and bids. Config comes from
// UNWRITTEN_LINEAGE_* (printed by `bun run lineage:market`); the RPC stays in main (Rule 6). No key
// is read here: writes go through the gas station (./relayClient, UNWRITTEN_LINEAGE_RELAY). With
// nothing configured, every call answers `market-not-configured`.

import type {
  EnsNameStatus,
  MarketAccount,
  MarketConfig,
  MarketKey,
  MarketView,
  MarketWorld,
  SaveNameView,
} from "@shared/market";
import { err, ok, type Result, toError } from "@shared/result";
import {
  type Address,
  createPublicClient,
  formatUnits,
  type Hex,
  http,
  isAddress,
  type PublicClient,
  parseAbiItem,
} from "viem";
import { sepolia } from "viem/chains";
import { ENSV2_SEPOLIA } from "./ensCalls";
import {
  ccaAbi,
  erc20Abi,
  lineageHook,
  lineageRegistry,
  type PoolKey,
  passkeyAccountFactory,
  poolId,
  stateViewAbi,
  UNISWAP_SEPOLIA,
} from "./lineageCalls";
import { cartridgeNameView, type Dirs, saveNameView } from "./names";
import { relayUrl } from "./relayClient";

const DEFAULT_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const SETUP_HINT =
  "Run `bun run lineage:market <label>` and put the UNWRITTEN_LINEAGE_* lines it prints in .env.";
export const USDC = ENSV2_SEPOLIA.mockUsdc as Address;
const ZERO = "0x0000000000000000000000000000000000000000";

export interface Deployment {
  parent: string;
  registry: Address;
  hook: Address;
  router: Address;
  accounts: Address;
  fromBlock: bigint;
  /** The gas station's origin; null on a machine that can only read. */
  relay: string | null;
}

export interface MarketClients {
  deployment: Deployment;
  public: PublicClient;
}

export function deployment(env: NodeJS.ProcessEnv = process.env): Deployment | null {
  const address = (name: string) => env[`UNWRITTEN_LINEAGE_${name}`];
  const parts = [address("REGISTRY"), address("HOOK"), address("ROUTER"), address("ACCOUNTS")];
  const parent = env.UNWRITTEN_LINEAGE_PARENT?.trim().toLowerCase();
  if (!parent || !parts.every((part) => part !== undefined && isAddress(part))) return null;
  const [registry, hook, router, accounts] = parts as Address[];
  return {
    parent,
    registry: registry as Address,
    hook: hook as Address,
    router: router as Address,
    accounts: accounts as Address,
    fromBlock: BigInt(env.UNWRITTEN_LINEAGE_FROM_BLOCK ?? "11780564"),
    relay: relayUrl(env),
  };
}

export function marketConfig(env: NodeJS.ProcessEnv = process.env): MarketConfig {
  const found = deployment(env);
  return {
    parent: found?.parent ?? null,
    relayer: found?.relay != null,
  };
}

export function marketClients(env: NodeJS.ProcessEnv = process.env): Result<MarketClients> {
  const found = deployment(env);
  if (found === null) {
    return err(
      "market-not-configured",
      "No lineage market is configured on this machine.",
      SETUP_HINT,
    );
  }
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(env.UNWRITTEN_ENS_RPC_URL || DEFAULT_RPC),
    batch: { multicall: true },
  }) as PublicClient;
  return ok({ deployment: found, public: publicClient });
}

const launchedEvent = parseAbiItem(
  "event WorldLaunched(address indexed token, address indexed parent, address indexed owner, address auction, bytes dnsName)",
);
const bidEvent = parseAbiItem(
  "event BidSubmitted(uint256 indexed id, address indexed owner, uint256 priceQ96, uint128 amount)",
);
const exitedEvent = parseAbiItem(
  "event BidExited(uint256 indexed bidId, address indexed owner, uint256 tokensFilled, uint256 currencyRefunded)",
);
const claimedEvent = parseAbiItem(
  "event TokensClaimed(uint256 indexed bidId, address indexed owner, uint256 tokensFilled)",
);

/** `\x05zelda\x08unmapped\x03eth\x00` → `zelda.unmapped.eth`. */
export function dnsName(packet: Hex): string {
  const bytes = Buffer.from(packet.slice(2), "hex");
  const labels: string[] = [];
  for (let at = 0; at < bytes.length && bytes[at] !== 0; at += (bytes[at] ?? 0) + 1) {
    labels.push(bytes.subarray(at + 1, at + 1 + (bytes[at] ?? 0)).toString("utf8"));
  }
  return labels.join(".");
}

export const decimalsOf = (currency: string): number => (currency.toLowerCase() === USDC ? 6 : 18);

/** A Q96 auction price (currency per token, raw units) in whole currency per whole token. */
export function humanPrice(priceQ96: bigint, decimals: number): string {
  return formatUnits((priceQ96 * 10n ** 18n) >> 96n, decimals);
}

export interface LaunchedWorld {
  token: Address;
  parent: Address;
  auction: Address;
  name: string;
  block: bigint;
}

export async function launchedWorlds(c: MarketClients, latest: bigint): Promise<LaunchedWorld[]> {
  const logs = await c.public.getLogs({
    address: c.deployment.registry,
    event: launchedEvent,
    fromBlock: c.deployment.fromBlock,
    toBlock: latest,
  });
  return logs.map((log) => ({
    token: log.args.token as Address,
    parent: log.args.parent as Address,
    auction: log.args.auction as Address,
    name: dnsName(log.args.dnsName as Hex),
    block: log.blockNumber,
  }));
}

export const currencyOf = (world: LaunchedWorld): Address =>
  world.parent === ZERO ? USDC : world.parent;

async function readWorld(c: MarketClients, w: LaunchedWorld, latest: bigint): Promise<MarketWorld> {
  const currency = currencyOf(w);
  const decimals = decimalsOf(currency);
  const auction = (functionName: string) =>
    c.public.readContract({ address: w.auction, abi: ccaAbi, functionName } as never) as Promise<
      bigint | boolean
    >;
  const [start, end, clearing, floor, bids, raised, symbol, currencySymbol, owner, key] =
    await Promise.all([
      auction("startBlock"),
      auction("endBlock"),
      auction("clearingPrice"),
      auction("floorPrice"),
      auction("nextBidId"),
      auction("currencyRaised"),
      c.public.readContract({ address: w.token, abi: erc20Abi, functionName: "symbol" }),
      c.public.readContract({ address: currency, abi: erc20Abi, functionName: "symbol" }),
      c.public.readContract({
        address: c.deployment.registry,
        abi: lineageRegistry.abi,
        functionName: "ownerOf",
        args: [w.token],
      }) as Promise<Address>,
      c.public.readContract({
        address: c.deployment.registry,
        abi: lineageRegistry.abi,
        functionName: "poolKeyOf",
        args: [w.token],
      }) as Promise<PoolKey>,
    ]);
  const [sqrtPriceX96] = (await c.public.readContract({
    address: UNISWAP_SEPOLIA.stateView,
    abi: stateViewAbi,
    functionName: "getSlot0",
    args: [poolId(key)],
  })) as readonly [bigint, number, number, number];
  const owed = (currencyToken: Address) =>
    c.public.readContract({
      address: c.deployment.hook,
      abi: lineageHook.abi,
      functionName: "owed",
      args: [w.token, currencyToken],
    }) as Promise<bigint>;
  const [owedToken, owedCurrency] = await Promise.all([owed(w.token), owed(currency)]);
  const startBlock = start as bigint;
  const endBlock = end as bigint;
  let poolPrice: string | null = null;
  if (sqrtPriceX96 > 0n) {
    // v4 prices currency1 in currency0; flip it so it reads currency per world token.
    const raw = (sqrtPriceX96 * sqrtPriceX96 * 10n ** 18n) >> 192n;
    const tokenIsZero = key.currency0.toLowerCase() === w.token.toLowerCase();
    poolPrice = formatUnits(tokenIsZero ? raw : raw === 0n ? 0n : 10n ** 36n / raw, decimals);
  }
  return {
    token: w.token,
    name: w.name,
    parent: w.parent === ZERO ? null : w.parent,
    symbol,
    currencySymbol,
    phase:
      sqrtPriceX96 > 0n
        ? "pool"
        : latest < startBlock
          ? "soon"
          : latest <= endBlock
            ? "live"
            : "ended",
    blocksLeft: latest <= endBlock ? Number(endBlock - latest + 1n) : 0,
    clearing: humanPrice(clearing as bigint, decimals),
    floor: humanPrice(floor as bigint, decimals),
    raised: formatUnits(raised as bigint, decimals),
    bids: Number(bids),
    poolPrice,
    owner,
    owedToken: formatUnits(owedToken, 18),
    owedCurrency: formatUnits(owedCurrency, decimals),
  };
}

export async function accountAddress(c: MarketClients, key: MarketKey): Promise<Address> {
  return (await c.public.readContract({
    address: c.deployment.accounts,
    abi: passkeyAccountFactory.abi,
    functionName: "accountOf",
    args: [key.qx, key.qy],
  })) as Address;
}

async function readAccount(
  c: MarketClients,
  key: MarketKey,
  worlds: LaunchedWorld[],
  latest: bigint,
): Promise<MarketAccount> {
  const address = await accountAddress(c, key);
  const balance = (token: Address) =>
    c.public.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    }) as Promise<bigint>;
  const [code, usdc, ...amounts] = await Promise.all([
    c.public.getCode({ address }),
    balance(USDC),
    ...worlds.map((w) => balance(w.token)),
  ]);
  const symbols = await Promise.all(
    worlds.map(
      (w) =>
        c.public.readContract({
          address: w.token,
          abi: erc20Abi,
          functionName: "symbol",
        }) as Promise<string>,
    ),
  );
  const bids = (
    await Promise.all(
      worlds.map(async (w) => {
        const range = { address: w.auction, fromBlock: w.block, toBlock: latest };
        const [placed, exited, claimed] = await Promise.all([
          c.public.getLogs({ ...range, event: bidEvent, args: { owner: address } }),
          c.public.getLogs({ ...range, event: exitedEvent, args: { owner: address } }),
          c.public.getLogs({ ...range, event: claimedEvent, args: { owner: address } }),
        ]);
        const exits = new Set(exited.map((log) => log.args.bidId));
        const claims = new Set(claimed.map((log) => log.args.bidId));
        return placed.map((log) => ({
          world: w.token as string,
          id: String(log.args.id),
          amount: formatUnits(log.args.amount ?? 0n, decimalsOf(currencyOf(w))),
          state: claims.has(log.args.id)
            ? ("claimed" as const)
            : exits.has(log.args.id)
              ? ("exited" as const)
              : ("open" as const),
        }));
      }),
    )
  ).flat();
  return {
    address,
    deployed: code !== undefined && code !== "0x",
    usdc: formatUnits(usdc, 6),
    holdings: worlds
      .map((w, index) => ({
        token: w.token as string,
        symbol: symbols[index] ?? "",
        amount: formatUnits(amounts[index] ?? 0n, 18),
      }))
      .filter((holding) => holding.amount !== "0"),
    bids,
  };
}

export async function marketView(
  key: MarketKey | null,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Result<MarketView>> {
  const clients = marketClients(env);
  if (!clients.ok) return clients;
  const c = clients.value;
  try {
    const latest = await c.public.getBlockNumber();
    const launched = await launchedWorlds(c, latest);
    const [worlds, account] = await Promise.all([
      Promise.all(launched.map((w) => readWorld(c, w, latest))),
      key === null ? Promise.resolve(null) : readAccount(c, key, launched, latest),
    ]);
    return ok({ block: String(latest), worlds, account });
  } catch (cause) {
    return err(
      "market-unreachable",
      toError(cause, "market-unreachable").message,
      "Check the network connection (or UNWRITTEN_ENS_RPC_URL), then refresh.",
    );
  }
}

/** What a local cartridge revision's ENS name says, for this passkey's account (names.ts). */
export async function cartridgeName(
  cartridgeId: string,
  version: string,
  key: MarketKey | null,
  dirs: Dirs,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Result<EnsNameStatus>> {
  const clients = marketClients(env);
  if (!clients.ok) return clients;
  try {
    const account = key === null ? null : await accountAddress(clients.value, key);
    return await cartridgeNameView(clients.value, dirs, cartridgeId, version, account);
  } catch (cause) {
    return err("market-unreachable", toError(cause, "market-unreachable").message, "Refresh.");
  }
}

/** A local save, its cartridge's name and what its own ENS name says now (names.ts). */
export async function saveName(
  instanceId: string,
  label: string | null,
  key: MarketKey | null,
  dirs: Dirs,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Result<SaveNameView>> {
  const clients = marketClients(env);
  if (!clients.ok) return clients;
  try {
    const account = key === null ? null : await accountAddress(clients.value, key);
    return await saveNameView(clients.value, dirs, instanceId, label, account);
  } catch (cause) {
    return err("market-unreachable", toError(cause, "market-unreachable").message, "Refresh.");
  }
}
