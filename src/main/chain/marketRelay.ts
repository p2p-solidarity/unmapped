// The Market's writes. Main builds every batch a passkey signs (a bid or a buy, from a fixed shape —
// never calls the renderer names), keeps it for a few minutes under a random id, and once the
// passkey's assertion over its digest comes back, hands batch and signature to the gas station
// (./relayClient → src/relay), which pays the gas. The app holds no key: the account contract checks
// the passkey signature on chain, and the station builds every other transaction (faucet, settle,
// royalties) itself from a request's kind. Main waits for each receipt on its own RPC.

import { randomBytes } from "node:crypto";
import type {
  MarketAction,
  MarketKey,
  MarketReceipt,
  PreparedAction,
  SubmitActionInput,
} from "@shared/market";
import type { RelayRequest } from "@shared/relay";
import { err, ok, type Result, toError } from "@shared/result";
import { type Address, encodeFunctionData, type Hex, parseUnits } from "viem";
import { sepolia } from "viem/chains";
import { launchCalls } from "./launch";
import {
  type AccountCall,
  ccaAbi,
  erc20Abi,
  lineageHook,
  lineageRegistry,
  lineageRouter,
  type PoolKey,
  passkeyAccount,
  passkeyDigest,
  permit2Abi,
  poolId,
  stateViewAbi,
  UNISWAP_SEPOLIA,
} from "./lineageCalls";
import {
  accountAddress,
  currencyOf,
  decimalsOf,
  type LaunchedWorld,
  launchedWorlds,
  type MarketClients,
  marketClients,
  USDC,
} from "./market";
import { forgetNames } from "./nameIndex";
import { type Dirs, nameCartridgeCalls, nameSaveCalls } from "./names";
import { forgetPlayers, namePlayerCalls } from "./players";
import { relayed } from "./relayClient";

const PENDING_MS = 5 * 60_000;
const FAUCET_CEILING = 2_000n * 10n ** 6n;

interface Pending {
  key: MarketKey;
  calls: AccountCall[];
  deadline: bigint;
  challenge: `0x${string}`;
  created: number;
}

/** The digest a prepared batch waits to have signed; null once used or expired. */
export function pendingChallenge(id: string): `0x${string}` | null {
  const entry = pending.get(id);
  return entry === undefined || Date.now() - entry.created > PENDING_MS ? null : entry.challenge;
}
const pending = new Map<string, Pending>();

const call = (target: Address, data: Hex): AccountCall => ({ target, value: 0n, data });

type Relaying = MarketClients & { relay: string };

function relaying(env: NodeJS.ProcessEnv): Result<Relaying> {
  const clients = marketClients(env);
  if (!clients.ok) return clients;
  const relay = clients.value.deployment.relay;
  if (relay === null) {
    return err(
      "market-read-only",
      "No gas station is set up on this machine, so it can read the market but not act on it.",
      "Set UNWRITTEN_LINEAGE_RELAY in .env to the station's URL (see web/lineage-relay/wrangler.jsonc).",
    );
  }
  return ok({ ...clients.value, relay });
}

/** One transaction through the gas station, confirmed on main's own RPC. */
const relay = (c: Relaying, request: RelayRequest) => relayed(c.relay, c.public, request);

async function findWorld(c: MarketClients, token: string): Promise<Result<LaunchedWorld>> {
  const latest = await c.public.getBlockNumber();
  const world = (await launchedWorlds(c, latest)).find(
    (w) => w.token.toLowerCase() === token.toLowerCase(),
  );
  return world === undefined
    ? err("market-unknown-world", `${token} is not a world on this market.`, "Refresh the market.")
    : ok(world);
}

const balanceOf = (c: MarketClients, token: Address, holder: Address) =>
  c.public.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [holder],
  }) as Promise<bigint>;

