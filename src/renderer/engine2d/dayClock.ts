// The land's clock, shared by both looks: one day per DAY_MINUTES of play, counted only while the
// land is drawn and starting each session in the morning, so the same minutes of play always give
// the same light. Per-frame values live in this module (never in a store, Rule 4).

import { DAY_KEYS, MOOD_TINT } from "../engine/palette";

export const DAY_MINUTES = 16;
const START_HOUR = 9;
/** The most one frame may advance the clock: a stalled or hidden window never skips hours. */
const MAX_STEP = 0.25;
/** The sun is up between these hours; the moon keeps the rest. */
const SUNRISE = 5.5;
const SUNSET = 19;
/** Hours either side of sunrise/sunset over which the key light fades out and back in. */
const SWAP = 0.6;

export type Rgb = [number, number, number];

/** The light at one moment, blended from the palette's keys (colours are sRGB, 0–1). */
export interface DayLight {
  hour: number;
  sun: Rgb;
  sunIntensity: number;
  /** Unit vector from the ground toward the key light (x east, y up, z south). */
  sunDir: [number, number, number];
  sky: Rgb;
  ground: Rgb;
  fill: number;
  haze: Rgb;
  far: Rgb;
  wash: Rgb;
  glint: Rgb;
  night: number;
  /** The lore's regional tone it was tinted with, -1 … 1. */
  mood: number;
}

let played = 0;
let lastNow: number | null = null;
let held: number | null = null;

/** Advances the clock to the frame time `now` (ms) and returns the hour, 0–24. */
export function tickDayClock(now: number): number {
  if (lastNow !== null) played += Math.min(MAX_STEP, Math.max(0, (now - lastNow) / 1000));
  lastNow = now;
  return clockHour();
}

export function clockHour(): number {
  if (held !== null) return held;
  return (START_HOUR + (played / (DAY_MINUTES * 60)) * 24) % 24;
}

// Development only: `__landClock.set(19)` jumps the running clock to 19:00, `hold(22)` pins it,
// `hold(null)` lets it run again. The E2E run uses it to photograph dusk and night.
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __landClock: unknown }).__landClock = {
    hour: () => clockHour(),
    set: (hour: number) => {
      held = null;
      played = ((((hour - START_HOUR) % 24) + 24) % 24) * ((DAY_MINUTES * 60) / 24);
    },
    hold: (hour: number | null) => {
      held = hour === null ? null : ((hour % 24) + 24) % 24;
    },
  };
}

interface Key {
  hour: number;
  sun: Rgb;
  sunIntensity: number;
  sky: Rgb;
  ground: Rgb;
  fill: number;
  haze: Rgb;
  far: Rgb;
  wash: Rgb;
  glint: Rgb;
  night: number;
}

function rgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

const KEYS: readonly Key[] = DAY_KEYS.map((key) => ({
  hour: key.hour,
  sun: rgb(key.sun),
  sunIntensity: key.sunIntensity,
  sky: rgb(key.sky),
  ground: rgb(key.ground),
  fill: key.fill,
  haze: rgb(key.haze),
  far: rgb(key.far),
  wash: rgb(key.wash),
  glint: rgb(key.glint),
  night: key.night,
}));
const WARM = rgb(MOOD_TINT.warm);
const GRIM = rgb(MOOD_TINT.grim);

export function createDayLight(): DayLight {
  const black = (): Rgb => [0, 0, 0];
  return {
    hour: 0,
    sun: black(),
    sunIntensity: 0,
    sunDir: [0, 1, 0],
    sky: black(),
    ground: black(),
    fill: 0,
    haze: black(),
    far: black(),
    wash: black(),
    glint: black(),
    night: 0,
    mood: 0,
  };
}

function mix(out: Rgb, a: Rgb, b: Rgb, t: number): void {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
}

/** Fills `out` with the light at `hour`, tinted by `mood` (-1 … 1). Allocates nothing. */
export function sampleDayLight(out: DayLight, hour: number, mood: number): DayLight {
  const h = ((hour % 24) + 24) % 24;
  let index = KEYS.length - 1;
  for (let i = 0; i < KEYS.length; i += 1) {
    if ((KEYS[i]?.hour ?? 0) <= h) index = i;
  }
  const a = KEYS[index] as Key;
  const b = (KEYS[index + 1] ?? KEYS[0]) as Key;
  const span = (b.hour > a.hour ? b.hour : b.hour + 24) - a.hour;
  const t = span <= 0 ? 0 : (h - a.hour) / span;
  out.hour = h;
  mix(out.sun, a.sun, b.sun, t);
  mix(out.sky, a.sky, b.sky, t);
  mix(out.ground, a.ground, b.ground, t);
  mix(out.haze, a.haze, b.haze, t);
  mix(out.far, a.far, b.far, t);
  mix(out.wash, a.wash, b.wash, t);
  mix(out.glint, a.glint, b.glint, t);
  out.sunIntensity = a.sunIntensity + (b.sunIntensity - a.sunIntensity) * t;
  out.fill = a.fill + (b.fill - a.fill) * t;
  out.night = a.night + (b.night - a.night) * t;
  keyDirection(out, h);
  tint(out, mood);
  return out;
}

/**
 * The sun rises in the east, stands in the south (toward the camera) at noon and sets in the west;
 * the moon crosses the same way by night. Near sunrise and sunset the key light fades out and back
 * in, so the shadows turn over while there is no light to cast them.
 */
function keyDirection(out: DayLight, h: number): void {
  const day = h >= SUNRISE && h <= SUNSET;
  const arc = day
    ? (h - SUNRISE) / (SUNSET - SUNRISE)
    : ((h < SUNRISE ? h + 24 : h) - SUNSET) / (24 - SUNSET + SUNRISE);
  const across = Math.PI * arc;
  const height = Math.sin(across);
  const elevation = ((day ? 8 + 54 * height : 22 + 30 * height) * Math.PI) / 180;
  const flat = Math.cos(elevation);
  out.sunDir[0] = Math.cos(across) * flat;
  out.sunDir[1] = Math.sin(elevation);
  out.sunDir[2] = Math.sin(across) * flat;
  const swap = Math.min(Math.abs(h - SUNRISE), Math.abs(h - SUNSET));
  const fade = Math.min(1, swap / SWAP);
  out.sunIntensity *= fade * fade * (3 - 2 * fade);
}

function tint(out: DayLight, mood: number): void {
  const k = Math.max(-1, Math.min(1, mood));
  out.mood = k;
  if (k === 0) return;
  const tone = k > 0 ? WARM : GRIM;
  const s = Math.abs(k);
  mix(out.haze, out.haze, tone, 0.35 * s);
  mix(out.sky, out.sky, tone, 0.3 * s);
  mix(out.far, out.far, tone, 0.2 * s);
  mix(out.sun, out.sun, tone, 0.18 * s);
  for (let i = 0; i < 3; i += 1) {
    out.wash[i] = (out.wash[i] ?? 1) * (1 + ((tone[i] ?? 1) - 1) * 0.35 * s);
  }
  if (k < 0) {
    out.sunIntensity *= 1 - 0.22 * s;
    out.fill *= 1 - 0.1 * s;
  }
}
