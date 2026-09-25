// The light over the land where the player stands: the day clock, tinted by the mood of the lore
// written around them (`@shared/lore` regionalTone). A chunk's tone is its hot lore's; between chunk
// centres the tones blend, and the tint itself eases in over a few seconds, so walking from a
// festive village into a grieving one turns the air gradually, never at a chunk border.

import { useLandStore } from "@renderer/state";
import { CHUNK_SIZE } from "@shared/chunks";
import { activate, type LoreNode, regionalTone } from "@shared/lore";
import type { PropKind } from "@shared/world";
import { createDayLight, type DayLight, sampleDayLight, tickDayClock } from "./dayClock";

/** Seconds for the mood tint to cover most of the way to a new region's tone. */
const MOOD_EASE = 2.5;

/** What lights up at dusk, by the prop that carries it. */
export type LampKind = "window" | "vending" | "pole" | "torch" | "stop" | "gate";
export const LAMP_PROPS: Partial<Record<PropKind, LampKind>> = {
  house: "window",
  vending_machine: "vending",
  utility_pole: "pole",
  torch: "torch",
  bus_stop: "stop",
};

const tones = new Map<number, number>();
let tonesFor: readonly LoreNode[] | null = null;

function chunkTone(lore: readonly LoreNode[], cx: number, cz: number): number {
  const key = (cx + 32768) * 65536 + (cz + 32768);
  const hit = tones.get(key);
  if (hit !== undefined) return hit;
  const tone = regionalTone(activate(lore, { coord: { cx, cz }, karma: [] }));
  tones.set(key, tone);
  return tone;
}

/** The lore's tone at world point (x, z), blended between the four nearest chunk centres. */
export function toneAt(lore: readonly LoreNode[], x: number, z: number): number {
  if (lore.length === 0) return 0;
  if (lore !== tonesFor) {
    tones.clear();
    tonesFor = lore;
  }
  const fx = x / CHUNK_SIZE - 0.5;
  const fz = z / CHUNK_SIZE - 0.5;
  const cx = Math.floor(fx);
  const cz = Math.floor(fz);
  const tx = fx - cx;
  const tz = fz - cz;
  const north = chunkTone(lore, cx, cz) * (1 - tx) + chunkTone(lore, cx + 1, cz) * tx;
  const south = chunkTone(lore, cx, cz + 1) * (1 - tx) + chunkTone(lore, cx + 1, cz + 1) * tx;
  return north * (1 - tz) + south * tz;
}

const light = createDayLight();
let eased = 0;
let easedAt: number | null = null;

/**
 * The light at (x, z) for the frame drawn at `now` (ms): advances the clock and eases the mood.
 * Returns one shared object, rewritten every call — read it within the frame, never keep it.
 */
export function landLightAt(x: number, z: number, now: number): DayLight {
  const hour = tickDayClock(now);
  const target = toneAt(useLandStore.getState().lore, x, z);
  const step = easedAt === null ? Number.POSITIVE_INFINITY : Math.max(0, now - easedAt) / 1000;
  easedAt = now;
  eased += (target - eased) * (1 - Math.exp(-step / MOOD_EASE));
  return sampleDayLight(light, hour, eased);
}