async function bidCalls(
  c: MarketClients,
  w: LaunchedWorld,
  account: Address,
  amountText: string,
): Promise<Result<AccountCall[]>> {
  const currency = currencyOf(w);
  const amount = parseUnits(amountText, decimalsOf(currency));
  const read = (functionName: string) =>
    c.public.readContract({
      address: w.auction,
      abi: ccaAbi,
      functionName,
    } as never) as Promise<bigint>;
  const [start, end, floor, tick, clearing, latest, held] = await Promise.all([
    read("startBlock"),
    read("endBlock"),
    read("floorPrice"),
    read("tickSpacing"),
    read("clearingPrice"),
    c.public.getBlockNumber(),
    balanceOf(c, currency, account),
  ]);
  if (latest < start || latest >= end) {
    return err(
      "market-auction-closed",
      "This world's auction is not taking bids now.",
      "Pick a live auction.",
    );
  }
  if (amount <= 0n || amount > held) {
    return err(
      "market-not-enough",
      `The account holds less than ${amountText} of this auction's currency.`,
      currency === USDC ? "Get test USDC first." : "Buy the parent world's token first.",
    );
  }
  // A ceiling well above today's price keeps the bid fully filled, so it settles with a plain exit;
  // everyone still pays only the clearing price.
  const wanted = floor * 5n > clearing * 3n ? floor * 5n : clearing * 3n;
  const ceiling = (wanted / tick) * tick;
  return ok([
    call(
      currency,
      encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [UNISWAP_SEPOLIA.permit2, amount],
      }),
    ),
    call(
      UNISWAP_SEPOLIA.permit2,
      encodeFunctionData({
        abi: permit2Abi,
        functionName: "approve",
        args: [currency, w.auction, amount, 2 ** 48 - 1],
      }),
    ),
    call(
      w.auction,
      encodeFunctionData({
        abi: ccaAbi,
        functionName: "submitBid",
        args: [ceiling, amount, account, "0x"],
      }),
    ),
  ]);
}

async function buyCalls(
  c: MarketClients,
  w: LaunchedWorld,
  account: Address,
  usdcText: string,
): Promise<Result<AccountCall[]>> {
  const amount = parseUnits(usdcText, 6);
  const held = await balanceOf(c, USDC, account);
  if (amount <= 0n || amount > held) {
    return err(
      "market-not-enough",
      `The account holds less than ${usdcText} USDC.`,
      "Get test USDC first.",
    );
  }
  return ok([
    call(
      USDC,
      encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [c.deployment.router, amount],
      }),
    ),
    call(
      c.deployment.router,
      encodeFunctionData({
        abi: lineageRouter.abi,
        functionName: "buy",
        args: [w.token, amount, 0n, account],
      }),
    ),
  ]);
}

async function callsFor(
  c: MarketClients,
  dirs: Dirs,
  key: MarketKey,
  account: Address,
  action: MarketAction,
): Promise<Result<AccountCall[]>> {
  switch (action.kind) {
    case "name-cartridge":
      return nameCartridgeCalls(
        c,
        dirs,
        account,
        action.cartridgeId,
        action.version,
        action.label ?? null,
      );
    case "name-save":
      return nameSaveCalls(c, dirs, account, action.instanceId, action.label);
    case "launch":
      return launchCalls(c, dirs, account, action.cartridgeId, action.version);
    case "name-player":
      return namePlayerCalls(c, account, key, action.label);
    case "bid":
    case "buy": {
      const world = await findWorld(c, action.world);
      if (!world.ok) return world;
      return action.kind === "bid"
        ? bidCalls(c, world.value, account, action.amount)
        : buyCalls(c, world.value, account, action.usdc);
    }
  }
}

