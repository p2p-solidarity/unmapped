// What the gas station will pay for, and how. Every request becomes at most one transaction that
// this file builds itself from the request's kind, checks against Sepolia, and sends from the
// station's own key (RELAYER_KEY, a Cloudflare secret; nothing else holds it):
//
//   execute    a passkey-signed batch through PasskeyAccountFactory.execute. The account checks the
//              signature on chain, so the station can neither change nor replay it; the station
//              only makes sure every call targets the market (MockUSDC, Permit2, the router, a
//              world's token or a world's auction, or the registry to name a cartridge, record
//              the player's own save or player name, or launch a name the account holds) and
//              carries no ETH. A launch deploys a token and an auction (~5M gas), so a batch with
//              one gets its own gas cap and a lower fee ceiling (MAX_LAUNCH_FEE_GWEI), alone.
//   faucet     1,000 MockUSDC to a passkey account that holds less than 2,000.
//   exit/claim a bid of a world's auction (open to anyone once the auction ends).
//   graduate   a world's auction into its Uniswap v4 pool (open to anyone).
//   royalties  a world's royalties to its ENS name holder (open to anyone).
//
// Nothing is sent unless it simulates cleanly within the kind's gas cap and the fee is under
// MAX_FEE_GWEI, so a refused or malformed request costs nothing.

