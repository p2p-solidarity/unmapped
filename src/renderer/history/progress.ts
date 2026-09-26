// The save's land progress as the land reads it (`LandProgress`), composed from three owners (rev 6
// phase 3, D1): what save.json still keeps live (home, door, felled foes, the story's carry), the
// player's own progress in the world (`progress.json`: errands, episodes, places), and what the
// history holds (chapters, continued chapters, places). The land keeps reading and writing one
// `LandProgress`; these functions say where each part of it really lives.
//
// Errands are keyed by chunk (`cx,cz:errand`) on the land and by witness (`<witness id>:<errand>`)
// in progress.json. Only the live witness of a chunk maps: an errand accepted from a witness that
// is no longer live (a legend, a losing variant) stays in progress.json untouched and is simply no
// longer offered (D15).

import type { FelledLedger } from "@shared/foes";
import type { DoorSlot, ErrandStage, HomeState, LandProgress } from "@shared/land";
import type { EpisodeProgress } from "@shared/story";
import type { Json } from "@shared/works";
import type { WorldEpisodeProgress, WorldProgress } from "@shared/worldProgress";
import type { LandWorld } from "./landView";

/** The land fields save.json keeps writing for a save that plays in a world. */
export interface LandLive {
  home: HomeState;
  door: (DoorSlot | null)[];
  felled?: FelledLedger;
  storyCarry?: Json | null;
}

export function liveOf(progress: LandProgress): LandLive {
  return {
    home: progress.home,
    door: progress.door,
    ...(progress.felled === undefined ? {} : { felled: progress.felled }),
    ...(progress.storyCarry === undefined ? {} : { storyCarry: progress.storyCarry }),
  };
}

/** `cx,cz:errandId` on the land → `<live witness id>:<errandId>` in progress.json. */
export function errandWorldKey(world: LandWorld, landKey: string): string | null {
  const cut = landKey.indexOf(":");
  if (cut < 0) return null;
  const witness = world.witnessOf[landKey.slice(0, cut)];
  return witness === undefined ? null : `${witness}${landKey.slice(cut)}`;
}

function landErrands(world: LandWorld, personal: WorldProgress): Record<string, ErrandStage> {
  const byWitness = new Map(Object.entries(world.witnessOf).map(([key, id]) => [id, key]));
  const out: Record<string, ErrandStage> = {};
  for (const [key, stage] of Object.entries(personal.errands)) {
    const cut = key.indexOf(":");
    const chunk = byWitness.get(key.slice(0, cut));
    if (chunk !== undefined) out[`${chunk}${key.slice(cut)}`] = stage;
  }
  return out;
}

const NO_EPISODE: WorldEpisodeProgress = {
  cleared: false,
  summary: null,
  found: [],
  felled: [],
  met: [],
};

function episodeOf(world: LandWorld, id: string, mine: WorldEpisodeProgress): EpisodeProgress {
  const chapter = world.chapters[id];
  const base: EpisodeProgress = {
    draftId: null,
    work: null,
    playId: mine.playId ?? null,
    cleared: mine.cleared,
    summary: mine.summary,
    stage: null,
  };
  if (chapter === undefined) return base;
  // A chapter played as an AI work, or a draft never published, reads as told: nobody rewrites it.
  if (chapter.kind === "closed") return { ...base, cleared: true };
  if (chapter.kind === "work") return { ...base, work: chapter.work, cleared: true };
  return {
    ...base,
    stage: { ...chapter.stage, found: mine.found, felled: mine.felled, met: mine.met },
  };
}

export function composeProgress(
  live: LandLive,
  personal: WorldProgress,
  world: LandWorld,
): LandProgress {
  const episodes: Record<string, EpisodeProgress> = {};
  const ids = new Set([...Object.keys(world.chapters), ...Object.keys(personal.episodes)]);
  for (const id of ids) episodes[id] = episodeOf(world, id, personal.episodes[id] ?? NO_EPISODE);
  const places = world.places.map((place) => {
    const mine = personal.places[place.id];
    const cleared = mine?.cleared ?? false;
    if (place.kind !== "otherworld") return { ...place, cleared };
    return { ...place, cleared, ...(mine?.playId === undefined ? {} : { playId: mine.playId }) };
  });
  return {
    ...live,
    errands: landErrands(world, personal),
    episodes,
    storyMore: world.storyMore,
    places,
  };
}

const STAGE_RANK: Record<ErrandStage, number> = { accepted: 0, reached: 1, done: 2 };

/** An errand stage set from the land; it only moves forward. */
export function withErrand(
  personal: WorldProgress,
  world: LandWorld,
  landKey: string,
  stage: ErrandStage,
): WorldProgress {
  const key = errandWorldKey(world, landKey);
  if (key === null) return personal;
  const had = personal.errands[key];
  if (had !== undefined && STAGE_RANK[had] >= STAGE_RANK[stage]) return personal;
  return { ...personal, errands: { ...personal.errands, [key]: stage } };
}

/** What the land changed about an episode, kept where it belongs (the chapter itself is history's). */
export function withEpisode(
  personal: WorldProgress,
  id: string,
  patch: Partial<EpisodeProgress>,
): WorldProgress {
  const before = personal.episodes[id] ?? NO_EPISODE;
  const stage = patch.stage ?? null;
  const playId = patch.playId ?? before.playId ?? null;
  const next: WorldEpisodeProgress = {
    cleared: before.cleared || patch.cleared === true,
    summary: patch.summary === undefined ? before.summary : patch.summary,
    found: stage?.found ?? before.found,
    felled: stage?.felled ?? before.felled,
    met: stage?.met ?? before.met,
    ...(playId === null ? {} : { playId }),
  };
  return { ...personal, episodes: { ...personal.episodes, [id]: next } };
}

export function withPlace(
  personal: WorldProgress,
  id: string,
  patch: { cleared?: boolean; playId?: string },
): WorldProgress {
  const before = personal.places[id] ?? { cleared: false };
  const playId = patch.playId ?? before.playId;
  const next = {
    cleared: before.cleared || patch.cleared === true,
    ...(playId === undefined ? {} : { playId }),
  };
  return { ...personal, places: { ...personal.places, [id]: next } };
}
