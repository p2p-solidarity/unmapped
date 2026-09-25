// Errands, settled by rules the model never touches again (plan.md §3.3): accept at the giver,
// reach the goal (search the tile, or walk into the named place), report back, receive the
// keepsake. Every step is a ledger entry on the chunk it happened on.

import { useEngineStore, useLandStore, useSessionStore, useWorldStore } from "@renderer/state";
import { type ChunkCoord, chunkKey } from "@shared/chunks";
import {
  type ErrandSpec,
  type ErrandStage,
  errandKey,
  loreCoord,
  parseLandTarget,
} from "@shared/land";
import type { ItemSpec } from "@shared/world";
import { useEffect } from "react";
import { makeKarmaEntry } from "../karmaFile";

export interface ErrandView {
  key: string;
  coord: ChunkCoord;
  errand: ErrandSpec;
  keepsake: ItemSpec | null;
  /** null until accepted. */
  stage: ErrandStage | null;
  /** Name of the place a deliver/guide errand points at, when it is witnessed. */
  placeName: string | null;
  /** Where a lost thing lies, from the giver's own tile: "about 12 tiles north-west". */
  bearing: string | null;
}

const COMPASS = [
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
  "north",
  "north-east",
];

/** Compass words for a step on the map (−z is north). */
export function bearingOf(dx: number, dz: number): string {
  const distance = Math.round(Math.hypot(dx, dz));
  if (distance === 0) return "right where they stand";
  const octant = Math.round(Math.atan2(dz, dx) / (Math.PI / 4));
  return `about ${distance} tiles ${COMPASS[(octant + 8) % 8]}`;
}

function placeName(place: string | null): string | null {
  const coord = place === null ? null : loreCoord(place);
  if (coord === null) return null;
  const chunk = useLandStore.getState().chunks[chunkKey(coord)];
  return chunk?.status === "written" ? chunk.scene.name : null;
}

/** The errand a resident gives, by dialogue npc id (`land:cx,cz:npc`, or an authored id at home). */
export function errandOf(npcId: string): ErrandView | null {
  const target = parseLandTarget(npcId);
  const coord = target?.coord ?? { cx: 0, cz: 0 };
  const giver = target?.npcId ?? npcId;
  const { chunks, progress } = useLandStore.getState();
  const chunk = chunks[chunkKey(coord)];
  if (chunk?.status !== "written" || chunk.errands === null || progress === null) return null;
  const errand = chunk.errands.errands.find((one) => one.giver === giver);
  if (errand === undefined) return null;
  const key = errandKey(coord, errand.id);
  const giverSpec = chunk.scene.npcs.find((npc) => npc.id === giver);
  return {
    key,
    coord,
    errand,
    keepsake: chunk.errands.keepsakes.find((item) => item.id === errand.reward) ?? null,
    stage: progress.errands[key] ?? null,
    placeName: placeName(errand.place),
    bearing:
      errand.tile === null || giverSpec === undefined
        ? null
        : bearingOf(errand.tile.x - giverSpec.x, errand.tile.z - giverSpec.z),
  };
}

function record(
  coord: ChunkCoord,
  action: "request",
  choice: string,
  effect: string,
  npcId: string | null,
): void {
  const world = useWorldStore.getState();
  world.appendKarma(
    makeKarmaEntry({ floor: world.floor, action, choice, effect, npcId, chunk: coord }),
  );
}

export function acceptErrand(view: ErrandView): void {
  useLandStore.getState().setErrand(view.key, "accepted");
  record(view.coord, "request", `accepted ${view.errand.id}`, view.errand.ask, view.errand.giver);
  useSessionStore.getState().toast("info", view.errand.ask);
}

export function reportErrand(view: ErrandView): void {
  if (view.stage !== "reached") return;
  useLandStore.getState().setErrand(view.key, "done");
  if (view.keepsake !== null) useWorldStore.getState().addItem(view.keepsake);
  record(
    view.coord,
    "request",
    `finished ${view.errand.id}`,
    view.keepsake === null ? view.errand.thanks : `${view.errand.thanks} → ${view.keepsake.name}`,
    view.errand.giver,
  );
  useSessionStore.getState().toast("success", view.errand.thanks);
}

/** E on a search tile. */
export function searchAt(targetId: string): void {
  const key = targetId.replace(/^search:/, "");
  const [coordText = "", errandId = ""] = key.split(":");
  const [cx = 0, cz = 0] = coordText.split(",").map(Number);
  const { progress } = useLandStore.getState();
  if (progress?.errands[key] !== "accepted") return;
  useLandStore.getState().setErrand(key, "reached");
  record({ cx, cz }, "request", `found for ${errandId}`, "", null);
  useSessionStore.getState().toast("success", "Found it. Take it back to whoever asked.");
}

/** Walking into the named place settles deliver and guide errands. */
export function useErrandArrivals(): void {
  useEffect(
    () =>
      useEngineStore.subscribe((state, previous) => {
        const here = state.chunk;
        if (here === null || here === previous.chunk) return;
        const { chunks, progress } = useLandStore.getState();
        if (progress === null) return;
        for (const [key, stage] of Object.entries(progress.errands)) {
          if (stage !== "accepted") continue;
          const [coordText = "", errandId = ""] = key.split(":");
          const chunk = chunks[coordText];
          if (chunk?.status !== "written") continue;
          const errand = chunk.errands?.errands.find((one) => one.id === errandId);
          const goal =
            errand?.place === null || errand === undefined ? null : loreCoord(errand.place);
          if (goal === null || goal.cx !== here.cx || goal.cz !== here.cz) continue;
          const [cx = 0, cz = 0] = coordText.split(",").map(Number);
          useLandStore.getState().setErrand(key, "reached");
          record(here, "request", `arrived for ${errandId}`, errand?.ask ?? "", null);
          useSessionStore
            .getState()
            .toast("success", `Arrived. Go back to the one who asked (${cx}, ${cz}).`);
        }
      }),
    [],
  );
}
