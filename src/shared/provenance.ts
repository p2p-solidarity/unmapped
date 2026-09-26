// The light chain (rev 6 phase 4, D6): how a world's history is spelled for WorldProvenance
// (contracts/src/provenance/WorldProvenance.sol), which streams a world trusts, and how a copy of
// the log compares with what was recorded. Whether a world asks to be recorded is the fold's
// `chainRecording` (./history/fold: its latest `chain` event).
//
// - bytes32 values are the raw bytes behind P3's spellings: a world id "h…" and a key "k…" are
//   base32 of 32 bytes, a chain or content hash "sha256:…" is hex of 32 bytes. Signatures are the
//   64 Ed25519 bytes behind their base64url text. Every decoder is canonical (./history/ids).
// - The contract checks no signature. A stream counts only if the owner's genesis signature and the
//   sequencer's stream signature verify here, offline, and the sequencer key is one the world's own
//   log installs (P3 D2's schedule, as `verifyLog` builds it).
// - Comparing is an inclusion check at each recorded `upTo`: chain(upTo) must equal the local
//   entry's chain, and entry upTo + 1 must be an admitted beat whose fingerprint recomputes.
//
// Pure and synchronous, no viem: main, the service and scripts turn the 0x strings into ABI values.

import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { computeBeat } from "./history/beat";
import { readEvent } from "./history/event";
import { emptyNow, foldEntries } from "./history/fold";
import {
  authorKeyOf,
  base32,
  base64Url,
  CHAIN,
  EVENT_ID,
  fromBase32,
  fromBase64Url,
  publicKeyOf,
} from "./history/ids";
import type { ReceiptKey } from "./history/log";
import { signText, verifyText } from "./history/sign";
import type { GenesisEvent, LogEntry, VerdictEntry } from "./history/types";

export type Hex = `0x${string}`;

/** What the service key signs for one stream (D6, exact). */
export const PROVENANCE_PREFIX = "unmapped-provenance:v1\n";
/** The genesis event's own signature is over this prefix + its id, the world id (sign.ts). */
const EVENT_PREFIX = "unmapped-event:v1\n";

export const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const HEX_SIG = /^0x[0-9a-fA-F]{128}$/;

const hex = (bytes: Uint8Array): Hex => `0x${bytesToHex(bytes)}`;

// ── Encodings ────────────────────────────────────────────────────────────────────────────────

/** A world (or event) id "h" + base32(sha256) as bytes32, or null. */
export function idToBytes32(id: string): Hex | null {
  if (!EVENT_ID.test(id)) return null;
  const bytes = fromBase32(id.slice(1));
  return bytes !== null && bytes.length === 32 ? hex(bytes) : null;
}

/** An Ed25519 key "k" + base32(public key) as bytes32, or null. */
export function keyToBytes32(key: string): Hex | null {
  const bytes = publicKeyOf(key);
  return bytes === null ? null : hex(bytes);
}

/** A chain(n) or content hash "sha256:" + hex as bytes32, or null. */
export function hashToBytes32(hash: string): Hex | null {
  return CHAIN.test(hash) ? `0x${hash.slice(7)}` : null;
}

/** A base64url Ed25519 signature as its 64 bytes, or null. */
export function sigToBytes(sig: string): Hex | null {
  const bytes = fromBase64Url(sig);
  return bytes !== null && bytes.length === 64 ? hex(bytes) : null;
}

export function idFromBytes32(value: string): string | null {
  return HEX32.test(value) ? `h${base32(hexToBytes(value.slice(2)))}` : null;
}

export function keyFromBytes32(value: string): string | null {
  return HEX32.test(value) ? authorKeyOf(hexToBytes(value.slice(2))) : null;
}

export function hashFromBytes32(value: string): string | null {
  return HEX32.test(value) ? `sha256:${value.slice(2).toLowerCase()}` : null;
}

export function sigFromBytes(value: string): string | null {
  return HEX_SIG.test(value) ? base64Url(hexToBytes(value.slice(2))) : null;
}

// ── Streams ──────────────────────────────────────────────────────────────────────────────────

