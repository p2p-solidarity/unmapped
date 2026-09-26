// One world as the service holds it (rev 6 phase 3, D4, D10): its log lines exactly as stored, the
// fold over them (`WorldNow`) and the usage ledger, plus the blobs it may serve. Loading re-verifies
// the whole log — chain, receipt times and every receipt under the D2 schedule — and refuses a log
// the service did not sequence or that was changed on disk; a snapshot only saves the refold of
// its prefix, never the verification.
//
// Sequencing is a draft: each event is admitted and folded into a copy, the batch is appended and
// fsynced, and only then is the copy committed. A batch that does not reach the disk changes
// nothing.

import { applyEntry, emptyNow, FOLD_VERSION, foldEntries, openGenesis } from "@shared/history/fold";
import { utf8Length } from "@shared/history/ids";
import { readLogLine, receiptKeyAt, sequenceEvent, verifyLog } from "@shared/history/log";
import { verifyEvent } from "@shared/history/sign";
import type {
  EntryVerdict,
  GenesisEvent,
  Head,
  LogEntry,
  StoredEvent,
  VerdictEntry,
  WorldNow,
} from "@shared/history/types";
import { checkPhysics } from "@shared/physics";
import { err, ok, type Result } from "@shared/result";
import { FRAME_LIMITS, FRAME_MAX_BYTES } from "@shared/worldProtocol";
import type { ServiceKey } from "./keyFile";
import type { FileStore } from "./store";
import { emptyUsage, isUsage, type Payer, payerOf, recordUsage, type WorldUsage } from "./usage";
import type { VerdictFn } from "./verdict";

/** Snapshots are written every this many entries, and on shutdown. */
export const SNAPSHOT_EVERY = 1_000;

export interface WorldState {
  now: WorldNow;
  usage: WorldUsage;
}

interface ServiceSnapshot {
  foldVersion: number;
  head: Head;
  now: WorldNow;
  usage: WorldUsage;
}

/** A batch being sequenced: the state after it, and its entries and lines. */
export interface Draft {
  state: WorldState;
  entries: LogEntry[];
  lines: string[];
  sizes: number[];
}

function field(event: StoredEvent, name: "kind" | "author"): string {
  const value = event[name];
  return typeof value === "string" ? value : "";
}

/** The ledger after `entries` (with their line sizes), paid as the fold `now` says. */
function replayUsage(
  usage: WorldUsage,
  now: WorldNow,
  entries: readonly LogEntry[],
  sizes: readonly number[],
  serviceKey: string,
): WorldUsage {
  let ledger = usage;
  entries.forEach((entry, index) => {
    const author = field(entry.event, "author");
    const kind = field(entry.event, "kind");
    ledger = recordUsage(ledger, {
      payer: payerOf(now, entry.n, author, kind, serviceKey),
      author,
      kind,
      bytes: sizes[index] ?? 0,
      ms: Date.parse(entry.rt),
    });
  });
  return ledger;
}

export class ServiceWorld {
  /** Line n − 1 is entry n, byte for byte as stored; `sizes` are their UTF-8 lengths. */
  private readonly lines: string[];
  private readonly sizes: number[];
  snapshotN: number;
  readonly blobs: Map<string, number>;

  constructor(
    readonly genesis: GenesisEvent,
    public state: WorldState,
    lines: string[],
    sizes: number[],
    blobs: Map<string, number>,
    snapshotN: number,
  ) {
    this.lines = lines;
    this.sizes = sizes;
    this.blobs = blobs;
    this.snapshotN = snapshotN;
  }

  get id(): string {
    return this.genesis.id;
  }

  get owner(): string {
    return this.genesis.author;
  }

  get now(): WorldNow {
    return this.state.now;
  }

  get head(): Head {
    return this.state.now.head;
  }

  get blobBytes(): number {
    let total = 0;
    for (const size of this.blobs.values()) total += size;
    return total;
  }

