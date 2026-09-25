// What open land keeps in a save once somebody has walked there (plan.md §4): each witnessed
// chunk as ordinary Scene and Dialogue programs, and the lore graph those chunks added.

import type { SaveState } from "./cartridge";
import type { ChunkCoord } from "./chunks";
import { seedFromText } from "./endless";
import type { LoreNode } from "./lore";
import type { LandPlace } from "./places";
import type { EpisodeProgress, StoryEpisode } from "./story";
import type { Json } from "./works";
import type { ItemSpec } from "./world";

/**
 * A resident's small errand (plan.md §3.3), written when their place was witnessed and settled by
 * deterministic rules afterwards: `find` is reached by searching a tile of this chunk, `deliver`
 * and `guide` by walking into the named place. Either way the giver is told, and hands over the
 * keepsake.
 */
export const ERRAND_KINDS = ["find", "deliver", "guide"] as const;
export type ErrandKind = (typeof ERRAND_KINDS)[number];

export interface ErrandSpec {
  id: string;
  kind: ErrandKind;
  /** NPC id of whoever asks, in this chunk (or the authored village at the origin). */
  giver: string;
  /** What they ask, in the player's language. */
  ask: string;
  /** What they say when it is done. */
  thanks: string;
  /** Item id of the keepsake handed over. */
  reward: string;
  /** `find`: local tile of this chunk. */
  tile: { x: number; z: number } | null;
  /** `deliver` / `guide`: place lore id of another witnessed chunk. */
  place: string | null;
}

export interface WitnessedErrands {
  errands: ErrandSpec[];
  keepsakes: ItemSpec[];
}

export type ErrandStage = "accepted" | "reached" | "done";

/** One of the four dials on the door: a witnessed place, or (P4) a friend's door code. */
export type DoorSlot =
  | { kind: "place"; cx: number; cz: number; label: string }
  | { kind: "room"; code: string; label: string };

export interface HomeState {
  cx: number;
  cz: number;
  /** Keepsakes brought home, in the order they were placed. */
  keepsakes: ItemSpec[];
}

/** Everything open land adds to a save beyond position: errands, home and door. */
export interface LandProgress {
  /** Keyed by `errandKey`. */
  errands: Record<string, ErrandStage>;
  home: HomeState;
  door: (DoorSlot | null)[];
  /** Story episodes played so far, keyed by episode id; absent until the first one is opened. */
  episodes?: Record<string, EpisodeProgress>;
  /** What the player carries from episode to episode (merged from each world's `complete`). */
  storyCarry?: Json | null;
  /**
   * Chapters the land wrote after the cartridge's episodes were all cleared, oldest first. They
   * belong to this save, not the cartridge; ids and gates are chosen by the host (`STORY_CAP`).
   */
  storyMore?: StoryEpisode[];
  /** Side-scrolling courses and grid dungeons added to this land, entered from their gates. */
  places?: LandPlace[];
}

export const DOOR_SLOTS = 4;

export function errandKey(coord: ChunkCoord, errandId: string): string {
  return `${coord.cx},${coord.cz}:${errandId}`;
}

/** The chunk a lore id was written on (`slug@cx,cz`). */
export function loreCoord(id: string): ChunkCoord | null {
  const match = /@(-?\d+),(-?\d+)$/.exec(id);
  return match === null ? null : { cx: Number(match[1]), cz: Number(match[2]) };
}

export interface WitnessedChunk extends ChunkCoord {
  /** Scene program in the chunk's local tiles; its name is what the locals call the place. */
  scene: string;
  /** Dialogue program per resident, keyed by NPC id. */
  dialogues: Record<string, string>;
  /** Errands program (errands and their keepsakes); absent when nobody here asked for anything. */
  errands?: string;
}

/**
 * A note left on the land (手記, plan.md §6): the player's own words, never the model's, anchored
 * to where it was written and to what the world remembers there. Notes may contradict each other;
 * `contests` names the note this one disagrees with. Nothing reconciles them.
 */
export interface LandNote {
  id: string;
  author: string;
  at: string;
  /** Chunk plus local tile. */
  coord: { cx: number; cz: number; x: number; z: number };
  /** Lore ids of what stands here (the place), if it was witnessed. */
  anchors: string[];
  text: string;
  contests: string | null;
}

export const NOTE_MAX_CHARS = 280;

export interface LandRecord {
  chunks: WitnessedChunk[];
  lore: LoreNode[];
  notes: LandNote[];
}

export interface AppendNoteInput {
  instanceId: string;
  note: LandNote;
}

export interface WitnessChunkInput extends WitnessedChunk {
  instanceId: string;
  /** Nodes this chunk adds; ids and links are checked against the stored graph. */
  lore: LoreNode[];
}

const LAND_TARGET = /^land:(-?\d+),(-?\d+):([a-z][a-z0-9_]*)$/;

/** Interaction id of a resident of a witnessed chunk — unique across the whole land. */
export function landNpcTarget(coord: ChunkCoord, npcId: string): string {
  return `land:${coord.cx},${coord.cz}:${npcId}`;
}

export function parseLandTarget(id: string): { coord: ChunkCoord; npcId: string } | null {
  const match = LAND_TARGET.exec(id);
  if (match === null) return null;
  return { coord: { cx: Number(match[1]), cz: Number(match[2]) }, npcId: match[3] ?? "" };
}

/**
 * The numeric seed the land of a save is generated from: its world seed, or — for saves made
 * before seeds existed — its cartridge id, so their land does not change under them.
 */
export function landSeedOf(save: Pick<SaveState, "seed" | "cartridge">): number {
  return seedFromText(save.seed ?? save.cartridge.cartridgeId);
}