import {
  type Address,
  BaseError,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  type Hex,
  http,
  type PublicClient,
  parseAbi,
  parseGwei,
  toFunctionSelector,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import type { RelayAnswer, RelayRequest } from "../shared/relay";

export interface RelayEnv {
  /** The station's key (secret). Without it the station answers `relay-no-key`. */
  RELAYER_KEY?: string;
  RPC_URL: string;
  REGISTRY: string;
  HOOK: string;
  ROUTER: string;
  ACCOUNTS: string;
  USDC: string;
  PERMIT2: string;
  MAX_FEE_GWEI?: string;
  /** Launches cost ~5M gas; above this fee (default 5 gwei) the station waits instead. */
  MAX_LAUNCH_FEE_GWEI?: string;
}

const FAUCET_AMOUNT = 1_000n * 10n ** 6n;
const FAUCET_CEILING = 2_000n * 10n ** 6n;
/** A batch that launches a world: one call, the launch itself (LineageRegistry.launch). */
const LAUNCH_GAS_CAP = 7_000_000n;
const GAS_CAP: Record<RelayRequest["kind"], bigint> = {
  execute: 1_500_000n,
  faucet: 150_000n,
  exit: 400_000n,
  claim: 250_000n,
  graduate: 1_500_000n,
  royalties: 250_000n,
};

const factoryAbi = parseAbi([
  "function accountOf(bytes32 qx, bytes32 qy) view returns (address)",
  "function execute(bytes32 qx, bytes32 qy, (address target, uint256 value, bytes data)[] calls, uint256 deadline, (bytes32 r, bytes32 s, uint256 challengeIndex, uint256 typeIndex, bytes authenticatorData, string clientDataJSON) auth)",
]);
const registryAbi = parseAbi([
  "function worldOf(address token) view returns ((bytes32 node, address parent, address currency, address auction))",
  "function graduate(address token)",
]);
const LAUNCH = toFunctionSelector(
  "function launch(bytes32 node, (uint128 supply, uint128 lpReserve, uint64 auctionBlocks, uint256 floorPriceQ96, uint256 tickSpacingQ96, uint128 requiredCurrencyRaised) lp)",
);
/** What a passkey batch may ask of the registry: naming cartridges, its own saves and player name,
 * and launching a name it holds (the registry itself refuses anyone but the holder). */
const REGISTRY_CALLS = new Set([
  LAUNCH,
  ...[
    "function register((bytes32 parent, string label, address owner, string cartridgeId, string version, bytes32 contentHash))",
    "function revise(bytes32 node, string version, bytes32 contentHash)",
    "function recordSave((bytes32 cartridge, string label, string version, bytes32 contentHash, bytes32 saveHash, string progress))",
    "function updateSave(bytes32 node, string version, bytes32 contentHash, bytes32 saveHash, string progress)",
    "function describe(bytes32 node, string description)",
  ].map((signature) => toFunctionSelector(signature)),
]);
const auctionAbi = parseAbi([
  "function token() view returns (address)",
  "function exitBid(uint256 bidId)",
  "function claimTokens(uint256 bidId)",
]);
const hookAbi = parseAbi([
  "function owed(address world, address currency) view returns (uint256)",
  "function claim(address world, address currency) returns (uint256)",
]);
const usdcAbi = parseAbi([
  "function balanceOf(address holder) view returns (uint256)",
  "function mint(address to, uint256 amount)",
]);

interface Station {
  env: RelayEnv;
  public: PublicClient;
  wallet: WalletClient;
  relayer: Address;
}

export const refuse = (code: string, message: string, hint?: string): RelayAnswer => ({
  ok: false,
  code,
  message,
  ...(hint === undefined ? {} : { hint }),
});

export function station(env: RelayEnv): Station | null {
  if (!env.RELAYER_KEY || !/^0x[0-9a-fA-F]{64}$/.test(env.RELAYER_KEY.trim())) return null;
  const account = privateKeyToAccount(env.RELAYER_KEY.trim() as Hex);
  const transport = http(env.RPC_URL);
  return {
    env,
    public: createPublicClient({ chain: sepolia, transport }) as PublicClient,
    wallet: createWalletClient({ account, chain: sepolia, transport }),
    relayer: account.address,
  };
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

async function worldOf(
  s: Station,
  token: Address,
): Promise<{ auction: Address; currency: Address } | null> {
  try {
    const w = await s.public.readContract({
      address: s.env.REGISTRY as Address,
      abi: registryAbi,
      functionName: "worldOf",
      args: [token],
    });
    return { auction: w.auction, currency: w.currency };
  } catch {
    return null; // UnknownWorld
  }
}

/** A call a passkey batch may make on the station's gas: only the market's own contracts. */
async function marketTarget(s: Station, target: Address, data: Hex): Promise<boolean> {
  const { USDC, PERMIT2, ROUTER, REGISTRY } = s.env;
  if (same(REGISTRY, target)) return REGISTRY_CALLS.has(data.slice(0, 10) as Hex);
  if ([USDC, PERMIT2, ROUTER].some((known) => same(known, target))) return true;
  if ((await worldOf(s, target)) !== null) return true; // a world's token
  try {
    const token = await s.public.readContract({
      address: target,
      abi: auctionAbi,
      functionName: "token",
    });
    const world = await worldOf(s, token);
    return world !== null && same(world.auction, target); // a world's auction
  } catch {
    return false;
  }
}

function reason(cause: unknown): string {
  const text = cause instanceof BaseError ? cause.shortMessage : String(cause);
  return text.replace(/\s+/g, " ").slice(0, 300);
}

/** Estimates (a revert refuses), checks the caps, then signs and sends; never waits for a receipt. */
async function send(
  s: Station,
  kind: RelayRequest["kind"],
  to: Address,
  data: Hex,
  launch = false,
): Promise<RelayAnswer> {
  let gas: bigint;
  try {
    gas = await s.public.estimateGas({ account: s.relayer, to, data });
  } catch (cause) {
    return refuse(
      "relay-reverted",
      `Sepolia would refuse this: ${reason(cause)}`,
      "Refresh the market and try again.",
    );
  }
  const cap = launch ? LAUNCH_GAS_CAP : GAS_CAP[kind];
  if (gas > cap)
    return refuse(
      "relay-too-much-gas",
      `This needs ${gas} gas; the station pays up to ${cap} for a ${kind}.`,
    );
  const fees = await s.public.estimateFeesPerGas();
  const maxFee = parseGwei(
    launch ? (s.env.MAX_LAUNCH_FEE_GWEI ?? "5") : (s.env.MAX_FEE_GWEI ?? "30"),
  );
  if (fees.maxFeePerGas > maxFee) {
    return refuse(
      "relay-gas-price",
      "Sepolia gas is too expensive right now.",
      "Try again in a few minutes.",
    );
  }
  const padded = (gas * 6n) / 5n;
  try {
    const txHash = await s.wallet.sendTransaction({
      account: s.wallet.account ?? s.relayer,
      chain: sepolia,
      to,
      data,
      gas: padded > cap ? cap : padded,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    });
    return { ok: true, txHash };
  } catch (cause) {
    return refuse(
      "relay-send-failed",
      reason(cause),
      "The station may be out of Sepolia ETH; tell its operator.",
    );
  }
}

export async function sponsor(s: Station, r: RelayRequest): Promise<RelayAnswer> {
  const registry = s.env.REGISTRY as Address;
  switch (r.kind) {
    case "execute": {
      const launches = r.calls.filter(
        (c) => same(c.target, registry) && c.data.slice(0, 10).toLowerCase() === LAUNCH,
      ).length;
      if (launches > 0 && r.calls.length > 1) {
        return refuse("relay-refused", "A launch travels alone in its batch.");
      }
      for (const c of r.calls) {
        if (c.value !== "0") return refuse("relay-refused", "A market batch never sends ETH.");
        if (!(await marketTarget(s, c.target, c.data))) {
          return refuse("relay-refused", `${c.target} is not part of the lineage market.`);
        }
      }
      const data = encodeFunctionData({
        abi: factoryAbi,
        functionName: "execute",
        args: [
          r.qx,
          r.qy,
          r.calls.map((c) => ({ target: c.target, value: 0n, data: c.data })),
          BigInt(r.deadline),
          {
            ...r.auth,
            challengeIndex: BigInt(r.auth.challengeIndex),
            typeIndex: BigInt(r.auth.typeIndex),
          },
        ],
      });
      return send(s, r.kind, s.env.ACCOUNTS as Address, data, launches > 0);
    }
    case "faucet": {
      const account = await s.public.readContract({
        address: s.env.ACCOUNTS as Address,
        abi: factoryAbi,
        functionName: "accountOf",
        args: [r.qx, r.qy],
      });
      const held = await s.public.readContract({
        address: s.env.USDC as Address,
        abi: usdcAbi,
        functionName: "balanceOf",
        args: [account],
      });
      if (held >= FAUCET_CEILING) {
        return refuse(
          "market-faucet-full",
          "This account already has enough test USDC.",
          "Spend some first.",
        );
      }
      const data = encodeFunctionData({
        abi: usdcAbi,
        functionName: "mint",
        args: [account, FAUCET_AMOUNT],
      });
      return send(s, r.kind, s.env.USDC as Address, data);
    }
    case "exit":
    case "claim": {
      const world = await worldOf(s, r.world);
      if (world === null)
        return refuse("market-unknown-world", `${r.world} is not a world on this market.`);
      const data = encodeFunctionData({
        abi: auctionAbi,
        functionName: r.kind === "exit" ? "exitBid" : "claimTokens",
        args: [BigInt(r.bid)],
      });
      return send(s, r.kind, world.auction, data);
    }
    case "graduate": {
      if ((await worldOf(s, r.world)) === null) {
        return refuse("market-unknown-world", `${r.world} is not a world on this market.`);
      }
      const data = encodeFunctionData({
        abi: registryAbi,
        functionName: "graduate",
        args: [r.world],
      });
      return send(s, r.kind, registry, data);
    }
    case "royalties": {
      const world = await worldOf(s, r.world);
      if (world === null)
        return refuse("market-unknown-world", `${r.world} is not a world on this market.`);
      if (!same(r.currency, r.world) && !same(r.currency, world.currency)) {
        return refuse(
          "relay-refused",
          "Royalties are paid only in the world's token or its currency.",
        );
      }
      const owed = await s.public.readContract({
        address: s.env.HOOK as Address,
        abi: hookAbi,
        functionName: "owed",
        args: [r.world, r.currency],
      });
      if (owed === 0n) return refuse("market-nothing-owed", "This world has no royalties waiting.");
      const data = encodeFunctionData({
        abi: hookAbi,
        functionName: "claim",
        args: [r.world, r.currency],
      });
      return send(s, r.kind, s.env.HOOK as Address, data);
    }
  }
}
