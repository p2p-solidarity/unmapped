// The steps a lineage-market run repeats — launch a world, bid in its Continuous Clearing Auction,
// end it and graduate it into its v4 pool, read balances and ENS records — bound to one deployment
// and one acting account. Used by the dry run (scripts/lineage-market.ts) and the live demo tools.

import {
  type Abi,
  type Address,
  decodeFunctionResult,
  formatUnits,
  type Hex,
  keccak256,
  type Log,
  maxUint256,
  parseEventLogs,
  parseUnits,
  toHex,
  zeroAddress,
} from "viem";
import { sepolia } from "viem/chains";
import { textProfileAbi, textQuery, universalResolverAbi } from "../../src/main/chain/ensCalls";
import {
  auctionPrices,
  ccaAbi,
  erc20Abi,
  lbpStrategyAbi,
  lineageHook,
  lineageRegistry,
  type PoolKey,
  permit2Abi,
  poolId,
  stateViewAbi,
  UNISWAP_SEPOLIA,
} from "../../src/main/chain/lineageCalls";
import { call, type Exec, read } from "./chainExec";

export interface Launched {
  label: string;
  token: Address;
  auction: Address;
  currency: Address;
}

export interface LaunchOptions {
  label: string;
  parent: Address;
  currency: Address;
  owner: Address;
  /** Floor as numerator / denominator whole currency per whole token. */
  price: [bigint, bigint];
  currencyDecimals: number;
  requiredCurrencyRaised: bigint;
  auctionBlocks: bigint;
  cartridgeId?: string;
  version?: string;
  contentHash?: Hex;
}

const say = (line: string) => process.stdout.write(`${line}\n`);

/** A Q96 auction price (currency per token, raw units) in whole currency per whole token. */
export function humanPrice(priceQ96: bigint, currencyDecimals: number): string {
  return formatUnits((priceQ96 * 10n ** 18n) >> 96n, currencyDecimals);
}

export function marketDay(exec: Exec, registry: Address, hook: Address) {
  const balance = async (token: Address, holder: Address = exec.account): Promise<bigint> =>
    (await read(exec, token, erc20Abi, "balanceOf", [holder])) as bigint;

  /** The node a child of `parent` (a launched world's token, or zero for top level) hangs under. */
  async function parentNode(parent: Address): Promise<Hex> {
    if (parent === zeroAddress) {
      return (await read(exec, registry, lineageRegistry.abi, "rootNode", [])) as Hex;
    }
    const world = (await read(exec, registry, lineageRegistry.abi, "worldOf", [parent])) as {
      node: Hex;
    };
    return world.node;
  }

  /** Names the world and puts it on the market in one transaction (registerAndLaunch). */
  async function launch(options: LaunchOptions): Promise<Launched> {
    const prices = auctionPrices(options.price[0], options.price[1], options.currencyDecimals, 18);
    const logs = await exec.send(
      call(registry, lineageRegistry.abi, "registerAndLaunch", [
        {
          parent: await parentNode(options.parent),
          label: options.label,
          owner: options.owner,
          cartridgeId: options.cartridgeId ?? `${options.label}-dry-run`,
          version: options.version ?? "1",
          contentHash: options.contentHash ?? keccak256(toHex(options.label)),
        },
        {
          supply: parseUnits("1000000", 18),
          lpReserve: parseUnits("500000", 18),
          auctionBlocks: options.auctionBlocks,
          floorPriceQ96: prices.floorPriceQ96,
          tickSpacingQ96: prices.tickSpacingQ96,
          requiredCurrencyRaised: options.requiredCurrencyRaised,
        },
      ]),
      `launch ${options.label}`,
    );
    const [event] = parseEventLogs({
      abi: lineageRegistry.abi,
      eventName: "WorldLaunched",
      logs,
    }) as unknown as { args: { token: Address; auction: Address } }[];
    if (event === undefined) throw new Error(`launch ${options.label}: no WorldLaunched event`);
    say(`    ${options.label}: token ${event.args.token}, auction ${event.args.auction}`);
    return {
      label: options.label,
      token: event.args.token,
      auction: event.args.auction,
      currency: options.currency,
    };
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
      call(world.auction, ccaAbi, "submitBid", [
        floorPriceQ96 + 10n * tick,
        amount,
        exec.account,
        "0x",
      ]),
      `bid in ${world.label}'s auction`,
    );
    return bidIdOf(logs);
  }

  /** Ends the auction, collects each bid's tokens (for its owner) and graduates it into its pool. */
  async function graduate(
    world: Launched,
    bids: { id: bigint; owner: Address }[],
    decimals: number,
  ): Promise<PoolKey> {
    const end = (await read(exec, world.auction, ccaAbi, "endBlock", [])) as bigint;
    await exec.mineTo(end + 1n);
    const clearing = (await read(exec, world.auction, ccaAbi, "clearingPrice", [])) as bigint;
    const filled: string[] = [];
    for (const { id, owner } of bids) {
      const held = await balance(world.token, owner);
      await exec.send(
        call(world.auction, ccaAbi, "exitBid", [id]),
        `exit ${world.label} bid ${id}`,
      );
      await exec.send(
        call(world.auction, ccaAbi, "claimTokens", [id]),
        `claim ${world.label} bid ${id}`,
      );
      filled.push(formatUnits((await balance(world.token, owner)) - held, 18));
    }
    const logs: Log[] = await exec.send(
      call(registry, lineageRegistry.abi, "graduate", [world.token]),
      `graduate ${world.label} into its v4 pool`,
    );
    const failed = parseEventLogs({ abi: lbpStrategyAbi, eventName: "MigrationFailed", logs });
    if (failed.length > 0) {
      throw new Error(`${world.label} migration failed: ${failed[0]?.args.reason}`);
    }
    if (parseEventLogs({ abi: lbpStrategyAbi, eventName: "Migrated", logs }).length === 0) {
      throw new Error(`${world.label}: no Migrated event`);
    }
    const key = (await read(exec, registry, lineageRegistry.abi, "poolKeyOf", [
      world.token,
    ])) as PoolKey;
    const [sqrtPriceX96] = (await read(exec, UNISWAP_SEPOLIA.stateView, stateViewAbi, "getSlot0", [
      poolId(key),
    ])) as [bigint];
    const mapped = (await read(exec, hook, lineageHook.abi, "worldOf", [poolId(key)])) as Address;
    if (mapped.toLowerCase() !== world.token.toLowerCase()) {
      throw new Error("hook does not know the pool");
    }
    say(
      `    ${world.label}: cleared at ${humanPrice(clearing, decimals)} per token, bids filled ${filled.join(" + ")}; pool sqrtPriceX96 ${sqrtPriceX96}; hook maps pool → world ✓`,
    );
    return key;
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

  const owed = async (world: Address, currency: Address) =>
    (await read(exec, hook, lineageHook.abi, "owed", [world, currency])) as bigint;

  return { launch, bid, graduate, balance, text, owed };
}

export function bidIdOf(logs: Log[]): bigint {
  const [event] = parseEventLogs({ abi: ccaAbi, eventName: "BidSubmitted", logs });
  if (event === undefined) throw new Error("no BidSubmitted event");
  return event.args.id;
}
