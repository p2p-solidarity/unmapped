// The one place the service computes an entry's verdict (rev 6 phase 3, D4, D5): what the fold
// cannot check itself — the event reads, its id is its content, its author signed it, and its
// programs pass the DSL (`entryVerdict`, src/dsl/history/verdict.ts, the same function main uses).
// Main and the service must compute the same verdict for the same event, or their folds of one log
// would differ; tests inject a signature-only verdict so they do not depend on DSL fixtures.

import { entryVerdict } from "@dsl/history/verdict";
import type { EntryVerdict, StoredEvent } from "@shared/history/types";

export type VerdictFn = (event: StoredEvent) => EntryVerdict;

export const serviceVerdict: VerdictFn = entryVerdict;
