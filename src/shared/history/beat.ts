// Beats (rev 6 phase 3, D13): at time T the beater folds care, returns quiet places to fog, turns
// the season and opens rumor slots. `computeBeat` is pure over the fold at `upTo` and T only, and
// a beat entry is valid only if it deep-equals the recomputation (./admit), so the service
// (JavaScriptCore) and every app (V8) agree or the beat is skipped as `beat-mismatch`.
//
// The fingerprint is what an optional chain would record later; nothing here writes a chain.

import { canonicalJson } from "../canonical";
import { type ChunkCoord, chunkDistance, chunkKey } from "../chunks";
import { err, ok, type Result } from "../result";
import {
  careAt,
  chunkStands,
  dayOf,
  FOG_CARE_BELOW,
  FOG_QUIET_DAYS,
  FOG_SAFE_RINGS,
  SEASON_DAYS,
  SEASONS,
} from "./decay";
import { contentHash, DAY_MS, isIsoTime, timeMs } from "./ids";
import { pickRumorSlots } from "./rumor";
import type { BeatBody, WorldNow } from "./types";

/** The service beats every 6 h; a local-only world's owner device beats on open once 6 h passed. */
export const BEAT_EVERY_MS = 6 * 60 * 60 * 1000;

const ORIGIN: ChunkCoord = { cx: 0, cz: 0 };

export interface BeatComputation {
  /** The beat event's body. */
  body: BeatBody;
  /** Care (µpt) of every standing chunk (`chunkStands`) before this beat's fog: in the fingerprint. */
  care: Record<string, number>;
}

/** season = floor((T − rt_genesis) / 7 days) mod 4. */
export function seasonAt(genesisRt: string, at: string): 0 | 1 | 2 | 3 {
  const weeks = Math.floor(Math.max(0, timeMs(at) - timeMs(genesisRt)) / (SEASON_DAYS * DAY_MS));
  return (weeks % SEASONS) as 0 | 1 | 2 | 3;
}

/** When the last beat was (or the genesis was received, before any beat). */
export function lastBeatAt(now: WorldNow): string | null {
  return now.beats[now.beats.length - 1]?.body.at ?? now.genesisRt;
}

/** Whether a beat is due at `at`: 6 h since the last one (or since the genesis). */
export function beatDue(now: WorldNow, at: string): boolean {
  const last = lastBeatAt(now);
  return last !== null && timeMs(at) - timeMs(last) >= BEAT_EVERY_MS;
}

export function beatFingerprint(input: {
  world: string;
  upTo: number;
  chain: string;
  at: string;
  season: number;
  fog: readonly string[];
  slots: BeatBody["slots"];
  care: Record<string, number>;
}): string {
  return contentHash(canonicalJson(input));
}

/**
 * D13: the beat at time `at` over `now` (the fold at upTo = now.head.n). Refused when `at` is not
 * a strict ISO time, is before the previous beat or before the receipt of upTo, when the fold
 * carries provisional (outbox) events, or before the genesis entry was folded.
 */
export function computeBeat(now: WorldNow, at: string): Result<BeatComputation> {
  if (now.pending > 0) {
    return err("beat-pending", "A beat folds only sequenced history, not the outbox.");
  }
  if (now.genesisRt === null) return err("beat-no-genesis", "The genesis entry is not folded yet.");
  if (!isIsoTime(at)) return err("beat-time", "A beat's time must be a strict ISO time.");
  const T = timeMs(at);
  const previous = now.beats[now.beats.length - 1];
  if (previous !== undefined && T < timeMs(previous.body.at)) {
    return err("beat-time", "A beat cannot come before the previous beat.");
  }
  if (now.rt !== null && T < timeMs(now.rt)) {
    return err("beat-time", "A beat cannot come before the history it folds.");
  }
  const sums = careAt(now.touches, dayOf(T));
  const care: Record<string, number> = {};
  const fog: string[] = [];
  const standing = Object.values(now.chunks)
    .filter((chunk) => chunkStands(now, chunk))
    .sort((a, b) => a.cx - b.cx || a.cz - b.cz);
  for (const chunk of standing) {
    const key = chunkKey(chunk);
    const value = sums[key] ?? 0;
    care[key] = value;
    const touched = now.lastTouch[key];
    const quiet = touched === undefined || T - touched >= FOG_QUIET_DAYS * DAY_MS;
    if (value < FOG_CARE_BELOW && quiet && chunkDistance(chunk, ORIGIN) > FOG_SAFE_RINGS) {
      fog.push(key);
    }
  }
  const upTo = now.head.n;
  const slots = pickRumorSlots(now, previous?.body.upTo ?? 0, upTo, fog);
  const season = seasonAt(now.genesisRt, at);
  const fingerprint = beatFingerprint({
    world: now.world,
    upTo,
    chain: now.head.chain,
    at,
    season,
    fog,
    slots,
    care,
  });
  return ok({ body: { upTo, at, season, fog, slots, fingerprint }, care });
}
