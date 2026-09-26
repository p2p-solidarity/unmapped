// Migrating the land (rev 6 phase 3, D6 steps 2–4): one witness per chunk in lore-run order, then
// the rest by (cx, cz); notes in file order with their links re-pointed at events; places at their
// old chunk unless that is taken.

import { type ChunkCoord, chunkKey } from "@shared/chunks";
import { isLiveLore } from "@shared/history/admit";
import { HISTORY_LIMITS } from "@shared/history/bodies";
import type { PlaceBody, WitnessBody } from "@shared/history/types";
import { loreCoord, type WitnessedChunk } from "@shared/land";
import type { LoreNode } from "@shared/lore";
import { type LandPlace, PLACE_LIMITS, placeSpot } from "@shared/places";
import { ok, type Result } from "@shared/result";
import {
  onChunk,
  oneLine,
  put,
  type Run,
  shown,
  skip,
  takeKarma,
  unsigned,
  workPack,
} from "./migrateRun";
import type { Adjusted } from "./migrateSource";
import { witnessIndexOf } from "./validate";

/** Chunks in lore-run order (the order `lore.jsonl` first names them), then the rest by (cx, cz). */
function chunkOrder(run: Run): { chunk: WitnessedChunk; lore: LoreNode[] }[] {
  const { chunks, lore } = run.files.land;
  const byKey = new Map(chunks.map((chunk) => [chunkKey(chunk), chunk]));
  const runs = new Map<string, LoreNode[]>();
  for (const node of lore) {
    const key = chunkKey(node.coord);
    runs.set(key, [...(runs.get(key) ?? []), node]);
  }
  const ordered: { chunk: WitnessedChunk; lore: LoreNode[] }[] = [];
  for (const [key, nodes] of runs) {
    const chunk = byKey.get(key);
    if (chunk !== undefined) {
      ordered.push({ chunk, lore: nodes });
      continue;
    }
    for (const node of nodes) {
      skip(run, "lore", node.id, "lore-chunk-missing", `Lore names chunk ${key}, not in the save.`);
    }
  }
  const rest = chunks
    .filter((chunk) => !runs.has(chunkKey(chunk)))
    .sort((a, b) => a.cx - b.cx || a.cz - b.cz);
  return [...ordered, ...rest.map((chunk) => ({ chunk, lore: [] }))];
}

/**
 * A chunk's lore with every link kept that reaches its own lore or lore already live in the plan.
 * A link into a chunk that stayed out (legacyOnly) could never be admitted, so the whole chunk
 * would stay out with it — and every chunk witnessed beside it later. Such a link is dropped from
 * the history's copy and reported, like a note's anchor; the frozen files keep it.
 */
function reachableLore(run: Run, key: string, lore: readonly LoreNode[]): LoreNode[] {
  const own = new Set(lore.map((node) => node.id));
  const now = run.planner.now();
  return lore.map((node) => {
    const links = node.links.filter((link) => {
      const kept = own.has(link) || isLiveLore(now, link);
      if (!kept) {
        const detail = `${node.id} → ${link}`;
        run.adjusted.push({ what: "chunk", key, code: "lore-link-missing", detail });
      }
      return kept;
    });
    return { ...node, coord: { ...node.coord }, links };
  });
}

/** One witness per chunk, dated by its karma line; one that cannot enter stays legacyOnly. */
export function migrateChunks(run: Run): void {
  for (const { chunk, lore } of chunkOrder(run)) {
    const key = chunkKey(chunk);
    const index = witnessIndexOf(chunk);
    if (!index.ok) {
      skip(run, "chunk", key, index.error.code, index.error.message);
      continue;
    }
    const adjustedBefore = run.adjusted.length;
    const body: WitnessBody = {
      cx: chunk.cx,
      cz: chunk.cz,
      scene: chunk.scene,
      dialogues: { ...chunk.dialogues },
      ...(chunk.errands === undefined ? {} : { errands: chunk.errands }),
      lore: reachableLore(run, key, lore),
      index: index.value,
    };
    const name = index.value.name;
    const line = takeKarma(
      run,
      (entry) => entry.action === "witness" && onChunk(entry, chunk) && entry.choice === name,
    );
    const event = unsigned(run, "witness", body, shown(line?.at, run.createdAt));
    const id = put(run, "chunk", key, event);
    // A chunk that stayed out anyway changed nothing that entered: only its skip is reported.
    if (id === null) run.adjusted.length = adjustedBefore;
    else run.witnesses.set(key, { id, lore: new Set(lore.map((node) => node.id)) });
  }
}

