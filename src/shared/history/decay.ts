// Care and forgetting (rev 6 phase 3, D13), in whole micro-points so every engine agrees bit for
// bit: Math.pow is not guaranteed to, so the 14-day half-life is a literal table, floor(10⁶ ·
// 2^(−d/14)) for d = 0…180 (generated once with 60-digit decimals, then pasted; 0 after day 180).
//
//   care(c) = Σ points(c, d) × DECAY_PPM[day(T) − d]   over the UTC receipt days d that touched c
//
// where points(c, d) sums CARE_POINTS of every event received on day d that touched c (a visit:
// 1 per chunk, one visit per author per day) and day(x) = floor(x / 1 day). The fold keeps only
// these per-day sums and the last touch per chunk; a beat drops days more than 180 before it.
//
// A live chunk fogs when its care is under FOG_CARE_BELOW, nothing has touched it for
// FOG_QUIET_DAYS, and it lies more than FOG_SAFE_RINGS from the origin (the town never fogs). One
// witness alone fogs on day 69; a visit a week keeps a place. These constants are physics: they are
// in the physics fingerprint (tests/shared/physics.test.ts), and changing one bumps PHYSICS_VERSION.

import { type ChunkCoord, chunkDistance } from "../chunks";
import { DAY_MS } from "./ids";
import type { ChunkNow, EventKind, WorldNow } from "./types";

/** Care points per event kind (D3). Kinds not listed add none. */
export const CARE_POINTS: Readonly<Partial<Record<EventKind, number>>> = {
  witness: 3,
  place: 2,
  chapter: 2,
  note: 2,
  signpost: 1,
  gift: 2,
  "gift.take": 2,
  visit: 1,
  deed: 3,
  rumor: 0,
};

/** floor(10⁶ · 2^(−d/14)) for d = 0…180. */
export const DECAY_PPM: readonly number[] = [
  1_000_000, 951_695, 905_723, 861_972, 820_335, 780_709, 742_997, 707_106, 672_950, 640_443,
  609_506, 580_064, 552_044, 525_378, 500_000, 475_847, 452_861, 430_986, 410_167, 390_354, 371_498,
  353_553, 336_475, 320_221, 304_753, 290_032, 276_022, 262_689, 250_000, 237_923, 226_430, 215_493,
  205_083, 195_177, 185_749, 176_776, 168_237, 160_110, 152_376, 145_016, 138_011, 131_344, 125_000,
  118_961, 113_215, 107_746, 102_541, 97_588, 92_874, 88_388, 84_118, 80_055, 76_188, 72_508,
  69_005, 65_672, 62_500, 59_480, 56_607, 53_873, 51_270, 48_794, 46_437, 44_194, 42_059, 40_027,
  38_094, 36_254, 34_502, 32_836, 31_250, 29_740, 28_303, 26_936, 25_635, 24_397, 23_218, 22_097,
  21_029, 20_013, 19_047, 18_127, 17_251, 16_418, 15_625, 14_870, 14_151, 13_468, 12_817, 12_198,
  11_609, 11_048, 10_514, 10_006, 9_523, 9_063, 8_625, 8_209, 7_812, 7_435, 7_075, 6_734, 6_408,
  6_099, 5_804, 5_524, 5_257, 5_003, 4_761, 4_531, 4_312, 4_104, 3_906, 3_717, 3_537, 3_367, 3_204,
  3_049, 2_902, 2_762, 2_628, 2_501, 2_380, 2_265, 2_156, 2_052, 1_953, 1_858, 1_768, 1_683, 1_602,
  1_524, 1_451, 1_381, 1_314, 1_250, 1_190, 1_132, 1_078, 1_026, 976, 929, 884, 841, 801, 762, 725,
  690, 657, 625, 595, 566, 539, 513, 488, 464, 442, 420, 400, 381, 362, 345, 328, 312, 297, 283,
  269, 256, 244, 232, 221, 210, 200, 190, 181, 172, 164, 156, 148, 141, 134,
];

/** Below this (µpt) a quiet chunk far enough from home fogs: 0.1 point. */
export const FOG_CARE_BELOW = 100_000;
/** …and only once nothing has added care for this many days. */
export const FOG_QUIET_DAYS = 28;
/** Chunks within this many rings of the origin never fog: a safe home and town. */
export const FOG_SAFE_RINGS = 1;
/** Below one point a live chunk draws with thin mist ("fading"). */
export const FADING_BELOW = 1_000_000;
/** A season lasts a week; four of them turn. */
export const SEASON_DAYS = 7;
export const SEASONS = 4;

const ORIGIN: ChunkCoord = { cx: 0, cz: 0 };

/** Whether a chunk is home or in the town around it (FOG_SAFE_RINGS): it never fogs, nor fades. */
export function inTown(coord: ChunkCoord): boolean {
  return chunkDistance(coord, ORIGIN) <= FOG_SAFE_RINGS;
}

/** Touch days further back than this weigh 0; a beat drops them. */
export const TOUCH_KEEP_DAYS = DECAY_PPM.length - 1;

/** The UTC day index of a time in ms. */
export function dayOf(ms: number): number {
  return Math.floor(ms / DAY_MS);
}

/** The weight (ppm) of something done `days` whole days before the beat. */
export function decayPpm(days: number): number {
  if (days < 0) return DECAY_PPM[0] ?? 0;
  return DECAY_PPM[days] ?? 0;
}

/** Care (µpt) per chunk key on UTC day `day`, from the per-day sums. */
export function careAt(
  touches: Readonly<Record<string, Readonly<Record<string, number>>>>,
  day: number,
): Record<string, number> {
  const care: Record<string, number> = {};
  for (const [key, days] of Object.entries(touches)) {
    let sum = 0;
    for (const [touched, points] of Object.entries(days)) {
      sum += points * decayPpm(day - Number(touched));
    }
    care[key] = sum;
  }
  return care;
}

/** The per-day sums a beat on day `day` keeps: nothing more than TOUCH_KEEP_DAYS back. */
export function pruneTouches(
  touches: Readonly<Record<string, Readonly<Record<string, number>>>>,
  day: number,
): Record<string, Record<string, number>> {
  const kept: Record<string, Record<string, number>> = {};
  for (const [key, days] of Object.entries(touches)) {
    const recent = Object.entries(days).filter(
      ([touched]) => day - Number(touched) <= TOUCH_KEEP_DAYS,
    );
    if (recent.length > 0) kept[key] = Object.fromEntries(recent);
  }
  return kept;
}

/**
 * Whether a witnessed chunk stands: its live witness is neither fogged nor hidden. Only standing
 * chunks hold live lore, tell rumors, gather care and can fog; any other can be re-witnessed.
 */
export function chunkStands(now: Pick<WorldNow, "hidden">, chunk: ChunkNow): boolean {
  return !chunk.fogged && now.hidden[chunk.live.id] !== true;
}
