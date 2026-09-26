// What a checkpoint may do to a save that plays in a world (rev 6 phase 3, D1, D6). Once a save
// has a `world.json`, its land content lives in the world's history and this build never writes the
// legacy copy again: the legacy land fields of `save.json` (`land.places`, `land.storyMore`,
// `land.errands`, each `land.episodes[*].stage`) are frozen — read by an older build and by the
// catch-up, never changed — and `karma.jsonl` only grows (its lines date migrated deeds). A
// checkpoint that would change either is refused whole, so nothing half-written reaches disk:
//
// - `legacy-land-changed`: one of the frozen fields differs from what save.json holds (an absent
//   field and an empty one are the same: a new game never had any);
// - `karma-not-append-only`: the ledger sent is not the stored one plus new lines;
// - `progress-world-mismatch` / `progress-no-world`: progress.json for another world, or for a save
//   that has no world yet.
//
// The player's own progress in the world goes to `progress.json`, merged with what is stored so a
// catch-up that ran meanwhile is never undone (`mergeProgress`: nothing moves backwards).

import { canonicalJson } from "@shared/canonical";
import type { InstanceProgressInput, InstanceRecord } from "@shared/cartridge";
import type { LandProgress } from "@shared/land";
import { err, ok, type Result } from "@shared/result";
import type { WorldProgress } from "@shared/worldProgress";
import { mergeProgress, readProgress, readWorldPin } from "../histories/pin";

/** The legacy land fields a migrated save keeps exactly as they were (D6 "Source files"). */
export function frozenLand(land: LandProgress | undefined): Record<string, unknown> {
  const stages: Record<string, unknown> = {};
  for (const [id, episode] of Object.entries(land?.episodes ?? {})) {
    if ((episode.stage ?? null) !== null) stages[id] = episode.stage;
  }
  return {
    places: land?.places ?? [],
    storyMore: land?.storyMore ?? [],
    errands: land?.errands ?? {},
    stages,
  };
}

/** The first frozen field `next` changes, or null when it keeps them all. */
export function legacyLandChange(
  stored: LandProgress | undefined,
  next: LandProgress,
): string | null {
  const before = frozenLand(stored);
  const after = frozenLand(next);
  for (const field of Object.keys(before)) {
    if (canonicalJson(before[field]) !== canonicalJson(after[field])) return field;
  }
  return null;
}

/** Whether `next` is `stored` with lines added at the end (the same lines, in the same order). */
export function karmaExtends(
  stored: InstanceRecord["karma"],
  next: InstanceProgressInput["karma"],
): boolean {
  if (next.length < stored.length) return false;
  return stored.every((line, index) => canonicalJson(line) === canonicalJson(next[index]));
}

/**
 * The checks above for the save in `saveDir`, and the progress.json to write with this checkpoint
 * (null: none). A save without a world keeps today's behaviour.
 */
export async function checkpointWorld(
  saveDir: string,
  current: InstanceRecord,
  input: InstanceProgressInput,
): Promise<Result<WorldProgress | null>> {
  const pin = await readWorldPin(saveDir);
  if (!pin.ok) return pin;
  if (pin.value === null) {
    return input.progress === undefined
      ? ok(null)
      : err(
          "progress-no-world",
          "This save has no world yet, so it keeps no world progress.",
          "Open the save in Play once; its world is made then.",
        );
  }
  if (input.land !== undefined) {
    const changed = legacyLandChange(current.save.land, input.land);
    if (changed !== null) {
      return err(
        "legacy-land-changed",
        `This save's land ${changed} now lives in its world's history; save.json keeps the old copy unchanged.`,
        "Reload the world; nothing was saved.",
      );
    }
  }
  if (!karmaExtends(current.karma, input.karma)) {
    return err(
      "karma-not-append-only",
      "The ledger sent does not extend the stored one; karma.jsonl only grows.",
      "Reload the world; nothing was saved.",
    );
  }
  if (input.progress === undefined) return ok(null);
  if (input.progress.worldId !== pin.value.worldId) {
    return err(
      "progress-world-mismatch",
      "The progress sent belongs to another world than this save's.",
      "Reload the world; nothing was saved.",
    );
  }
  const stored = await readProgress(saveDir, pin.value.worldId);
  if (!stored.ok) return stored;
  return ok(mergeProgress(stored.value, input.progress));
}
