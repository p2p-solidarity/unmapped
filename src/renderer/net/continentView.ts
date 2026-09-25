// The room document → what this world draws of the others. Every foreign world is parsed (its
// programs go through the DSL, so a hostile peer cannot hand the engine x = 9000), shifted into
// this world's coordinates, and cut down to its own territory. Pure apart from the parser.

import { parseScene } from "@dsl";
import type { ChunkStatus, ForeignWorld } from "@renderer/state";
import { CHUNK_SIZE, type ChunkCoord, chunkKey, clearFords } from "@shared/chunks";
import {
  type ContinentWorldEntry,
  resolveAnchors,
  shiftChunk,
  type TerritoryMap,
  territoryMap,
} from "@shared/continent";
import type { LandNote, WitnessedChunk } from "@shared/land";
import type { SceneGraph } from "@shared/world";
import { doorPosition } from "../engine/home";
import type { ContinentSnapshot } from "./continentDoc";

export interface ContinentView {
  anchor: ChunkCoord;
  worlds: ForeignWorld[];
  chunks: Record<string, ChunkStatus>;
  notes: LandNote[];
  territory: TerritoryMap;
}

/**
 * What of another world's origin is shown: its ground and its people. Its foes, treasures, exits
 * and triggers belong to its owner's game and are not played by visitors.
 */
function publicOrigin(scene: SceneGraph): SceneGraph {
  return { ...scene, monsters: [], treasures: [], exits: [], triggers: [], quests: [] };
}

function merge(origin: SceneGraph, overlay: SceneGraph | null): SceneGraph {
  if (overlay === null) return origin;
  return {
    ...origin,
    name: overlay.name,
    patches: [...origin.patches, ...overlay.patches],
    walls: [...origin.walls, ...overlay.walls],
    props: [...origin.props, ...overlay.props],
    npcs: [...origin.npcs, ...overlay.npcs],
  };
}

function written(
  scene: SceneGraph,
  dialogues: Record<string, string>,
  at: ChunkCoord,
): ChunkStatus {
  // Visitors are told a resident's words, never handed their errands: those are the owner's game.
  return { status: "written", scene: clearFords(scene, at), dialogues, errands: null };
}

function failed(message: string): ChunkStatus {
  return {
    status: "failed",
    error: { code: "room-chunk-invalid", message, hint: "Ask its owner to rejoin." },
  };
}

interface Parsed {
  entry: ContinentWorldEntry;
  origin: SceneGraph;
}

/**
 * The view of `viewerId`, or null until its own entry is in the document (its anchor is not known
 * before). `online` holds the worlds whose owners are in the room right now.
 */
export function buildContinentView(
  snapshot: ContinentSnapshot,
  viewerId: string,
  online: ReadonlySet<string>,
): ContinentView | null {
  const anchors = resolveAnchors(
    snapshot.worlds.map((entry) => ({
      worldId: entry.worldId,
      anchor: entry.anchor,
      joinedAt: entry.joinedAt,
    })),
  );
  const mine = anchors.find((claim) => claim.worldId === viewerId)?.anchor;
  if (mine === undefined) return null;
  const others: Parsed[] = [];
  for (const entry of snapshot.worlds) {
    if (entry.worldId === viewerId) continue;
    const origin = parseScene(entry.origin);
    if (origin.ok) others.push({ entry, origin: publicOrigin(origin.value) });
  }
  const territory = territoryMap(
    viewerId,
    anchors.filter(
      (claim) =>
        claim.worldId === viewerId || others.some((o) => o.entry.worldId === claim.worldId),
    ),
    others.map(({ entry, origin }) => ({ worldId: entry.worldId, seed: entry.seed, origin })),
  );

  const worlds: ForeignWorld[] = [];
  const chunks: Record<string, ChunkStatus> = {};
  const notes: LandNote[] = [];
  for (const { entry, origin } of others) {
    const anchor = anchors.find((claim) => claim.worldId === entry.worldId)?.anchor ?? entry.anchor;
    const shift = shiftChunk({ cx: 0, cz: 0 }, anchor, mine);
    const owns = (coord: ChunkCoord) => territory.at(coord)?.worldId === entry.worldId;
    const own = snapshot.chunks.get(entry.worldId) ?? [];
    const overlayAt = (coord: ChunkCoord): WitnessedChunk | undefined =>
      own.find((chunk) => chunk.cx === coord.cx && chunk.cz === coord.cz);

    for (const chunk of own) {
      if (chunk.cx === 0 && chunk.cz === 0) continue;
      const at = shiftChunk(chunk, anchor, mine);
      if (!owns(at)) continue;
      const scene = parseScene(chunk.scene);
      chunks[chunkKey(at)] = scene.ok
        ? written(scene.value, chunk.dialogues, at)
        : failed(scene.error.message);
    }
    // Its origin chunk: the authored village plus whatever was witnessed around it.
    const home = overlayAt({ cx: 0, cz: 0 });
    const overlay = home === undefined ? null : parseScene(home.scene);
    chunks[chunkKey(shift)] = written(
      merge(origin, overlay?.ok ? overlay.value : null),
      { ...(home?.dialogues ?? {}), ...entry.originDialogues },
      shift,
    );

    for (const note of snapshot.notes.get(entry.worldId) ?? []) {
      const at = shiftChunk(note.coord, anchor, mine);
      if (owns(at)) notes.push({ ...note, coord: { ...note.coord, cx: at.cx, cz: at.cz } });
    }

    const [doorX, doorZ] = doorPosition(origin, entry.home);
    worlds.push({
      worldId: entry.worldId,
      owner: entry.owner,
      title: entry.title,
      anchor,
      shift,
      online: online.has(entry.worldId),
      originTile: { x: shift.cx * CHUNK_SIZE, z: shift.cz * CHUNK_SIZE },
      door: { x: doorX + shift.cx * CHUNK_SIZE, z: doorZ + shift.cz * CHUNK_SIZE },
      slots: entry.door,
      keepsakes: entry.home.keepsakes.map((item) => item.name),
    });
  }
  notes.sort((a, b) => a.at.localeCompare(b.at));
  return { anchor: mine, worlds, chunks, notes, territory };
}
