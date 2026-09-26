// The land as a world's history says it is now (rev 6 phase 3, WP5): a pure view over the fold
// (`WorldNow`, sequenced entries with this device's outbox on top) in the shapes the land already
// draws — standing chunks parsed back from their Scene programs, the live lore graph, notes — plus
// what the history adds around them: per chunk its live witness, whether it is provisional (not yet
// shared), fogged or fading, its variants (異聞) and legends (傳說); every note's author and status;
// signposts, gifts and rumors. Hidden events are skipped by every part of the view (D4, D8).
//
// Parsing is cached per witness event id (an event never changes), so a new entry costs only what
// it adds. A chunk kept only in this device's frozen legacy files (a migration skipped it) is drawn
// from them (`legacyOnly`) until the shared world has a live witness there (then `localCopy`).

import { parseErrands, parseScene } from "@dsl";
import type { ChunkStatus } from "@renderer/state/landStore";
import type { ChapterKind } from "@shared/chapter";
import { clearFords } from "@shared/chunks";
import { chunkStands, FADING_BELOW } from "@shared/history/decay";
import { worldLore } from "@shared/history/fold";
import { RUMOR_SHOW_BEATS } from "@shared/history/rumor";
import type {
  ChunkNow,
  Folded,
  GiftNow,
  NoteBody,
  RumorSlot,
  SignpostBody,
  WitnessBody,
  WorldNow,
} from "@shared/history/types";
import type { LandNote } from "@shared/land";
import type { LoreNode } from "@shared/lore";
import type { LandPlace } from "@shared/places";
import type { StoryEpisode } from "@shared/story";
import type { WorkRef } from "@shared/works";

/** One witness of a chunk as the history keeps it. */
export interface WitnessMark {
  /** Its event id. */
  id: string;
  /** What the locals called the place (`index.name`). */
  name: string;
  author: string;
  /** The author's display name, from the world's profiles and joins. */
  by: string | null;
  n: number;
  at: string;
  pending: boolean;
}

/** How one chunk stands in the world's history, beside what `chunks` draws. */
export interface ChunkMarks {
  /** The live witness (while fogged: what the legend marker names); null for a legacy-only chunk. */
  live: WitnessMark | null;
  /** The live witness is from this device's outbox and not yet shared. */
  provisional: boolean;
  /** A beat returned it to fog: it draws as unwritten land with mist and can be witnessed anew. */
  fogged: boolean;
  /** Its live witness is hidden by the owner: re-witnessable, and named nowhere. */
  hidden: boolean;
  /** Standing, but its care is under one point (thin mist). */
  fading: boolean;
  /** Drawn from this device's frozen legacy files: its migration kept it out of the history. */
  legacyOnly: boolean;
  /** This device also keeps a legacy copy of it (a local variant of the shared one). */
  localCopy: boolean;
  /** Race losers (異聞), oldest first. */
  variants: WitnessMark[];
  /** Earlier looks of the chunk (傳說), oldest first. */
  legends: WitnessMark[];
}

export interface NoteMark {
  /** The writer's author key. */
  key: string;
  pending: boolean;
  /** Its parent (an anchor or the note it answers) is a variant, so it is one too. */
  variant: boolean;
  /** A continent visitor's note the owner kept. */
  via: "continent" | null;
}

export interface RumorView {
  /** `<beat id>#<slot>`. */
  key: string;
  beat: string;
  slot: RumorSlot;
  text: string;
  author: string;
  by: string | null;
  n: number;
  pending: boolean;
}

/** A written chapter of an episode as the land plays it. */
export type ChapterView = { id: string; n: number; title: string } & (
  | {
      kind: "stage";
      stage: {
        kind: ChapterKind;
        source: string;
        dialogues?: Record<string, string>;
        seed: number;
      };
    }
  | { kind: "work"; work: WorkRef }
  | { kind: "closed" }
);

/** What the save's composed land progress is built from, besides the player's own progress. */
export interface LandWorld {
  /** Chunk key → the event id of the live witness standing there. */
  witnessOf: Record<string, string>;
  /** Places in log order, uncleared (the player's own progress says what they crossed). */
  places: LandPlace[];
  /** Place id → its event id (deeds and progress refer to it). */
  placeEvents: Record<string, string>;
  /** The land's continued chapters (live `story.more`), oldest first. */
  storyMore: StoryEpisode[];
  /** Episode id → its live `story.more` event id. */
  moreIds: Record<string, string>;
  /** Episode id → its live chapter. */
  chapters: Record<string, ChapterView>;
}

