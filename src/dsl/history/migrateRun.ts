// One migration in progress (rev 6 phase 3, D6): the planner, what later steps look up by old id,
// and the small helpers every step shares — planning an event or listing why it stayed out,
// dating it from the karma ledger, and resolving work packs and errand keys.

import type { ContentHash } from "@shared/cartridge";
import type { ChunkCoord } from "@shared/chunks";
import { isOneLine } from "@shared/history/bodies";
import type { EventBodies, EventKind, UnsignedEvent, UnsignedEventOf } from "@shared/history/types";
import type { LandProgress } from "@shared/land";
import { err, ok, type Result } from "@shared/result";
import type { WorkRef } from "@shared/works";
import type { KarmaEntry } from "@shared/world";
import type { Planner } from "./migratePlanner";
import type { Adjusted, MigratedWhat, MigrationFiles, Skipped } from "./migrateSource";

/** Envelope `at` and genesis `createdAt` are display text of at most this many characters. */
export const SHOWN_CHARS = 40;
const ERRAND_KEY = /^(-?\d{1,6}),(-?\d{1,6}):([a-z0-9][a-z0-9_]{0,47})$/;

export type WorkPack = WorkRef & { pack: ContentHash };

export interface Witnessed {
  id: string;
  lore: ReadonlySet<string>;
}

export interface Run {
  files: MigrationFiles;
  land: LandProgress | undefined;
  planner: Planner;
  /** The genesis `createdAt`: the `at` of every event with no time of its own. */
  createdAt: string;
  /** The karma ledger in file order; a line dates at most one event. */
  karma: { entry: KarmaEntry; used: boolean }[];
  skipped: Skipped[];
  adjusted: Adjusted[];
  /** Chunk key → its witness. */
  witnesses: Map<string, Witnessed>;
  /** Old note id, old place id, episode id → event id. */
  notes: Map<string, string>;
  places: Map<string, string>;
  more: Map<string, string>;
  chapters: Map<string, string>;
}

/** At most `max` UTF-16 units, never cutting a surrogate pair in half. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/** `text` when it already is one line of at most `max`; else control characters become spaces. */
export function oneLine(text: string, max: number): string {
  if (isOneLine(text) && text.length <= max && text.trim().length > 0) return text;
  let flat = "";
  for (const char of text) flat += isOneLine(char) ? char : " ";
  return clip(flat.replace(/\s+/g, " ").trim(), max).trimEnd();
}

export function shown(at: string | undefined, fallback: string): string {
  return at === undefined || at.length === 0 ? fallback : clip(at, SHOWN_CHARS);
}

export const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function sortedEntries<T>(record: Readonly<Record<string, T>>): [string, T][] {
  return Object.entries(record).sort(([a], [b]) => compareText(a, b));
}

export const episodeNumber = (id: string): number => Number(id.slice(1));

/** Whether a karma line happened on `coord`'s chunk. */
export const onChunk = (line: Pick<KarmaEntry, "cx" | "cz">, coord: ChunkCoord): boolean =>
  line.cx === coord.cx && line.cz === coord.cz;

export function unsigned<K extends EventKind>(
  run: Run,
  kind: K,
  body: EventBodies[K],
  at: string,
): UnsignedEventOf<K> {
  const author = run.files.owner;
  return { v: 1, world: run.planner.world, kind, author, at, seen: 0, body } as UnsignedEventOf<K>;
}

/** Plans one event; its id, or null after listing why it stays out. */
export function put(
  run: Run,
  what: MigratedWhat,
  key: string,
  event: UnsignedEvent,
): string | null {
  const added = run.planner.add(event);
  if (added.ok) return added.value;
  run.skipped.push({ what, key, code: added.error.code, message: added.error.message });
  return null;
}

export function skip(run: Run, what: MigratedWhat, key: string, code: string, message: string) {
  run.skipped.push({ what, key, code, message });
}

/** The first karma line not yet used that `match` accepts, now used. */
export function takeKarma(run: Run, match: (entry: KarmaEntry) => boolean): KarmaEntry | null {
  const line = run.karma.find((one) => !one.used && match(one.entry));
  if (line === undefined) return null;
  line.used = true;
  return line.entry;
}

/** The exact work revision and the pack main made of it. */
export function workPack(run: Run, work: WorkRef): Result<WorkPack> {
  const key = `${work.workId}@${work.version}`;
  const made = Object.hasOwn(run.files.workPacks, key) ? run.files.workPacks[key] : undefined;
  if (made === undefined) {
    return err("work-pack-missing", `No pack of AI world ${key} could be made on this device.`);
  }
  if (made.contentHash !== work.contentHash) {
    return err("work-pack-mismatch", `This device holds another revision of AI world ${key}.`);
  }
  const { workId, version, contentHash } = work;
  return ok({ workId, version, contentHash, pack: made.pack });
}

/** `<witness id>:<errand id>` for a legacy errand key `cx,cz:errandId`, or why not. */
export function errandRef(run: Run, key: string): Result<string> {
  const match = ERRAND_KEY.exec(key);
  if (match === null) return err("errand-key-invalid", `Errand key ${key} is not cx,cz:id.`);
  const witness = run.witnesses.get(`${Number(match[1])},${Number(match[2])}`);
  return witness === undefined
    ? err("errand-chunk-legacy", `The chunk of errand ${key} stayed out of the history.`)
    : ok(`${witness.id}:${match[3]}`);
}
