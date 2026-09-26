// The season over both looks (rev 6 phase 3, D13). The season is the world's, as its last beat set
// it in the fold (`WorldNow.season`); this module only turns it into colour, from the palette:
// the 16-bit canvas multiplies LAND_2D_SEASON into the day's wash, the diorama multiplies
// HD2D_SEASON into its air (haze, fog, sky fill, distant landmarks), sun and ground fill. No game
// rule lives here — nothing decides a season, and a land without a history is not tinted.
//
// Per frame and allocation-free: `seasonLight` rewrites one shared copy of the day's light each
// call (the input is never changed, so nothing accumulates), read within the frame, never kept.

import { openWorld } from "@renderer/state";
import type { WorldNow } from "@shared/history/types";
import { HD2D_SEASON, LAND_2D_SEASON } from "../engine/palette";
import { createDayLight, type DayLight, type Rgb } from "./dayClock";

type Season = WorldNow["season"];

function rgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

const WASH: readonly Rgb[] = LAND_2D_SEASON.map(rgb);
const DIORAMA = HD2D_SEASON.map((tint) => ({
  air: rgb(tint.air),
  sun: rgb(tint.sun),
  ground: rgb(tint.ground),
}));

/** The season of the open world's last beat, or null when the land plays on no history. */
export function landSeason(): Season | null {
  return openWorld()?.now.season ?? null;
}

function times(out: Rgb, color: Rgb, tint: Rgb | undefined): void {
  out[0] = color[0] * (tint?.[0] ?? 1);
  out[1] = color[1] * (tint?.[1] ?? 1);
  out[2] = color[2] * (tint?.[2] ?? 1);
}

const tinted = createDayLight();

/** The day's light with the season's tint over it; `light` itself when there is no season. */
export function seasonLight(light: DayLight): DayLight {
  const season = landSeason();
  if (season === null) return light;
  const diorama = DIORAMA[season];
  tinted.hour = light.hour;
  tinted.sunIntensity = light.sunIntensity;
  tinted.fill = light.fill;
  tinted.night = light.night;
  tinted.mood = light.mood;
  tinted.sunDir[0] = light.sunDir[0];
  tinted.sunDir[1] = light.sunDir[1];
  tinted.sunDir[2] = light.sunDir[2];
  times(tinted.glint, light.glint, undefined);
  times(tinted.wash, light.wash, WASH[season]);
  times(tinted.haze, light.haze, diorama?.air);
  times(tinted.sky, light.sky, diorama?.air);
  times(tinted.far, light.far, diorama?.air);
  times(tinted.sun, light.sun, diorama?.sun);
  times(tinted.ground, light.ground, diorama?.ground);
  return tinted;
}

/** A frame whose light carries the season (the same frame when it has no light or no season). */
export function withSeason<F extends { light?: DayLight }>(frame: F): F {
  if (frame.light === undefined || landSeason() === null) return frame;
  return { ...frame, light: seasonLight(frame.light) };
}