/** Which stream a signature is for: one recorder address, one world, one contract on one chain. */
export interface StreamRef {
  chainId: number;
  contract: string;
  recorder: string;
  world: string;
}

/** A `StreamOpened` in the history's own spellings (addresses lowercase). */
export interface OpenedStream {
  recorder: string;
  world: string;
  cartridgeHash: string;
  ownerKey: string;
  genesisSig: string;
  sequencerKey: string;
  sequencerSig: string;
}

/** One `BeatRecorded`: BeatBody.upTo, chain(upTo) and BeatBody.fingerprint. */
export interface RecordedBeat {
  upTo: number;
  chain: string;
  fingerprint: string;
}

/** A stream as read from the chain, its beats in ascending `upTo`. */
export interface ChainStream {
  opened: OpenedStream;
  beats: RecordedBeat[];
}

/** "unmapped-provenance:v1\n" + chainId + "\n" + contract + "\n" + recorder + "\n" + worldId. */
export function provenanceText(ref: StreamRef): string | null {
  const { chainId, contract, recorder, world } = ref;
  if (!Number.isSafeInteger(chainId) || chainId <= 0) return null;
  if (!EVM_ADDRESS.test(contract) || !EVM_ADDRESS.test(recorder) || !EVENT_ID.test(world)) {
    return null;
  }
  const lower = (address: string) => address.toLowerCase();
  return `${PROVENANCE_PREFIX}${chainId}\n${lower(contract)}\n${lower(recorder)}\n${world}`;
}

/** The service key's `sequencerSig` for `ref`, or null when `ref` is malformed. */
export function signStream(secretKey: Uint8Array, ref: StreamRef): string | null {
  const text = provenanceText(ref);
  return text === null ? null : signText(secretKey, text);
}

/** The ABI arguments of `openStream`, or null when a value does not encode. */
export function openStreamArgs(
  genesis: GenesisEvent,
  sequencerKey: string,
  sequencerSig: string,
): readonly [Hex, Hex, Hex, Hex, Hex, Hex] | null {
  const args = [
    idToBytes32(genesis.id),
    hashToBytes32(genesis.body.cartridge.contentHash),
    keyToBytes32(genesis.author),
    sigToBytes(genesis.sig),
    keyToBytes32(sequencerKey),
    sigToBytes(sequencerSig),
  ] as const;
  return args.every((value) => value !== null)
    ? (args as readonly [Hex, Hex, Hex, Hex, Hex, Hex])
    : null;
}

/** One `recordBeats` entry in ABI form: world, BeatBody.upTo, chain(upTo), BeatBody.fingerprint. */
export interface BeatRecord {
  world: Hex;
  upTo: bigint;
  chain: Hex;
  fingerprint: Hex;
}

/**
 * The records of `beats` above `after` (a stream's recorded `upTo`), in the order given, which must
 * rise. `chainAt(n)` is chain(n) of the log the beats are in; a beat that does not encode is left out.
 */
export function beatRecords(
  world: string,
  beats: readonly { upTo: number; fingerprint: string }[],
  chainAt: (n: number) => string | null,
  after = 0,
): BeatRecord[] {
  const worldId = idToBytes32(world);
  if (worldId === null) return [];
  return beats.flatMap((beat) => {
    if (beat.upTo <= after) return [];
    const chain = hashToBytes32(chainAt(beat.upTo) ?? "");
    const fingerprint = hashToBytes32(beat.fingerprint);
    if (chain === null || fingerprint === null) return [];
    return [{ world: worldId, upTo: BigInt(beat.upTo), chain, fingerprint }];
  });
}

/** `recordBeats(worldIds[], upTos[], chains[], fingerprints[])` arguments of one batch. */
export function recordBeatsArgs(
  records: readonly BeatRecord[],
): readonly [Hex[], bigint[], Hex[], Hex[]] {
  return [
    records.map((record) => record.world),
    records.map((record) => record.upTo),
    records.map((record) => record.chain),
    records.map((record) => record.fingerprint),
  ];
}

