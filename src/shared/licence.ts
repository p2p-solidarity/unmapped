// Licence records for the models the app and the gateway serve or ship (rev 6 phase 4, D4): each
// one dated and sourced, so "may this be sold?" is a lookup and never a guess (Rule 2). A text model
// gets a record only when the gateway serves it or a preset names it; a GGUF the player picks has
// none ("licence: yours to check"). The claims and their sources are the D4 table of
// docs/plans/rev6-phase4.md; a third-party claim stays "reported, unconfirmed" until an E2E checks
// it. An operator may add records of their own (the gateway's upstreams.json), never replace these.
//
// Pure: no Node, no DOM.

import { z } from "zod";

export interface LicenceRecord {
  /** Stable id a model or a picture names ("apache-2.0"). */
  id: string;
  name: string;
  /** Whether output may be sold under it. */
  commercial: boolean;
  /** Where the claim was read (a URL, or a file in this repo). */
  source: string;
  /** The day the source was read, YYYY-MM-DD. */
  checkedAt: string;
  /** What it covers and every caveat, in plain words. */
  notes: string;
}

/** A picture's licence: a record id, a file the player picked, or a picture from before phase 4. */
export const PLAYER_SUPPLIED = "player-supplied";
export const UNKNOWN_LICENCE = "unknown";

export const LICENCE_ID = /^[a-z0-9][a-z0-9.-]{1,47}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const licenceRecordSchema = z.strictObject({
  id: z
    .string()
    .regex(LICENCE_ID)
    .refine((id) => id !== PLAYER_SUPPLIED && id !== UNKNOWN_LICENCE, "reserved licence id"),
  name: z.string().trim().min(1).max(120),
  commercial: z.boolean(),
  source: z.string().trim().min(1).max(500),
  checkedAt: z.string().regex(DAY),
  notes: z.string().max(2000),
});

const CHECKED = "2026-09-26";

/** The records the D4 table states, with its sources, as read on the day the plan was reconciled. */
export const LICENCES: readonly LicenceRecord[] = [
  {
    id: "qwen-research",
    name: "Qwen Research License",
    commercial: false,
    source: "https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE",
    checkedAt: CHECKED,
    notes:
      "Covers Qwen-Image-2.1. A commercial grant is on request from Alibaba; its §4.b asks for " +
      '"Built with Qwen" (or "Improved using Qwen") wherever the model is used. Model card: 7B, ' +
      "RGBA, up to 10 references, QwenImage21Pipeline. Reported, " +
      "unconfirmed: released 2026-09-20, no paid 2.1 API, about 16 GB of GPU at Q8.",
  },
  {
    id: "apache-2.0",
    name: "Apache License 2.0",
    commercial: true,
    source: "https://github.com/QwenLM/Qwen-Image",
    checkedAt: CHECKED,
    notes:
      "Covers the Qwen-Image and Qwen-Image-2512 weights: the self-hostable commercial choice.",
  },
  {
    id: "openai-terms",
    name: "OpenAI Terms of Use and API Services Agreement",
    commercial: true,
    source: "https://openai.com/policies/row-terms-of-use/",
    checkedAt: CHECKED,
    notes:
      "Covers gpt-image-1 and gpt-image-1-mini. A contract, not a model licence: output is " +
      "assigned to the customer, but not exclusively, third-party rights are not cleared, and the " +
      "terms can change; re-read them before charging. actors.png was drawn under these terms " +
      "(record in actors.json). Reported, unconfirmed: the terms page answered 403 to this " +
      "build's fetcher on the day checked, so a person must read it before charging.",
  },
  {
    id: "cc0",
    name: "CC0 1.0 Universal",
    commercial: true,
    source: "docs/licenses/ninja-adventure-cc0.md",
    checkedAt: CHECKED,
    notes: "Covers the built-in CC0 art.",
  },
];

/** The built-in records plus `extra` (an operator's own), by id. */
export function licenceTable(extra: readonly LicenceRecord[] = []): Map<string, LicenceRecord> {
  return new Map([...LICENCES, ...extra].map((record) => [record.id, record]));
}
