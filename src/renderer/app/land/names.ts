// Names already in use on the land. A witness's new residents and a chapter's people each get a
// name of their own: the prompts list these nearest first, and the parsers send back a new person
// who takes one (a repair round). Both are read again at every check, not only when a prompt is
// written: at New game the origin is witnessed while chapter 1 is written, neither sees the other
// when it starts, and whichever lands second is held to the names of the one that landed first.

import { parseScene } from "@dsl";
import { readChapter } from "@renderer/engine2d/chapterLayer";
import { useLandStore, useSessionStore, useWorldStore } from "@renderer/state";
import type { ChapterStage } from "@shared/chapter";
import { type ChunkCoord, chunkDistance, chunkKey, chunksAround } from "@shared/chunks";
import { type StoryEpisode, storyEpisodes } from "@shared/story";

const ORIGIN: ChunkCoord = { cx: 0, cz: 0 };
/** A chapter's gate hears of the land this many chunks around it (and always of the origin). */
const GATE_RADIUS = 2;

/** The people a written chapter brought, by name: its land cast, or a place's residents. */
function chapterPeople(stage: ChapterStage): string[] {
  if (stage.kind === "land") return (readChapter(stage.source)?.npcs ?? []).map((npc) => npc.name);
  const scene = parseScene(stage.source);
  return scene.ok ? scene.value.npcs.map((npc) => npc.name) : [];
}

/** Every chapter written so far but `except`, with its gate and its people. */
function writtenChapters(except: string | null): { at: ChunkCoord; names: string[] }[] {
  const { progress } = useLandStore.getState();
  const plan = useSessionStore.getState().activeInstance?.cartridge.story ?? null;
  const episodes = plan === null ? [] : storyEpisodes(plan, progress?.storyMore);
  return episodes.flatMap((episode) => {
    const stage = progress?.episodes?.[episode.id]?.stage;
    if (episode.id === except || stage === undefined || stage === null) return [];
    return [{ at: { cx: episode.cx, cz: episode.cz }, names: chapterPeople(stage) }];
  });
}

/** Who lives on a witnessed chunk (the origin's authored village counts as its own). */
function residents(coord: ChunkCoord): string[] {
  const chunk = useLandStore.getState().chunks[chunkKey(coord)];
  const witnessed = chunk?.status === "written" ? chunk.scene.npcs.map((npc) => npc.name) : [];
  if (coord.cx !== ORIGIN.cx || coord.cz !== ORIGIN.cz) return witnessed;
  const scene = useWorldStore.getState().scene;
  return [
    ...(scene.status === "ready" ? scene.value.npcs.map((npc) => npc.name) : []),
    ...witnessed,
  ];
}

/** Nearest first (a stable sort keeps each group's own order), trimmed, once each. */
function nearestFirst(groups: { away: number; names: string[] }[]): string[] {
  const names = [...groups].sort((a, b) => a.away - b.away).flatMap((group) => group.names);
  return [...new Set(names.map((name) => name.trim()).filter((name) => name !== ""))];
}

/**
 * Names a new resident of `coord` must not take: the residents of its neighbours, then the people
 * of every chapter written so far, nearest gate first (two "Bram"s once stood by chapter 1's gate).
 */
export function namesNearChunk(coord: ChunkCoord): string[] {
  const land = chunksAround(coord, 1).map((near) => ({ away: -1, names: residents(near) }));
  const story = writtenChapters(null).map((chapter) => ({
    away: chunkDistance(chapter.at, coord),
    names: chapter.names,
  }));
  return nearestFirst([...land, ...story]);
}

/**
 * Names a chapter's people must not take: the residents of the land around its gate and of the
 * origin, and the people of every other chapter written so far, nearest the gate first (chapter 1
 * and the origin once both had a "Sumi").
 */
export function namesNearGate(episode: StoryEpisode): string[] {
  const gate = { cx: episode.cx, cz: episode.cz };
  const around = chunksAround(gate, GATE_RADIUS);
  const home = around.some((at) => at.cx === ORIGIN.cx && at.cz === ORIGIN.cz) ? [] : [ORIGIN];
  const land = [...around, ...home].map((at) => ({
    away: chunkDistance(at, gate),
    names: residents(at),
  }));
  const story = writtenChapters(episode.id).map((chapter) => ({
    away: chunkDistance(chapter.at, gate),
    names: chapter.names,
  }));
  return nearestFirst([...land, ...story]);
}
