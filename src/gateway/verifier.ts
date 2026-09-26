// The free allowance's only door besides the operator's CLI (rev 6 phase 4, D1 "Free allowance and
// abuse"): device keys are free to make, so a `Verifier` proves something scarce first. The first
// one planned checks an email code; the gateway keeps only HMAC(pepper, normalised address), so one
// address funds one account per period (`Ledger.grant` refuses a subject twice in a period). No
// verifier ships yet (it needs a mail provider a person sets up): with none configured the routes
// answer `verifier-not-configured` and only `bun run gateway -- grant` gives allowance.

import { createHmac } from "node:crypto";
import type { Result } from "@shared/result";

export interface Verifier {
  readonly id: string;
  /** Sends a code to `address`; answers an opaque challenge id. */
  start(address: string): Promise<Result<{ challenge: string }>>;
  /** Checks the code; answers the address it proved, normalised. */
  confirm(challenge: string, code: string): Promise<Result<{ address: string }>>;
}

/** Lowercased and trimmed; plus-tags and dots are the mail provider's business, not ours. */
export function normaliseAddress(address: string): string {
  return address.trim().toLowerCase();
}

/** What the ledger keeps instead of an address: 64 hex characters, meaningless without the pepper. */
export function subjectOf(pepper: string, address: string): string {
  return createHmac("sha256", pepper).update(normaliseAddress(address), "utf8").digest("hex");
}