/** A decoded `StreamOpened` (viem's args) in the history's spellings, or null. */
export function readOpened(args: {
  recorder: string;
  worldId: string;
  sequencerKey: string;
  cartridgeHash: string;
  ownerKey: string;
  genesisSig: string;
  sequencerSig: string;
}): OpenedStream | null {
  const opened = {
    recorder: EVM_ADDRESS.test(args.recorder) ? args.recorder.toLowerCase() : null,
    world: idFromBytes32(args.worldId),
    cartridgeHash: hashFromBytes32(args.cartridgeHash),
    ownerKey: keyFromBytes32(args.ownerKey),
    genesisSig: sigFromBytes(args.genesisSig),
    sequencerKey: keyFromBytes32(args.sequencerKey),
    sequencerSig: sigFromBytes(args.sequencerSig),
  };
  return Object.values(opened).every((value) => value !== null) ? (opened as OpenedStream) : null;
}

/** A decoded `BeatRecorded` (viem's args), or null. */
export function readRecorded(args: {
  upTo: bigint;
  chain: string;
  fingerprint: string;
}): RecordedBeat | null {
  const chain = hashFromBytes32(args.chain);
  const fingerprint = hashFromBytes32(args.fingerprint);
  const upTo = Number(args.upTo);
  if (chain === null || fingerprint === null || !Number.isSafeInteger(upTo)) return null;
  return { upTo, chain, fingerprint };
}

/**
 * What anyone can check with the chain data alone: the owner signed this world id, and the
 * sequencer key signed this exact (chain, contract, recorder, world).
 */
export function streamSignatures(
  opened: OpenedStream,
  chainId: number,
  contract: string,
): { genesis: boolean; sequencer: boolean } {
  const text = provenanceText({
    chainId,
    contract,
    recorder: opened.recorder,
    world: opened.world,
  });
  return {
    genesis: verifyText(opened.ownerKey, `${EVENT_PREFIX}${opened.world}`, opened.genesisSig),
    sequencer: text !== null && verifyText(opened.sequencerKey, text, opened.sequencerSig),
  };
}

export type StreamTrust =
  | "verified"
  /** Owner, cartridge or genesis signature is not this world's genesis. */
  | "genesis-differs"
  /** No admitted `sequencer` entry of this world installs the stream's key. */
  | "sequencer-unscheduled"
  /** Copied under another sender, or made for another chain or contract. */
  | "sequencer-sig-invalid";

/**
 * D6 "which streams count": the genesis is this world's, the key is one the world's receipt
 * schedule installs, and the key signed this recorder's stream. Anything else is "unverified".
 */
export function streamTrust(
  opened: OpenedStream,
  context: {
    chainId: number;
    contract: string;
    genesis: GenesisEvent;
    schedule: readonly ReceiptKey[];
  },
): StreamTrust {
  const { genesis } = context;
  const signed = streamSignatures(opened, context.chainId, context.contract);
  if (
    opened.world !== genesis.id ||
    opened.ownerKey !== genesis.author ||
    opened.cartridgeHash !== genesis.body.cartridge.contentHash ||
    opened.genesisSig !== genesis.sig ||
    !signed.genesis
  ) {
    return "genesis-differs";
  }
  if (!context.schedule.some((step) => step.key === opened.sequencerKey)) {
    return "sequencer-unscheduled";
  }
  return signed.sequencer ? "verified" : "sequencer-sig-invalid";
}

// ── Comparing with a copy of the log ─────────────────────────────────────────────────────────

/** A beat of a local copy of the log, recomputed from the entries before it. */
export interface LocalBeat {
  /** The beat's own entry: upTo + 1. */
  n: number;
  upTo: number;
  /** chain(upTo) in this copy. */
  chain: string;
  fingerprint: string;
  /** Admitted by the fold, and `computeBeat` over entries 1..upTo gives the same fingerprint. */
  recomputes: boolean;
}