export interface LandFromHistory {
  /** Standing chunks only (written), keyed by chunk key. */
  chunks: Record<string, ChunkStatus>;
  marks: Record<string, ChunkMarks>;
  /** Live lore: the lore of every standing chunk (what new lore may link to). */
  lore: LoreNode[];
  notes: LandNote[];
  noteMarks: Record<string, NoteMark>;
  signposts: Folded<SignpostBody>[];
  gifts: GiftNow[];
  /** Live rumors of the recent beats, newest beat first. */
  rumors: RumorView[];
  world: LandWorld;
}

const parsed = new Map<string, ChunkStatus>();

/** A witness's programs as the land draws them; cached by event id. */
export function witnessStatus(witness: Folded<WitnessBody>): ChunkStatus {
  const cached = parsed.get(witness.id);
  if (cached !== undefined) return cached;
  const { body } = witness;
  const scene = parseScene(body.scene);
  const errands = body.errands === undefined ? null : parseErrands(body.errands);
  const status: ChunkStatus = scene.ok
    ? {
        status: "written",
        // The host keeps every chunk's fords clear, whatever the program says (`clearFords`).
        scene: clearFords(scene.value, { cx: body.cx, cz: body.cz }),
        dialogues: body.dialogues,
        errands: errands?.ok ? errands.value : null,
      }
    : {
        status: "failed",
        error: {
          code: "witnessed-chunk-invalid",
          message: `The program of chunk (${body.cx}, ${body.cz}) no longer parses: ${scene.error.message}`,
          hint: "This build reads it differently from the one that wrote it; update UNMAPPED.",
        },
      };
  if (parsed.size > 4096) parsed.clear();
  parsed.set(witness.id, status);
  return status;
}

function markOf(now: WorldNow, witness: Folded<WitnessBody>): WitnessMark {
  return {
    id: witness.id,
    name: witness.body.index.name,
    author: witness.author,
    by: now.names[witness.author] ?? null,
    n: witness.n,
    at: witness.at,
    pending: witness.pending,
  };
}

function visible(now: WorldNow, witnesses: readonly Folded<WitnessBody>[]): WitnessMark[] {
  return witnesses.filter((one) => now.hidden[one.id] !== true).map((one) => markOf(now, one));
}

function chunkMarks(now: WorldNow, key: string, chunk: ChunkNow): ChunkMarks {
  const hidden = now.hidden[chunk.live.id] === true;
  const stands = chunkStands(now, chunk);
  return {
    live: hidden ? null : markOf(now, chunk.live),
    provisional: chunk.live.pending,
    fogged: chunk.fogged,
    hidden,
    fading: stands && now.beats.length > 0 && (now.care[key] ?? 0) < FADING_BELOW,
    legacyOnly: false,
    localCopy: false,
    variants: visible(now, chunk.variants),
    legends: visible(now, chunk.legends),
  };
}

function noteOf(note: Folded<NoteBody>): LandNote {
  const { coord, anchors, text, contests, name } = note.body;
  return { id: note.id, author: name, at: note.at, coord, anchors, text, contests };
}

function chapterView(now: WorldNow, episodeId: string): ChapterView | null {
  const live = now.chapters[episodeId]?.live ?? null;
  if (live === null || now.hidden[live.id] === true) return null;
  const head = { id: live.id, n: live.n, title: live.body.title };
  const { body } = live;
  if (body.kind === "closed") return { ...head, kind: "closed" };
  if (body.kind === "work") {
    const { workId, version, contentHash } = body.work;
    return { ...head, kind: "work", work: { workId, version, contentHash } };
  }
  return {
    ...head,
    kind: "stage",
    stage: {
      kind: body.kind,
      source: body.source,
      ...(body.dialogues === undefined ? {} : { dialogues: body.dialogues }),
      seed: body.seed,
    },
  };
}

function placesOf(now: WorldNow): { places: LandPlace[]; events: Record<string, string> } {
  const places: LandPlace[] = [];
  const events: Record<string, string> = {};
  for (const place of now.places) {
    if (now.hidden[place.id] === true) continue;
    const { body } = place;
    const entrance = { id: place.place, title: body.title, cx: place.cx, cz: place.cz };
    events[place.place] = place.id;
    if (body.kind === "otherworld" && body.work !== undefined) {
      const { workId, version, contentHash } = body.work;
      places.push({
        ...entrance,
        kind: "otherworld",
        work: { workId, version, contentHash },
        cleared: false,
      });
    } else if (body.kind !== "otherworld" && body.source !== undefined) {
      places.push({
        ...entrance,
        kind: body.kind,
        seed: body.seed,
        source: body.source,
        ...(body.dialogues === undefined ? {} : { dialogues: body.dialogues }),
        cleared: false,
      });
    }
  }
  return { places, events };
}

