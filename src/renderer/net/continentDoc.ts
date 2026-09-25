// The continent's Y.Doc (plan.md §8). Three maps, every key prefixed by the world it belongs to:
//
//   worlds  worldId            → ContinentWorldEntry   written (and rewritten) only by its owner
//   chunks  worldId|cx,cz      → WitnessedChunk        in the owner's coordinates, set once
//   notes   worldId|noteId     → LandNote              in the owner's coordinates, set once
//
// A chunk is written once per key, so what a world's owner witnessed first is what that place is.
// A note belongs to the world whose land it was left on; its owner keeps it in notes.jsonl, whoever
// wrote it. Positions never enter the document (awareness carries them). Pure over a Y.Doc, so the
// merge is tested with two documents and no network.

import { chunkKey } from "@shared/chunks";
import {
  type ContinentWorldEntry,
  readChunkEntry,
  readNoteEntry,
  readWorldEntry,
  splitWorldKey,
  worldKey,
} from "@shared/continent";
import type { LandNote, WitnessedChunk } from "@shared/land";
import type * as Y from "yjs";

export function continentMaps(doc: Y.Doc) {
  return {
    worlds: doc.getMap<unknown>("worlds"),
    chunks: doc.getMap<unknown>("chunks"),
    notes: doc.getMap<unknown>("notes"),
  };
}

/** Writes this world's entry, only when something in it changed (every write is broadcast). */
export function publishWorld(doc: Y.Doc, entry: ContinentWorldEntry): void {
  const { worlds } = continentMaps(doc);
  const before = worlds.get(entry.worldId);
  if (before !== undefined && JSON.stringify(before) === JSON.stringify(entry)) return;
  worlds.set(entry.worldId, entry);
}

/** Adds chunks this world witnessed; a chunk already in the document is left as it is. */
export function publishChunks(
  doc: Y.Doc,
  worldId: string,
  chunks: readonly WitnessedChunk[],
): void {
  const map = continentMaps(doc).chunks;
  const fresh = chunks.filter((chunk) => !map.has(worldKey(worldId, chunkKey(chunk))));
  if (fresh.length === 0) return;
  doc.transact(() => {
    for (const chunk of fresh) map.set(worldKey(worldId, chunkKey(chunk)), chunk);
  });
}

/** Adds notes left on `worldId`'s land (in its coordinates); one already there is left alone. */
export function publishNotes(doc: Y.Doc, worldId: string, notes: readonly LandNote[]): void {
  const map = continentMaps(doc).notes;
  const fresh = notes.filter((note) => !map.has(worldKey(worldId, note.id)));
  if (fresh.length === 0) return;
  doc.transact(() => {
    for (const note of fresh) map.set(worldKey(worldId, note.id), note);
  });
}

export function removeWorld(doc: Y.Doc, worldId: string): void {
  continentMaps(doc).worlds.delete(worldId);
}

export interface ContinentSnapshot {
  /** Entries of this protocol that passed validation. */
  worlds: ContinentWorldEntry[];
  chunks: Map<string, WitnessedChunk[]>;
  notes: Map<string, LandNote[]>;
}

function group<T>(map: Y.Map<unknown>, read: (value: unknown) => T | null): Map<string, T[]> {
  const out = new Map<string, T[]>();
  map.forEach((value, key) => {
    const owner = splitWorldKey(key);
    const item = read(value);
    if (owner === null || item === null) return;
    const list = out.get(owner.worldId) ?? [];
    list.push(item);
    out.set(owner.worldId, list);
  });
  return out;
}

/** Everything in the document that a peer can trust enough to parse and draw. */
export function readContinent(doc: Y.Doc): ContinentSnapshot {
  const { worlds, chunks, notes } = continentMaps(doc);
  const entries: ContinentWorldEntry[] = [];
  worlds.forEach((value, key) => {
    const entry = readWorldEntry(value);
    if (entry !== null && entry.worldId === key) entries.push(entry);
  });
  return {
    worlds: entries,
    chunks: group(chunks, readChunkEntry),
    notes: group(notes, readNoteEntry),
  };
}