/**
 * Notes in file order. Anchors (lore ids) become their witnesses, `contests` the answered note's
 * event; a target that stayed out is dropped and reported. A note with no karma line of its own
 * was left by a continent visitor: it keeps their name, `via: "continent"`.
 */
export function migrateNotes(run: Run): void {
  for (const note of run.files.land.notes) {
    const adjusted: Adjusted[] = [];
    const anchors: string[] = [];
    for (const loreId of note.anchors) {
      const coord = loreCoord(loreId);
      const witness = coord === null ? undefined : run.witnesses.get(chunkKey(coord));
      if (witness === undefined || !witness.lore.has(loreId)) {
        adjusted.push({ what: "note", key: note.id, code: "note-anchor-missing", detail: loreId });
      } else if (!anchors.includes(witness.id)) {
        anchors.push(witness.id);
      }
    }
    let contests: string | null = null;
    if (note.contests !== null) {
      contests = run.notes.get(note.contests) ?? null;
      if (contests === null) {
        const detail = note.contests;
        adjusted.push({ what: "note", key: note.id, code: "note-contests-missing", detail });
      }
    }
    const own = takeKarma(
      run,
      (entry) =>
        entry.action === "note" && entry.choice === note.author && onChunk(entry, note.coord),
    );
    const body = {
      coord: { cx: note.coord.cx, cz: note.coord.cz, x: note.coord.x, z: note.coord.z },
      anchors,
      text: note.text,
      contests,
      name: oneLine(note.author, HISTORY_LIMITS.nameChars),
      ...(own === null ? { via: "continent" as const } : {}),
    };
    const id = put(
      run,
      "note",
      note.id,
      unsigned(run, "note", body, shown(note.at, run.createdAt)),
    );
    if (id === null) continue;
    run.notes.set(note.id, id);
    run.adjusted.push(...adjusted);
  }
}

function placeBody(run: Run, place: LandPlace, spot: ChunkCoord): Result<PlaceBody> {
  const title = oneLine(place.title, PLACE_LIMITS.titleChars);
  const head = { title, at: { cx: spot.cx, cz: spot.cz }, legacyId: place.id };
  if (place.kind === "otherworld") {
    const work = workPack(run, place.work);
    return work.ok ? ok({ ...head, kind: "otherworld", seed: 0, work: work.value }) : work;
  }
  return ok({
    ...head,
    kind: place.kind,
    seed: place.seed,
    source: place.source,
    ...(place.dialogues === undefined ? {} : { dialogues: { ...place.dialogues } }),
  });
}

/**
 * Places at their old chunk. One standing on home, on a story gate (authored or continued) or on
 * an earlier place moves to the nearest free chunk (`placeSpot`), keeps its id, and is reported.
 */
export function migratePlaces(run: Run): void {
  const gates = [...(run.files.cartridge.story?.episodes ?? []), ...(run.land?.storyMore ?? [])];
  const taken: ChunkCoord[] = gates.map(({ cx, cz }) => ({ cx, cz }));
  const isTaken = (coord: ChunkCoord): boolean =>
    (coord.cx === 0 && coord.cz === 0) ||
    taken.some((one) => one.cx === coord.cx && one.cz === coord.cz);
  for (const place of run.land?.places ?? []) {
    const wanted = { cx: place.cx, cz: place.cz };
    const moved = isTaken(wanted);
    const spot = moved ? placeSpot(wanted, taken, null) : wanted;
    if (spot === null) {
      skip(run, "place", place.id, "place-no-room", "No free chunk near the place's old one.");
      continue;
    }
    const body = placeBody(run, place, spot);
    if (!body.ok) {
      skip(run, "place", place.id, body.error.code, body.error.message);
      continue;
    }
    const id = put(run, "place", place.id, unsigned(run, "place", body.value, run.createdAt));
    if (id === null) continue;
    taken.push(spot);
    run.places.set(place.id, id);
    if (moved) {
      const detail = `${wanted.cx},${wanted.cz} → ${spot.cx},${spot.cz}`;
      run.adjusted.push({ what: "place", key: place.id, code: "place-moved", detail });
    }
  }
}
