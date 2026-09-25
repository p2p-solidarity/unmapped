// The story chapter being played on the land, as things standing around its gate: its people, the
// treasures not yet opened and the foes not yet defeated, in world tiles with world-unique ids
// (@shared/chapter). Only the next uncleared chapter is on the land; a climb or a maze is entered
// from the gate instead. Pure: the caller says which ground can be stood on.

import { type ChapterDraft, parseChapter } from "@dsl";
import type { ChunkStatus } from "@renderer/state";
import { type ChapterStage, chapterMonsterId, chapterTarget, settleAround } from "@shared/chapter";
import { CHUNK_SIZE } from "@shared/chunks";
import { episodeGate, type StoryEpisode } from "@shared/story";
import type { SceneGraph } from "@shared/world";

/** Stored programs parse the same every time; parse each once. */
const read = new Map<string, ChapterDraft | null>();

export function readChapter(source: string): ChapterDraft | null {
  if (!read.has(source)) {
    if (read.size > 32) read.clear();
    const parsed = parseChapter(source, null);
    read.set(source, parsed.ok ? parsed.value : null);
  }
  return read.get(source) ?? null;
}

/**
 * World tiles where a witnessed resident stands ("x,z"). The chapter's people and finds never stand
 * on one: the resident comes first among the targets, so it would always be the nearest there and
 * whoever stood under it could never be reached — the chapter could never be cleared.
 */
export function residentTiles(chunks: Readonly<Record<string, ChunkStatus>>): Set<string> {
  const tiles = new Set<string>();
  for (const [key, chunk] of Object.entries(chunks)) {
    if (chunk.status !== "written") continue;
    const [cx = 0, cz = 0] = key.split(",").map(Number);
    for (const npc of chunk.scene.npcs) {
      tiles.add(`${cx * CHUNK_SIZE + npc.x},${cz * CHUNK_SIZE + npc.z}`);
    }
  }
  return tiles;
}

export function chapterScene(
  episode: StoryEpisode,
  stage: ChapterStage,
  draft: ChapterDraft,
  free: (x: number, z: number) => boolean,
): SceneGraph {
  const gate = episodeGate(episode);
  const spots = settleAround(
    [Math.floor(gate.x), Math.floor(gate.z)],
    {
      npcs: draft.npcs.length,
      treasures: draft.treasures.length,
      monsters: draft.monsters.length,
    },
    stage.seed,
    free,
  );
  const at = <T extends { id: string; x: number; z: number }>(
    items: readonly T[],
    where: readonly (readonly [number, number] | null)[],
    keep: (item: T) => boolean,
    id: (local: string) => string,
  ): T[] =>
    items.flatMap((item, index) => {
      const spot = where[index];
      return spot === null || spot === undefined || !keep(item)
        ? []
        : [{ ...item, id: id(item.id), x: spot[0], z: spot[1] }];
    });
  return {
    name: draft.name,
    biome: "countryside",
    contract: null,
    floor: { width: 0, depth: 0, tile: "grass" },
    patches: [],
    platforms: [],
    walls: [],
    props: [],
    npcs: at(
      draft.npcs,
      spots.npcs,
      () => true,
      (id) => chapterTarget(episode.id, id),
    ),
    monsters: at(
      draft.monsters,
      spots.monsters,
      (monster) => !stage.felled.includes(monster.id),
      (id) => chapterMonsterId(episode.id, id),
    ),
    treasures: at(
      draft.treasures,
      spots.treasures,
      (treasure) => !stage.found.includes(treasure.id),
      (id) => chapterTarget(episode.id, id),
    ),
    exits: [],
    lights: [],
    sky: null,
    triggers: [],
    quests: [{ id: "goal", text: draft.goal }],
  };
}
