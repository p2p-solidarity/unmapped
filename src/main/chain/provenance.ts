// Main's read-only view of the light chain (rev 6 phase 4, D6): does this device's copy of a world's
// history match what its services recorded on WorldProvenance? Reads need
// UNMAPPED_PROVENANCE_RPC_URL + UNMAPPED_PROVENANCE_ADDRESS (UNMAPPED_PROVENANCE_CHAIN_ID
// optional: when set, the RPC must report it). They are main-only (Rule 6) and separate from the
// UNWRITTEN_* ledger. Main never signs or sends here: players need no wallet.
//
// How it reads, with no wide log query: the sequencer keys come from the local log's receipt
// schedule; `recorders(world, key)` lists who opened a stream naming each key; `streamOf` gives the
// block it was opened in and the block of its latest beat; each `BeatRecorded.prevBlock` leads one
// block back. Streams that do not verify offline (@shared/provenance `streamTrust`) are reported
// as unverified and never count. The answer is an inclusion check at each recorded `upTo`.

import { verdictEntries } from "@dsl/history/verdict";
import { openGenesis } from "@shared/history/fold";
import { verifyLog } from "@shared/history/log";
import type { LogEntry } from "@shared/history/types";
import {
  type ChainStream,
  compareProvenance,
  EVM_ADDRESS,
  type Hex,
  idToBytes32,
  keyToBytes32,
  localBeats,
  type OpenedStream,
  type ProvenanceReport,
  type RecordedBeat,
  readOpened,
  readRecorded,
} from "@shared/provenance";
import { err, ok, type Result, toError } from "@shared/result";
import { type Abi, type Address, createPublicClient, http } from "viem";
import artifact from "../../../contracts/WorldProvenance.json";
import { readLog } from "../histories/logStore";
import { historiesDir, isWorldId, worldDir } from "../histories/paths";

const ABI = artifact.abi as Abi;
/** Recorders read per sequencer key (anyone may open a junk stream naming a key; it costs gas). */
const MAX_RECORDERS = 256;
const PAGE = 64;
/** Record transactions walked back per stream; older beats are not compared. */
const MAX_HOPS = 512;

export interface ProvenanceEnv {
  rpcUrl?: string;
  chainId?: string;
  address?: string;
}

function readEnv(env: NodeJS.ProcessEnv = process.env): ProvenanceEnv {
  return {
    rpcUrl: env.UNMAPPED_PROVENANCE_RPC_URL,
    chainId: env.UNMAPPED_PROVENANCE_CHAIN_ID,
    address: env.UNMAPPED_PROVENANCE_ADDRESS,
  };
}

export interface ProvenanceConfig {
  readable: boolean;
  chainId: number | null;
  address: string | null;
}

export function provenanceConfig(env: ProvenanceEnv = readEnv()): ProvenanceConfig {
  const id = Number(env.chainId ?? "");
  const chainId = Number.isSafeInteger(id) && id > 0 ? id : null;
  const address = env.address !== undefined && EVM_ADDRESS.test(env.address) ? env.address : null;
  const rpc = env.rpcUrl !== undefined && /^https?:\/\/\S+$/.test(env.rpcUrl);
  return { readable: rpc && address !== null, chainId, address };
}

/** What main reads from the contract. Injectable, so a check can run against any source. */
export interface ProvenanceReader {
  readonly contract: string;
  chainId(): Promise<number>;
  recorders(
    world: Hex,
    key: Hex,
    start: number,
    count: number,
  ): Promise<{ page: string[]; total: number }>;
  stream(
    recorder: string,
    world: Hex,
  ): Promise<{ open: boolean; openedBlock: bigint; lastBlock: bigint }>;
  opened(recorder: string, world: Hex, block: bigint): Promise<OpenedStream | null>;
  /** The stream's `BeatRecorded` events in `block`, in log order. */
  beatsAt(
    recorder: string,
    world: Hex,
    block: bigint,
  ): Promise<{ beat: RecordedBeat; prevBlock: bigint }[]>;
}

export function provenanceReader(env: ProvenanceEnv = readEnv()): Result<ProvenanceReader> {
  const config = provenanceConfig(env);
  if (!config.readable || config.address === null) {
    return err(
      "provenance-not-configured",
      "No provenance chain is configured.",
      "Set UNMAPPED_PROVENANCE_RPC_URL and UNMAPPED_PROVENANCE_ADDRESS in .env to compare " +
        "worlds with the fingerprints their services recorded.",
    );
  }
  const client = createPublicClient({ transport: http(env.rpcUrl) });
  const address = config.address as Address;
  type Logged = { args: Record<string, unknown> };
  const events = async (eventName: string, recorder: string, world: Hex, block: bigint) =>
    (await client.getContractEvents({
      address,
      abi: ABI,
      eventName,
      args: { recorder: recorder as Address, worldId: world },
      fromBlock: block,
      toBlock: block,
    })) as unknown as Logged[];
  return ok({
    contract: address.toLowerCase(),
    chainId: () => client.getChainId(),
    recorders: async (world, key, start, count) => {
      const [page, total] = (await client.readContract({
        address,
        abi: ABI,
        functionName: "recorders",
        args: [world, key, BigInt(start), BigInt(count)],
      })) as [string[], bigint];
      return { page, total: Number(total) };
    },
    stream: async (recorder, world) =>
      (await client.readContract({
        address,
        abi: ABI,
        functionName: "streamOf",
        args: [recorder, world],
      })) as { open: boolean; openedBlock: bigint; lastBlock: bigint },
    opened: async (recorder, world, block) => {
      const [log] = await events("StreamOpened", recorder, world, block);
      return log === undefined ? null : readOpened(log.args as Parameters<typeof readOpened>[0]);
    },
    beatsAt: async (recorder, world, block) =>
      (await events("BeatRecorded", recorder, world, block)).flatMap((log) => {
        const beat = readRecorded(log.args as Parameters<typeof readRecorded>[0]);
        const prevBlock = log.args.prevBlock;
        return beat === null || typeof prevBlock !== "bigint" ? [] : [{ beat, prevBlock }];
      }),
  });
}