  /** Entry n as stored, or null. */
  entryAt(n: number): LogEntry | null {
    const line = this.lines[n - 1];
    if (line === undefined) return null;
    const entry = readLogLine(line);
    return entry.ok ? entry.value : null;
  }

  /** chain(n): the world id for 0, else entry n's chain. */
  chainAt(n: number): string | null {
    return n === 0 ? this.id : (this.entryAt(n)?.chain ?? null);
  }

  draft(): Draft {
    return { state: this.state, entries: [], lines: [], sizes: [] };
  }

  /** Sequences one admitted event into `draft` with the service's receipt. */
  sequenceInto(
    draft: Draft,
    event: StoredEvent,
    verdict: EntryVerdict,
    rt: string,
    key: ServiceKey,
    payer: Payer,
  ): LogEntry {
    const { now } = draft.state;
    const entry = sequenceEvent(
      { n: now.head.n, chain: now.head.chain, rt: now.rt },
      event,
      rt,
      key.secret,
    );
    const line = JSON.stringify(entry);
    const bytes = utf8Length(line);
    draft.state = {
      now: applyEntry(now, entry, verdict),
      usage: recordUsage(draft.state.usage, {
        payer,
        author: field(event, "author"),
        kind: field(event, "kind"),
        bytes,
        ms: Date.parse(entry.rt),
      }),
    };
    draft.entries.push(entry);
    draft.lines.push(line);
    draft.sizes.push(bytes);
    return entry;
  }

  /** Appends the draft to disk (fsynced), then makes it the world's state. */
  commit(draft: Draft, store: FileStore): Result<void> {
    if (draft.lines.length === 0) return ok(undefined);
    const written = store.appendLines(this.id, draft.lines);
    if (!written.ok) return written;
    this.lines.push(...draft.lines);
    this.sizes.push(...draft.sizes);
    this.state = draft.state;
    return ok(undefined);
  }

  /**
   * `entries` frames for everything after `have`, each within the frame limits (≤ 256 entries,
   * ≤ 256 KiB), built from the stored lines so every entry goes out exactly as it was stored.
   */
  entriesFrames(have: number): string[] {
    const frames: string[] = [];
    const head = JSON.stringify({ n: this.head.n, chain: this.head.chain });
    const prefix = `{"t":"entries","world":"${this.id}","entries":[`;
    const suffix = `],"head":${head}}`;
    const budget = FRAME_MAX_BYTES - utf8Length(prefix) - utf8Length(suffix);
    let batch: string[] = [];
    let size = 0;
    const flush = (): void => {
      if (batch.length > 0) frames.push(`${prefix}${batch.join(",")}${suffix}`);
      batch = [];
      size = 0;
    };
    for (let n = have + 1; n <= this.head.n; n += 1) {
      const line = this.lines[n - 1] ?? "";
      const bytes = (this.sizes[n - 1] ?? utf8Length(line)) + 1;
      if (batch.length >= FRAME_LIMITS.pushEntries || (batch.length > 0 && size + bytes > budget)) {
        flush();
      }
      batch.push(line);
      size += bytes;
    }
    flush();
    return frames;
  }

  snapshot(): ServiceSnapshot {
    return {
      foldVersion: FOLD_VERSION,
      head: this.head,
      now: this.state.now,
      usage: this.state.usage,
    };
  }
}

function logInvalid(world: string, why: string, code = "world-log-invalid"): Result<never> {
  return err(
    code,
    `World ${world.slice(0, 12)}…'s log does not verify: ${why}`,
    "The service keeps it unserved; restore log.jsonl from a backup.",
  );
}

function snapshotPrefix(
  raw: unknown,
  world: string,
  entries: readonly LogEntry[],
): ServiceSnapshot | null {
  if (typeof raw !== "object" || raw === null) return null;
  const snap = raw as Partial<ServiceSnapshot>;
  if (snap.foldVersion !== FOLD_VERSION || typeof snap.head !== "object" || snap.head === null) {
    return null;
  }
  const { n, chain } = snap.head;
  if (!Number.isSafeInteger(n) || n < 1 || n > entries.length) return null;
  if (entries[n - 1]?.chain !== chain) return null;
  const now = snap.now;
  if (typeof now !== "object" || now === null || now.world !== world) return null;
  if (now.head?.n !== n || now.head.chain !== chain || !isUsage(snap.usage)) return null;
  return snap as ServiceSnapshot;
}

