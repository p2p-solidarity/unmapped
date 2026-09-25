// A player's own progress in a shared world (rev 6 phase 3, D1): `saves/<saveId>/progress.json`.
// The world's content lives in its history; what this player did with it lives here, beside a
// `save.json` whose legacy shape stays exactly as older builds expect (its schemas are strict, so
// nothing new may go there). Position, inventory, flags, home, door dials, felled foes and
// `storyCarry` stay in `save.json`.
//
// Keys point into the history: errands by `<witness event id>:<errand id>`, episodes by `eN`,
// places by place id (`legacyId ?? "p" + 8 characters of the event id`).

import { z } from "zod";
import { CHAPTER_LIMITS } from "./chapter";
import type { ErrandStage } from "./land";
import { err, ok, type Result } from "./result";
import { PLAY_ID, WORK_LIMITS } from "./works";

export interface WorldEpisodeProgress {
  cleared: boolean;
  summary: string | null;
  /** Local ids of the treasures opened, the monsters defeated and the people talked to. */
  found: string[];
  felled: string[];
  met: string[];
  /** A chapter played as an AI work: this player's pinned journey. */
  playId?: string;
}

export interface WorldPlaceProgress {
  cleared: boolean;
  /** An otherworld: this player's pinned journey, absent until they first walk in. */
  playId?: string;
}

export interface WorldProgress {
  v: 1;
  worldId: string;
  errands: Record<string, ErrandStage>;
  episodes: Record<string, WorldEpisodeProgress>;
  places: Record<string, WorldPlaceProgress>;
}

const ERRAND_STAGES = ["accepted", "reached", "done"] as const satisfies readonly ErrandStage[];
const doneIds = z.array(z.string().max(64)).max(CHAPTER_LIMITS.doneIds);
const playId = z.string().regex(PLAY_ID).optional();
const capped = (limit: number) => (record: Record<string, unknown>) =>
  Object.keys(record).length <= limit;

export const WORLD_PROGRESS_LIMITS = { errands: 4096, episodes: 99, places: 256 } as const;

export const worldProgressSchema: z.ZodType<WorldProgress> = z.strictObject({
  v: z.literal(1),
  worldId: z.string().regex(/^h[a-z2-7]{52}$/),
  errands: z
    .record(z.string().regex(/^h[a-z2-7]{52}:[a-z0-9][a-z0-9_]{0,47}$/), z.enum(ERRAND_STAGES))
    .refine(capped(WORLD_PROGRESS_LIMITS.errands), "too many errands"),
  episodes: z
    .record(
      z.string().regex(/^e[1-9][0-9]?$/),
      z.strictObject({
        cleared: z.boolean(),
        summary: z.string().max(WORK_LIMITS.summaryChars).nullable(),
        found: doneIds,
        felled: doneIds,
        met: doneIds,
        playId,
      }),
    )
    .refine(capped(WORLD_PROGRESS_LIMITS.episodes), "too many episodes"),
  places: z
    .record(
      z.string().regex(/^p(?:[0-9]{1,3}|[a-z2-7]{8})$/),
      z.strictObject({ cleared: z.boolean(), playId }),
    )
    .refine(capped(WORLD_PROGRESS_LIMITS.places), "too many places"),
});

export function emptyWorldProgress(worldId: string): WorldProgress {
  return { v: 1, worldId, errands: {}, episodes: {}, places: {} };
}

/** `progress.json` as read from disk, or why it cannot be used. */
export function readWorldProgress(raw: unknown): Result<WorldProgress> {
  const parsed = worldProgressSchema.safeParse(raw);
  if (parsed.success) return ok(parsed.data);
  const issue = parsed.error.issues[0];
  return err(
    "progress-invalid",
    `progress.json ${issue?.path.join(".") || "file"}: ${issue?.message ?? "invalid"}`,
    "Restore this save from a backup.",
  );
}