/** One stream's recorded beats, walked back from its latest record (at most MAX_HOPS blocks). */
async function streamBeats(
  reader: ProvenanceReader,
  recorder: string,
  world: Hex,
  lastBlock: bigint,
): Promise<RecordedBeat[]> {
  const beats: RecordedBeat[] = [];
  let block = lastBlock;
  for (let hop = 0; block > 0n && hop < MAX_HOPS; hop += 1) {
    const found = await reader.beatsAt(recorder, world, block);
    beats.push(...found.map((one) => one.beat));
    const earlier = found.map((one) => one.prevBlock).filter((prev) => prev < block);
    block = earlier.length === 0 ? 0n : earlier.reduce((a, b) => (b < a ? b : a));
  }
  return beats.sort((a, b) => a.upTo - b.upTo);
}

/** Every open stream naming one of `keys` for `world`, with its beats. */
export async function readStreams(
  reader: ProvenanceReader,
  world: string,
  keys: readonly string[],
): Promise<ChainStream[]> {
  const worldId = idToBytes32(world);
  if (worldId === null) return [];
  const streams: ChainStream[] = [];
  for (const key of new Set(keys)) {
    const keyId = keyToBytes32(key);
    if (keyId === null) continue;
    for (let start = 0; start < MAX_RECORDERS; start += PAGE) {
      const { page, total } = await reader.recorders(worldId, keyId, start, PAGE);
      for (const recorder of page) {
        const stream = await reader.stream(recorder, worldId);
        if (!stream.open) continue;
        const opened = await reader.opened(recorder, worldId, stream.openedBlock);
        if (opened === null) continue;
        streams.push({
          opened,
          beats: await streamBeats(reader, recorder, worldId, stream.lastBlock),
        });
      }
      if (start + PAGE >= total) break;
    }
  }
  return streams;
}

/** The inclusion check of a verified local log against what is recorded for its world. */
export async function compareWithChain(
  world: string,
  entries: readonly LogEntry[],
  reader: ProvenanceReader,
  expectedChainId: number | null = provenanceConfig().chainId,
): Promise<Result<ProvenanceReport>> {
  const checked = verifyLog(world, entries);
  if (!checked.ok) return checked;
  const genesis = openGenesis(entries[0]?.event);
  if (!genesis.ok) return genesis;
  const { schedule } = checked.value;
  try {
    const chainId = await reader.chainId();
    if (expectedChainId !== null && expectedChainId !== chainId) {
      return err(
        "provenance-chain-mismatch",
        `UNMAPPED_PROVENANCE_CHAIN_ID is ${expectedChainId}, but the RPC is chain ${chainId}.`,
        "Point UNMAPPED_PROVENANCE_RPC_URL at the chain the contract is on.",
      );
    }
    const streams = await readStreams(
      reader,
      world,
      schedule.map((step) => step.key),
    );
    const beats = localBeats(genesis.value, verdictEntries(entries));
    return ok(
      compareProvenance({
        chainId,
        contract: reader.contract,
        genesis: genesis.value,
        schedule,
        entries,
        beats,
        streams,
      }),
    );
  } catch (error) {
    return err(
      "provenance-read-failed",
      toError(error, "provenance").message,
      "Check UNMAPPED_PROVENANCE_RPC_URL and UNMAPPED_PROVENANCE_ADDRESS.",
    );
  }
}

/**
 * This device's copy of `worldId` against the chain: "matches your copy at n", "differs at n",
 * "not synced that far", "not recorded", or `provenance-not-configured` when no chain is set up.
 */
export async function worldProvenance(
  userData: string,
  worldId: string,
  reader?: ProvenanceReader,
): Promise<Result<ProvenanceReport>> {
  if (!isWorldId(worldId)) return err("provenance-world-invalid", "That is not a world id.");
  const resolved = reader === undefined ? provenanceReader() : ok(reader);
  if (!resolved.ok) return resolved;
  const log = await readLog(worldDir(historiesDir(userData), worldId));
  if (!log.ok) return log;
  return compareWithChain(worldId, log.value, resolved.value);
}
