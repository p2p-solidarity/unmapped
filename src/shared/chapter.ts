// A story chapter as it is played: in the game itself, never on a separate page. Most chapters
// happen on the open land around their gate — the model writes who is there, what they say, what
// can be found and what stands in the way (the Chapter dialect), and the host sets all of it on
// walkable ground near the gate. A climb or a maze is played as a place (a side-scrolling course
// or a grid dungeon) entered from the gate. What was written, and how far the player got, belongs
// to the save (`EpisodeProgress.stage`); the host decides when a chapter is done.

import type { PlaceKind } from "./places";

/** The kinds of play a story asks for (the `kind` a chapter is written with). */
export const PLAY_KINDS = ["meet", "search", "fight", "climb", "maze"] as const;
export type PlayKind = (typeof PLAY_KINDS)[number];

export const CHAPTER_KINDS = ["land", "side", "dungeon"] as const;
export type ChapterKind = (typeof CHAPTER_KINDS)[number];

export const CHAPTER_LIMITS = { sourceChars: 16_000, doneIds: 16 } as const;

/** Save-owned: the chapter's program and what the player has done in it so far. */
export interface ChapterStage {
  kind: ChapterKind;
  /** `land`: a Chapter program. `side` / `dungeon`: a place's Scene program. */
  source: string;
  /**
   * `side` / `dungeon` only: each resident's words as a Dialogue program keyed by NPC id, written
   * with the place (a land chapter keeps them in its Chapter program). Absent on older saves.
   */
  dialogues?: Record<string, string>;
  /** Where things stand around the gate (land) or how the ground is built (side / dungeon). */
  seed: number;
  /** Local ids of the treasures opened, the monsters defeated and the people talked to. */
  found: string[];
  felled: string[];
  met: string[];
}

/**
 * Which way a chapter is played, read from the free `kind` label the story gave it. Anything that
 * is not plainly a climb or a maze happens on the land.
 */
export function chapterKind(kind: string): ChapterKind {
  const text = kind.toLowerCase();
  if (/platform|climb|jump|parkour|side.?scroll|平台|攀|跳|橫向|横向|爬/.test(text)) return "side";
  if (/maze|dungeon|labyrinth|cave|catacomb|crypt|迷宮|迷宫|地城|地牢|洞窟|地下/.test(text)) {
    return "dungeon";
  }
  return "land";
}

export function chapterPlaceKind(kind: ChapterKind): PlaceKind | null {
  return kind === "land" ? null : kind;
}

const TARGET = /^chapter:(e[1-9][0-9]?):([a-z][a-z0-9_]*)$/;
const MONSTER = /^ch_(e[1-9][0-9]?)_([a-z][a-z0-9_]*)$/;

/** Interaction id of a person or treasure of a chapter on the land. */
export function chapterTarget(episodeId: string, localId: string): string {
  return `chapter:${episodeId}:${localId}`;
}

export function parseChapterTarget(id: string): { episodeId: string; localId: string } | null {
  const match = TARGET.exec(id);
  return match === null ? null : { episodeId: match[1] ?? "", localId: match[2] ?? "" };
}

/** Combatant id of a chapter's monster (the roster's ids are plain snake_case). */
export function chapterMonsterId(episodeId: string, localId: string): string {
  return `ch_${episodeId}_${localId}`;
}

export function parseChapterMonster(id: string): { episodeId: string; localId: string } | null {
  const match = MONSTER.exec(id);
  return match === null ? null : { episodeId: match[1] ?? "", localId: match[2] ?? "" };
}

export interface ChapterParts {
  npcs: readonly string[];
  treasures: readonly string[];
  monsters: readonly string[];
}

/** What is still undone; the chapter is cleared when all three are 0. */
export function chapterLeft(
  parts: ChapterParts,
  stage: Pick<ChapterStage, "found" | "felled" | "met">,
): { talk: number; find: number; defeat: number } {
  return {
    talk: parts.npcs.filter((id) => !stage.met.includes(id)).length,
    find: parts.treasures.filter((id) => !stage.found.includes(id)).length,
    defeat: parts.monsters.filter((id) => !stage.felled.includes(id)).length,
  };
}

function unit(seed: number, n: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(n + 1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x27d4eb2f);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** Rings around the gate (tiles): people close, finds a little further, monsters on the edge. */
const RINGS = { npcs: [2, 4], treasures: [4, 7], monsters: [6, 10] } as const;

export type Spot = readonly [number, number];

/**
 * World tiles for everything a chapter brings, on ground `free` says can be stood on, around the
 * gate tile `gate`: nobody stands on the gate or on anyone else. Deterministic from `seed`, so a
 * chapter looks the same on every load. An entity that finds no ground is left out (null).
 */
export function settleAround(
  gate: Spot,
  counts: { npcs: number; treasures: number; monsters: number },
  seed: number,
  free: (x: number, z: number) => boolean,
): { npcs: (Spot | null)[]; treasures: (Spot | null)[]; monsters: (Spot | null)[] } {
  const taken = new Set([`${gate[0]},${gate[1]}`]);
  let n = 0;
  const place = (ring: readonly [number, number]): Spot | null => {
    const start = unit(seed, n) * Math.PI * 2 + n * GOLDEN_ANGLE;
    n += 1;
    for (let r = ring[0]; r <= ring[1]; r += 1) {
      for (let step = 0; step < 16; step += 1) {
        const angle = start + step * ((Math.PI * 2) / 16);
        const x = gate[0] + Math.round(Math.cos(angle) * r);
        const z = gate[1] + Math.round(Math.sin(angle) * r);
        const key = `${x},${z}`;
        if (taken.has(key) || !free(x, z)) continue;
        taken.add(key);
        return [x, z];
      }
    }
    return null;
  };
  const all = (count: number, ring: readonly [number, number]) =>
    Array.from({ length: count }, () => place(ring));
  return {
    npcs: all(counts.npcs, RINGS.npcs),
    treasures: all(counts.treasures, RINGS.treasures),
    monsters: all(counts.monsters, RINGS.monsters),
  };
}
