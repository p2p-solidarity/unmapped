// The local beat (rev 6 phase 3, D13): a local-only world is its own sequencer, so its owner's
// device beats it on open once 6 h have passed since the last beat (or the genesis). One catch-up
// beat suffices: care depends only on the beat time T. The beat is computed by the shared pure
// `computeBeat`, admitted like any entry (the fold recomputes and compares it), and appended.

import { beatDue, computeBeat } from "@shared/history/beat";
import { readEvent } from "@shared/history/event";
import type { HistoryEvent } from "@shared/history/types";
import { ok, type Result } from "@shared/result";
import type { DeviceKey } from "../identity/deviceKey";
import { commitLocal, isLocalOnly, type LoadedWorld, type VerdictOf } from "./loaded";

/** Beats `world` at `now` when it is due; null when nothing was due (or it is not ours to beat). */
export async function localBeat(
  world: LoadedWorld,
  key: DeviceKey,
  now: Date,
  verdictOf: VerdictOf,
): Promise<Result<HistoryEvent | null>> {
  if (!isLocalOnly(world) || world.owner !== key.author) return ok(null);
  const fold = world.now;
  const lastRt = fold.rt === null ? 0 : Date.parse(fold.rt);
  const at = new Date(Math.max(now.getTime(), lastRt)).toISOString();
  if (!beatDue(fold, at)) return ok(null);
  const computed = computeBeat(fold, at);
  if (!computed.ok) return computed;
  const event = key.signEvent({
    v: 1,
    world: world.id,
    kind: "beat",
    author: key.author,
    at,
    seen: fold.head.n,
    body: computed.value.body,
  });
  const read = readEvent(event);
  if (!read.ok) return read;
  const { added, skipped } = await commitLocal(world, [read.value], at, verdictOf);
  if (added.length === 0) {
    const why = skipped[0];
    return why === undefined
      ? ok(null)
      : { ok: false, error: { code: why.code, message: why.message } };
  }
  return ok(read.value);
}