export async function prepareAction(
  key: MarketKey,
  action: MarketAction,
  dirs: Dirs,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Result<PreparedAction>> {
  const clients = relaying(env);
  if (!clients.ok) return clients;
  const c = clients.value;
  try {
    const account = await accountAddress(c, key);
    const calls = await callsFor(c, dirs, key, account, action);
    if (!calls.ok) return calls;
    const code = await c.public.getCode({ address: account });
    const nonce =
      code === undefined || code === "0x"
        ? 0n
        : ((await c.public.readContract({
            address: account,
            abi: passkeyAccount.abi,
            functionName: "nonce",
          })) as bigint);
    const deadline = BigInt(Math.floor(Date.now() / 1000)) + 600n;
    const challenge = passkeyDigest({
      chainId: BigInt(sepolia.id),
      account,
      nonce,
      deadline,
      calls: calls.value,
    });
    for (const [id, entry] of pending)
      if (Date.now() - entry.created > PENDING_MS) pending.delete(id);
    const id = randomBytes(16).toString("hex");
    pending.set(id, { key, calls: calls.value, deadline, challenge, created: Date.now() });
    return ok({ id, challenge, account, calls: calls.value.length });
  } catch (cause) {
    return err(
      "market-unreachable",
      toError(cause, "market-unreachable").message,
      "Refresh and try again.",
    );
  }
}

export async function submitAction(
  input: SubmitActionInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Result<MarketReceipt>> {
  const clients = relaying(env);
  if (!clients.ok) return clients;
  const entry = pending.get(input.id);
  pending.delete(input.id);
  if (entry === undefined || Date.now() - entry.created > PENDING_MS) {
    return err("market-expired", "That signature request has expired.", "Start the action again.");
  }
  const sent = await relay(clients.value, {
    kind: "execute",
    qx: entry.key.qx,
    qy: entry.key.qy,
    calls: entry.calls.map((c) => ({ target: c.target, value: c.value.toString(), data: c.data })),
    deadline: entry.deadline.toString(),
    auth: input.auth,
  });
  // Names this batch wrote (or the player's) must read fresh on the next view.
  forgetNames();
  forgetPlayers();
  return sent.ok ? ok({ txHashes: [sent.value] }) : sent;
}

/** MockUSDC is free to mint; the gas station tops a passkey account up to play with. */
export async function faucet(
  key: MarketKey,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Result<MarketReceipt>> {
  const clients = relaying(env);
  if (!clients.ok) return clients;
  const c = clients.value;
  const account = await accountAddress(c, key);
  if ((await balanceOf(c, USDC, account)) >= FAUCET_CEILING) {
    return err(
      "market-faucet-full",
      "This account already has enough test USDC.",
      "Spend some first.",
    );
  }
  const sent = await relay(c, { kind: "faucet", qx: key.qx, qy: key.qy });
  return sent.ok ? ok({ txHashes: [sent.value] }) : sent;
}

/** After the auction: every bid exits and claims (open to anyone), then the pool opens. */
export async function settleWorld(
  token: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Result<MarketReceipt>> {
  const clients = relaying(env);
  if (!clients.ok) return clients;
  const c = clients.value;
  const found = await findWorld(c, token);
  if (!found.ok) return found;
  const w = found.value;
  const [end, bids, latest] = await Promise.all([
    c.public.readContract({
      address: w.auction,
      abi: ccaAbi,
      functionName: "endBlock",
    }) as Promise<bigint>,
    c.public.readContract({
      address: w.auction,
      abi: ccaAbi,
      functionName: "nextBidId",
    }) as Promise<bigint>,
    c.public.getBlockNumber(),
  ]);
  if (latest <= end) {
    return err(
      "market-auction-open",
      "The auction has not ended yet.",
      "Settle it after its last block.",
    );
  }
  const txHashes: string[] = [];
  for (let id = 0n; id < bids; id++) {
    for (const step of ["exitBid", "claimTokens"] as const) {
      const data = encodeFunctionData({ abi: ccaAbi, functionName: step, args: [id] });
      try {
        await c.public.call({ to: w.auction, data });
      } catch {
        continue; // already exited or claimed, or a bid that needs the partial exit
      }
      const kind = step === "exitBid" ? "exit" : "claim";
      const sent = await relay(c, { kind, world: w.token, bid: id.toString() });
      if (!sent.ok) return sent;
      txHashes.push(sent.value);
    }
  }
  const key = (await c.public.readContract({
    address: c.deployment.registry,
    abi: lineageRegistry.abi,
    functionName: "poolKeyOf",
    args: [w.token],
  })) as PoolKey;
  const [sqrtPriceX96] = (await c.public.readContract({
    address: UNISWAP_SEPOLIA.stateView,
    abi: stateViewAbi,
    functionName: "getSlot0",
    args: [poolId(key)],
  })) as readonly [bigint, number, number, number];
  if (sqrtPriceX96 === 0n) {
    const sent = await relay(c, { kind: "graduate", world: w.token });
    if (!sent.ok) return sent;
    txHashes.push(sent.value);
  }
  return ok({ txHashes });
}

/** Pays a world's accrued royalties to whoever holds its ENS name now (open to anyone). */
export async function payRoyalties(
  token: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Result<MarketReceipt>> {
  const clients = relaying(env);
  if (!clients.ok) return clients;
  const c = clients.value;
  const found = await findWorld(c, token);
  if (!found.ok) return found;
  const txHashes: string[] = [];
  for (const currency of [found.value.token, currencyOf(found.value)]) {
    const owed = (await c.public.readContract({
      address: c.deployment.hook,
      abi: lineageHook.abi,
      functionName: "owed",
      args: [found.value.token, currency],
    })) as bigint;
    if (owed === 0n) continue;
    const sent = await relay(c, { kind: "royalties", world: found.value.token, currency });
    if (!sent.ok) return sent;
    txHashes.push(sent.value);
  }
  return txHashes.length === 0
    ? err(
        "market-nothing-owed",
        "This world has no royalties waiting.",
        "Trades pay royalties; check back after some.",
      )
    : ok({ txHashes });
}