export interface LoadOutcome {
  world: ServiceWorld;
  torn: number;
  fromSnapshot: number;
  badBlobLines: number;
}

/**
 * Reads, re-verifies and folds one stored world. Refuses (`world-log-invalid`) a line that does not
 * parse, a broken chain, receipt times going back, a receipt that does not verify, a log whose
 * receipts are not this service's key, a genesis that does not verify, and physics this build does
 * not reproduce.
 */
export function loadWorld(
  store: FileStore,
  world: string,
  key: ServiceKey,
  verdict: VerdictFn,
  options: { mirror?: boolean } = {},
): Result<LoadOutcome> {
  const read = store.readLog(world);
  if (!read.ok) return read;
  const { lines, torn } = read.value;
  const entries: LogEntry[] = [];
  for (const [index, line] of lines.entries()) {
    const entry = readLogLine(line);
    if (!entry.ok) return logInvalid(world, `line ${index + 1}: ${entry.error.message}`);
    entries.push(entry.value);
  }
  const checked = verifyLog(world, entries);
  if (!checked.ok) return logInvalid(world, checked.error.message);
  // The chain binds ids, not bodies: an event whose content no longer hashes to its id, or whose
  // signature fails, was changed on disk (the service sequences neither, and attach refuses both).
  const changed = entries.find((entry) => !verifyEvent(entry.event).ok);
  if (changed !== undefined) return logInvalid(world, `entry ${changed.n} was changed on disk.`);
  const receiptKey = receiptKeyAt(checked.value.schedule, checked.value.cursor.n);
  // A mirror (phase 4, D5: imported from a `.world`) keeps the old service's receipts.
  if (receiptKey !== key.key && options.mirror !== true) {
    return logInvalid(world, "its receipts are not this service's key.", "world-key-foreign");
  }
  const genesis = openGenesis(entries[0]?.event);
  if (!genesis.ok) return logInvalid(world, genesis.error.message);
  const physics = checkPhysics(genesis.value.body.physicsVersion);
  if (!physics.ok) return physics;
  const sizes = lines.map(utf8Length);
  const snap = snapshotPrefix(store.readSnapshot(world), world, entries);
  const start = snap?.head.n ?? 0;
  const rest = entries.slice(start);
  const verdicts: VerdictEntry[] = rest.map((entry) => ({ entry, verdict: verdict(entry.event) }));
  const now = foldEntries(snap?.now ?? emptyNow(genesis.value), verdicts);
  const usage = replayUsage(snap?.usage ?? emptyUsage(), now, rest, sizes.slice(start), key.key);
  const { blobs, bad } = store.readBlobList(world);
  const loaded = new ServiceWorld(genesis.value, { now, usage }, lines, sizes, blobs, start);
  return ok({ world: loaded, torn, fromSnapshot: start, badBlobLines: bad });
}

/** A new world from an attach: its whole log, verified, folded and ledgered. */
export function newWorld(
  genesis: GenesisEvent,
  entries: readonly LogEntry[],
  verdicts: readonly EntryVerdict[],
  key: ServiceKey,
): ServiceWorld {
  const lines = entries.map((entry) => JSON.stringify(entry));
  const sizes = lines.map(utf8Length);
  const now = foldEntries(
    emptyNow(genesis),
    entries.map((entry, index) => ({ entry, verdict: verdicts[index] ?? { ok: true } })),
  );
  const usage = replayUsage(emptyUsage(), now, entries, sizes, key.key);
  return new ServiceWorld(genesis, { now, usage }, lines, sizes, new Map(), 0);
}