/** Every beat entry of a verified log (`verifyLog` first), each recomputed from the fold. */
export function localBeats(genesis: GenesisEvent, entries: readonly VerdictEntry[]): LocalBeat[] {
  const beats: LocalBeat[] = [];
  let now = emptyNow(genesis);
  let folded = 0;
  entries.forEach(({ entry }, index) => {
    const read = readEvent(entry.event);
    if (!read.ok || read.value.kind !== "beat") return;
    const { body, id } = read.value;
    now = foldEntries(now, entries.slice(folded, index));
    const computed = computeBeat(now, body.at);
    now = foldEntries(now, entries.slice(index, index + 1));
    folded = index + 1;
    beats.push({
      n: entry.n,
      upTo: body.upTo,
      chain: entries[body.upTo - 1]?.entry.chain ?? "",
      fingerprint: body.fingerprint,
      recomputes:
        now.events[id] !== undefined &&
        computed.ok &&
        computed.value.body.fingerprint === body.fingerprint,
    });
  });
  return beats;
}

export type BeatMatch = "matches" | "differs" | "not-synced";

/** The inclusion check at one recorded `upTo`. */
export function beatMatch(
  recorded: RecordedBeat,
  entries: readonly LogEntry[],
  beats: readonly LocalBeat[],
): BeatMatch {
  const at = entries[recorded.upTo - 1];
  if (at === undefined) return "not-synced";
  if (at.chain !== recorded.chain) return "differs";
  if (entries.length <= recorded.upTo) return "not-synced";
  const beat = beats.find((one) => one.n === recorded.upTo + 1 && one.upTo === recorded.upTo);
  if (beat === undefined || !beat.recomputes) return "differs";
  return beat.fingerprint === recorded.fingerprint ? "matches" : "differs";
}

export interface StreamReport {
  recorder: string;
  sequencerKey: string;
  trust: StreamTrust;
  beats: { upTo: number; match: BeatMatch }[];
}

export type ProvenanceVerdict =
  /** Every recorded beat this copy reaches matches; `upTo` is the highest. */
  | { status: "matches"; upTo: number }
  /** The lowest recorded beat that does not match this copy. */
  | { status: "differs"; upTo: number }
  /** Recorded, but this copy reaches none of it yet; `upTo` is the lowest recorded. */
  | { status: "not-synced"; upTo: number }
  /** No verified stream holds a beat (`unverified` streams were found and discarded). */
  | { status: "not-recorded"; unverified: number };

export interface ProvenanceReport {
  world: string;
  verdict: ProvenanceVerdict;
  /** Verified streams first, in sequencer order (a retired service's stream stays frozen). */
  streams: StreamReport[];
}

export function compareProvenance(input: {
  chainId: number;
  contract: string;
  genesis: GenesisEvent;
  schedule: readonly ReceiptKey[];
  entries: readonly LogEntry[];
  beats: readonly LocalBeat[];
  streams: readonly ChainStream[];
}): ProvenanceReport {
  const order = (key: string) => {
    const index = input.schedule.findIndex((step) => step.key === key);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  const streams: StreamReport[] = input.streams.map(({ opened, beats }) => ({
    recorder: opened.recorder,
    sequencerKey: opened.sequencerKey,
    trust: streamTrust(opened, input),
    beats: beats.map((beat) => ({
      upTo: beat.upTo,
      match: beatMatch(beat, input.entries, input.beats),
    })),
  }));
  const rank = (report: StreamReport) => (report.trust === "verified" ? 0 : 1);
  streams.sort((a, b) => rank(a) - rank(b) || order(a.sequencerKey) - order(b.sequencerKey));
  const counted = streams
    .filter((report) => report.trust === "verified")
    .flatMap((report) => report.beats)
    .sort((a, b) => a.upTo - b.upTo);
  const unverified = streams.filter((report) => report.trust !== "verified").length;
  const differs = counted.find((beat) => beat.match === "differs");
  const matched = counted.filter((beat) => beat.match === "matches").at(-1);
  const verdict: ProvenanceVerdict =
    counted.length === 0
      ? { status: "not-recorded", unverified }
      : differs !== undefined
        ? { status: "differs", upTo: differs.upTo }
        : matched !== undefined
          ? { status: "matches", upTo: matched.upTo }
          : { status: "not-synced", upTo: counted[0]?.upTo ?? 0 };
  return { world: input.genesis.id, verdict, streams };
}
