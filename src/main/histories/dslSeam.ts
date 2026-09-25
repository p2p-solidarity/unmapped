// The seam to `src/dsl/history/**` (WP2, rev 6 phase 3, D4–D6). Main needs three DSL-backed
// functions and every flow in `main/histories` receives them as one value (`WorldDsl`, injected at
// the IPC registration), so tests can pass their own and a signature that moves is a one-line
// change here:
//
// - `planMigration(files)`: pure; the events a legacy save becomes, in D6's order, each with
//   `seen: 0` and a fixed `at`, admitted against the plan's own fold; plus `progress.json`, the
//   source digest `world.json` pins, and what stayed out (`skipped`) or changed (`adjusted`).
// - `entryVerdict(event)`: D4's verdict for one stored event — reads, id + signature, DSL body.
// - `validateEventBody(event)`: D5 step 4 alone, run on a draft before main signs it.

import type { MigrationPlan } from "@dsl/history/migrate";
import { planMigration } from "@dsl/history/migrate";
import type { MigrationFiles } from "@dsl/history/migrateSource";
import { validateEventBody } from "@dsl/history/validate";
import { entryVerdict } from "@dsl/history/verdict";
import type { EntryVerdict, HistoryEvent, StoredEvent } from "@shared/history/types";
import type { Result } from "@shared/result";

export type { MigrationPlan } from "@dsl/history/migrate";
export type {
  Adjusted,
  LegacySources,
  MigrationFiles,
  SourceDigest,
} from "@dsl/history/migrateSource";

export interface WorldDsl {
  planMigration(files: MigrationFiles): Result<MigrationPlan>;
  entryVerdict(event: StoredEvent): EntryVerdict;
  validateEventBody(event: HistoryEvent): Result<void>;
}

/** The real DSL functions (src/dsl/history). */
export const DSL_HISTORY: WorldDsl = { planMigration, entryVerdict, validateEventBody };

export function workKey(ref: { workId: string; version: string }): string {
  return `${ref.workId}@${ref.version}`;
}
