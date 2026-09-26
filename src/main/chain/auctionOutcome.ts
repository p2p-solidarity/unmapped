// How a world's auction ended, as the chain says it. Read-only: nothing here sends.
//
// The raise an auction needs to graduate lives in an immutable of the CCA (v2.1.0) with no getter
// (`requiredCurrencyRaised()` reverts). The factory's `AuctionCreated` log carries the exact
// AuctionParameters the auction was built from, so it is read once per auction and kept: it covers
// in-app launches (LAUNCH_TERMS) and operator launches (`lineage:demo launch --required …`) alike.
//
// `isGraduated()` and `currencyRaised()` read the auction's last checkpoint, which can predate its
// end block. Raised only grows, so a graduation read from any checkpoint stands; "not graduated" is
// final once the end block is checkpointed, or when nobody bid. Otherwise the end checkpoint is
// simulated — `checkpoint()`, then the two reads, in one eth_simulateV1 call — on the latest state.

import {
  type Address,
  decodeAbiParameters,
  encodeFunctionData,
  type Hex,
  type PublicClient,
  parseAbi,
  parseAbiItem,
} from "viem";
import { ccaAbi, UNISWAP_SEPOLIA } from "./lineageCalls";

export const auctionCreatedEvent = parseAbiItem(
  "event AuctionCreated(address indexed auction, address indexed token, uint256 amount, bytes configData)",
);

/** continuous-clearing-auction v2.1.0 `AuctionParameters`, field for field (LaunchTypes.sol). */
const AUCTION_PARAMETERS = [
  {
    type: "tuple",
    components: [
      { name: "currency", type: "address" },
      { name: "tokensRecipient", type: "address" },
      { name: "fundsRecipient", type: "address" },
      { name: "startBlock", type: "uint64" },
      { name: "endBlock", type: "uint64" },
      { name: "claimBlock", type: "uint64" },
      { name: "tickSpacing", type: "uint256" },
      { name: "validationHook", type: "address" },
      { name: "floorPrice", type: "uint256" },
      { name: "requiredCurrencyRaised", type: "uint128" },
      { name: "auctionStepsData", type: "bytes" },
    ],
  },
] as const;

const checkpointCall = encodeFunctionData({
  abi: parseAbi(["function checkpoint()"]),
  functionName: "checkpoint",
});

/** Required raise (raw currency units) by lower-cased auction address; immutable, so kept. */
const required = new Map<string, bigint>();

/** Each auction's required raise, from the CCA factory's log; an auction with no log is left out. */
export async function requiredRaises(
  client: PublicClient,
  auctions: readonly Address[],
  fromBlock: bigint,
  toBlock: bigint,
): Promise<Map<string, bigint>> {
  const missing = auctions.filter((auction) => !required.has(auction.toLowerCase()));
  if (missing.length > 0) {
    const logs = await client.getLogs({
      address: UNISWAP_SEPOLIA.ccaFactory,
      event: auctionCreatedEvent,
      args: { auction: missing },
      fromBlock,
      toBlock,
    });
    for (const log of logs) {
      if (log.args.auction === undefined || log.args.configData === undefined) continue;
      const [parameters] = decodeAbiParameters(AUCTION_PARAMETERS, log.args.configData as Hex);
      required.set(log.args.auction.toLowerCase(), parameters.requiredCurrencyRaised);
    }
  }
  const found = new Map<string, bigint>();
  for (const auction of auctions) {
    const value = required.get(auction.toLowerCase());
    if (value !== undefined) found.set(auction.toLowerCase(), value);
  }
  return found;
}

/** What an auction's own getters say now (its last checkpoint). */
export interface AuctionReads {
  graduated: boolean;
  raised: bigint;
  lastCheckpointed: bigint;
  end: bigint;
  bids: bigint;
}

export interface AuctionOutcome {
  graduated: boolean;
  raised: bigint;
}

/** An ended auction's final outcome (call only once the latest block is past its end). */
export async function endedOutcome(
  client: PublicClient,
  auction: Address,
  reads: AuctionReads,
): Promise<AuctionOutcome> {
  if (reads.graduated || reads.lastCheckpointed === reads.end || reads.bids === 0n) {
    return { graduated: reads.graduated, raised: reads.raised };
  }
  const { results } = await client.simulateCalls({
    calls: [
      { to: auction, data: checkpointCall },
      { to: auction, abi: ccaAbi, functionName: "isGraduated" },
      { to: auction, abi: ccaAbi, functionName: "currencyRaised" },
    ],
  });
  const [checkpoint, graduated, raised] = results;
  if (
    checkpoint?.status !== "success" ||
    graduated?.status !== "success" ||
    raised?.status !== "success"
  ) {
    throw new Error(`Could not simulate the end checkpoint of auction ${auction}.`);
  }
  return { graduated: graduated.result as boolean, raised: raised.result as bigint };
}