function rumorsOf(now: WorldNow): RumorView[] {
  const out: RumorView[] = [];
  const beats = now.beats.slice(-RUMOR_SHOW_BEATS).reverse();
  for (const beat of beats) {
    for (const slot of beat.body.slots) {
      const key = `${beat.id}#${slot.slot}`;
      const live = now.rumors[key]?.live ?? null;
      if (live === null || now.hidden[live.id] === true || now.hidden[slot.cite] === true) continue;
      out.push({
        key,
        beat: beat.id,
        slot,
        text: live.body.text,
        author: live.author,
        by: now.names[live.author] ?? null,
        n: live.n,
        pending: live.pending,
      });
    }
  }
  return out;
}

/**
 * The land of `now`, with `legacy` (chunk key → a chunk drawn from this device's frozen files, for
 * the chunks its migration kept out of the history) filling in where the history has nothing live.
 */
export function landFromHistory(
  now: WorldNow,
  legacy: Readonly<Record<string, ChunkStatus>> = {},
): LandFromHistory {
  const chunks: Record<string, ChunkStatus> = {};
  const marks: Record<string, ChunkMarks> = {};
  const witnessOf: Record<string, string> = {};
  const keys = Object.keys(now.chunks).sort();
  for (const key of keys) {
    const chunk = now.chunks[key];
    if (chunk === undefined) continue;
    marks[key] = chunkMarks(now, key, chunk);
    if (!chunkStands(now, chunk)) continue;
    chunks[key] = witnessStatus(chunk.live);
    witnessOf[key] = chunk.live.id;
  }
  for (const [key, status] of Object.entries(legacy)) {
    const mark = marks[key];
    if (chunks[key] !== undefined && mark !== undefined) {
      marks[key] = { ...mark, localCopy: true };
      continue;
    }
    chunks[key] = status;
    marks[key] = {
      ...(mark ?? {
        live: null,
        provisional: false,
        fogged: false,
        hidden: false,
        fading: false,
        localCopy: false,
        variants: [],
        legends: [],
      }),
      legacyOnly: true,
    };
  }
  const lore = worldLore(now)
    .filter((one) => one.live)
    .map((one) => one.node);
  const notes: LandNote[] = [];
  const noteMarks: Record<string, NoteMark> = {};
  for (const note of now.notes) {
    if (now.hidden[note.id] === true) continue;
    notes.push(noteOf(note));
    noteMarks[note.id] = {
      key: note.author,
      pending: note.pending,
      variant: now.events[note.id]?.status === "variant",
      via: note.body.via ?? null,
    };
  }
  const more = Object.values(now.more)
    .flatMap((contest) => (contest.live === null ? [] : [contest.live]))
    .filter((live) => now.hidden[live.id] !== true)
    .sort((a, b) => a.n - b.n);
  const chapters: Record<string, ChapterView> = {};
  for (const episodeId of Object.keys(now.chapters)) {
    const view = chapterView(now, episodeId);
    if (view !== null) chapters[episodeId] = view;
  }
  const { places, events } = placesOf(now);
  return {
    chunks,
    marks,
    lore,
    notes,
    noteMarks,
    signposts: now.signposts.filter((sign) => now.hidden[sign.id] !== true),
    gifts: Object.values(now.gifts)
      .filter((gift) => now.hidden[gift.id] !== true)
      .sort((a, b) => a.n - b.n),
    rumors: rumorsOf(now),
    world: {
      witnessOf,
      places,
      placeEvents: events,
      storyMore: more.map((live) => live.body.episode),
      moreIds: Object.fromEntries(more.map((live) => [live.body.episode.id, live.id])),
      chapters,
    },
  };
}

/**
 * What one resident has heard (D14): the live rumors whose listener is `npc` on chunk `coord`,
 * newest beat first. Talking shows them as "They say…" rows with no model call (WP7's talk.ts).
 */
export function rumorsFor(
  rumors: readonly RumorView[],
  coord: { cx: number; cz: number },
  npc: string,
): RumorView[] {
  return rumors.filter(
    ({ slot }) =>
      slot.listener.cx === coord.cx && slot.listener.cz === coord.cz && slot.listener.npc === npc,
  );
}
