// The worlds `bun run provenance --dry-run` records (scripts/provenance.ts, rev 6 phase 4, D6):
// the ones a world service's data dir holds, read without writing anything there, or small ones made
// in memory the way a service holds them (attached, then a beat a week).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { entryVerdict, verdictEntries } from "@dsl/history/verdict";
import { computeBeat } from "@shared/history/beat";
import {
  applyEntry,
  chainRecording,
  emptyNow,
  foldEntries,
  openGenesis,
} from "@shared/history/fold";
import { DAY_MS, EVENT_ID, fromBase64Url } from "@shared/history/ids";
import {
  type LogCursor,
  logStart,
  type ReceiptKey,
  readLogLine,
  receiptKeyAt,
  sequenceEvent,
  verifyLog,
} from "@shared/history/log";
import { authorKeyFor, newSecretKey, signEvent } from "@shared/history/sign";
import type {
  EventBodies,
  EventKind,
  GenesisEvent,
  LogEntry,
  UnsignedEventOf,
} from "@shared/history/types";
import { type LocalBeat, localBeats } from "@shared/provenance";

export interface Loaded {
  genesis: GenesisEvent;
  entries: LogEntry[];
  schedule: ReceiptKey[];
  beats: LocalBeat[];
  /** The world's own opt-in (its latest `chain` event); the dry run records either way. */
  requested: boolean;
}

export interface ServiceSecret {
  secret: Uint8Array;
  key: string;
}

/** A verified log this service sequences, its beats recomputed; or why not. */
export function loadWorld(world: string, entries: LogEntry[], service: string): Loaded | string {
  const checked = verifyLog(world, entries);
  if (!checked.ok) return `${checked.error.code}: ${checked.error.message}`;
  const { schedule } = checked.value;
  if (receiptKeyAt(schedule, entries.length) !== service) return "not sequenced by this service";
  const genesis = openGenesis(entries[0]?.event);
  if (!genesis.ok) return genesis.error.message;
  const verdicts = verdictEntries(entries);
  const now = foldEntries(emptyNow(genesis.value), verdicts);
  const requested = chainRecording(now);
  const beats = localBeats(genesis.value, verdicts);
  return { genesis: genesis.value, entries, schedule, beats, requested };
}

/** A world service's --data dir, read only: its key and every world it sequences (or why not). */
export function readServiceDir(dir: string): {
  service: ServiceSecret;
  worlds: Loaded[];
  skipped: string[];
} {
  const keyPath = join(dir, "service-key.json");
  if (!existsSync(keyPath)) throw new Error(`${keyPath} is missing: --from takes a --data dir.`);
  const record = JSON.parse(readFileSync(keyPath, "utf8")) as { key?: unknown; secret?: unknown };
  const secret = typeof record.secret === "string" ? fromBase64Url(record.secret) : null;
  if (secret === null || secret.length !== 32 || authorKeyFor(secret) !== record.key) {
    throw new Error(`${keyPath} does not hold a service key.`);
  }
  const service = { secret: secret as Uint8Array, key: record.key as string };
  const worlds: Loaded[] = [];
  const skipped: string[] = [];
  const root = join(dir, "worlds");
  for (const world of existsSync(root) ? readdirSync(root).sort() : []) {
    const path = join(root, world, "log.jsonl");
    if (!EVENT_ID.test(world) || !existsSync(path)) continue;
    const lines = readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => line !== "");
    const entries = lines.map(readLogLine);
    const bad = entries.findIndex((entry) => !entry.ok);
    const loaded =
      bad >= 0
        ? `line ${bad + 1} does not read`
        : loadWorld(
            world,
            entries.flatMap((entry) => (entry.ok ? [entry.value] : [])),
            service.key,
          );
    if (typeof loaded === "string") skipped.push(`${world}: ${loaded}`);
    else worlds.push(loaded);
  }
  return { service, worlds, skipped };
}

/** A world as a service would hold it: attached, then a beat a week for four weeks. */
export function madeWorld(service: ServiceSecret, name: string, startMs: number): Loaded {
  const iso = (ms: number) => new Date(ms).toISOString();
  const owner = newSecretKey();
  const genesis = signEvent(
    {
      v: 1,
      world: "",
      kind: "genesis",
      author: authorKeyFor(owner),
      at: iso(startMs),
      seen: 0,
      body: {
        name,
        cartridge: {
          cartridgeId: "provenance-dry-run",
          version: "1.0.0",
          contentHash: `sha256:${"0d".repeat(32)}`,
        },
        seed: `DRY-${name.slice(0, 4).toUpperCase()}`,
        language: "en",
        physicsVersion: 1,
        createdAt: iso(startMs),
        access: "friends",
        gates: [],
        from: { instanceId: `dry-run-${name.toLowerCase()}` },
      },
    },
    owner,
  );
  const entries: LogEntry[] = [];
  let cursor: LogCursor = logStart(genesis.id);
  let now = emptyNow(genesis);
  const write = <K extends EventKind>(
    kind: K,
    body: EventBodies[K],
    who: Uint8Array,
    ms: number,
  ) => {
    const unsigned = {
      v: 1,
      world: genesis.id,
      kind,
      author: authorKeyFor(who),
      at: iso(ms),
      seen: now.head.n,
      body,
    };
    const event = signEvent(unsigned as UnsignedEventOf<K>, who);
    const entry = sequenceEvent(cursor, event, iso(ms), service.secret);
    cursor = { n: entry.n, chain: entry.chain, rt: entry.rt };
    entries.push(entry);
    now = applyEntry(now, entry, entryVerdict(event));
  };
  const genesisEntry = sequenceEvent(cursor, genesis, iso(startMs), service.secret);
  cursor = { n: 1, chain: genesisEntry.chain, rt: genesisEntry.rt };
  entries.push(genesisEntry);
  now = applyEntry(now, genesisEntry, entryVerdict(genesis));
  write("profile", { name: `${name} keeper` }, owner, startMs + 60_000);
  write("sequencer", { url: "ws://127.0.0.1:8787", key: service.key }, owner, startMs + 120_000);
  for (let week = 1; week <= 4; week += 1) {
    const at = startMs + week * 7 * DAY_MS;
    const beat = computeBeat(now, iso(at));
    if (!beat.ok) throw new Error(`${name}: ${beat.error.message}`);
    write("beat", beat.value.body, service.secret, at);
    write("profile", { name: `${name} keeper ${week}` }, owner, at + 60_000);
  }
  const loaded = loadWorld(genesis.id, entries, service.key);
  if (typeof loaded === "string") throw new Error(`${name}: ${loaded}`);
  return loaded;
}
