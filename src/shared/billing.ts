// Subscriptions as the app and the gateway both read them (rev 6 phase 4, D3). No plan, price or
// credit amount exists in this code: a plan is whatever the billing provider's catalogue offers,
// and its credits come only from the price's `unmapped_credits` metadata. A price without it is not
// a plan (Rule 2). Entitlements are derived by the gateway from provider events, deduplicated by
// the provider's event id and ordered by the provider's timestamps, never by arrival.
//
// Pure: no Node, no DOM.

import { z } from "zod";
import { ACCOUNT_ID } from "./account";

/** The catalogue metadata key (on the Price) that says how many credits a period of it grants. */
export const CREDITS_METADATA = "unmapped_credits";

export type BillingMode = "test" | "live";

export const BILLING_INTERVALS = ["day", "week", "month", "year"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/** One plan exactly as the provider's catalogue names and prices it. */
export interface BillingPlan {
  /** The provider's price id; what checkout takes. */
  id: string;
  /** The provider's own product name. */
  name: string;
  /** Credits per period, from `unmapped_credits`. */
  credits: number;
  /** In the currency's minor unit (cents), as the provider states it. */
  amount: number;
  /** ISO 4217, lowercase, as the provider states it. */
  currency: string;
  interval: BillingInterval;
  intervalCount: number;
}

export const billingPlanSchema = z.strictObject({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  credits: z.number().int().positive(),
  amount: z.number().int().nonnegative(),
  currency: z.string().regex(/^[a-z]{3}$/),
  interval: z.enum(BILLING_INTERVALS),
  intervalCount: z.number().int().positive().max(365),
});

/** `GET /v1/plans` when billing is configured; otherwise an `error` `billing-not-configured`. */
export interface PlansResponse {
  provider: string;
  mode: BillingMode;
  plans: BillingPlan[];
}

export const plansResponseSchema = z.strictObject({
  provider: z.string().min(1).max(40),
  mode: z.enum(["test", "live"]),
  plans: z.array(billingPlanSchema).max(100),
});

export const ENTITLEMENT_STATUSES = ["active", "past_due", "canceled"] as const;
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];

export interface Entitlement {
  accountId: string;
  source: "free" | "operator" | `billing:${string}`;
  plan: string;
  creditsPerPeriod: number;
  status: EntitlementStatus;
  validFrom: string;
  /** Null: open-ended. */
  validUntil: string | null;
}

/**
 * `unmapped_credits` as a positive whole number, or null (absent, empty, "12.5", "0", "-3", "1e3",
 * or too large). Only a plain decimal string counts: a catalogue typo must not become a plan.
 */
export function parseCredits(value: unknown): number | null {
  if (typeof value !== "string" || !/^[1-9]\d{0,14}$/.test(value)) return null;
  const credits = Number(value);
  return Number.isSafeInteger(credits) ? credits : null;
}

const returnUrl = z
  .string()
  .max(2048)
  .refine((text) => {
    try {
      const url = new URL(text);
      if (url.protocol === "https:") return true;
      return url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    } catch {
      return false;
    }
  }, "an https:// address (or http:// on this computer)");

/** `POST /v1/billing/checkout`. */
export const checkoutRequestSchema = z.strictObject({
  plan: z.string().min(1).max(200),
  returnUrl,
});
/** `POST /v1/billing/portal`. */
export const portalRequestSchema = z.strictObject({ returnUrl });
/** Both answer a page to open in the system browser. */
export const redirectResponseSchema = z.strictObject({ url: z.url().max(4096) });

export const entitlementSchema = z.strictObject({
  accountId: z.string().regex(ACCOUNT_ID),
  source: z.string().regex(/^(free|operator|billing:[a-z0-9-]{1,32})$/),
  plan: z.string().min(1).max(200),
  creditsPerPeriod: z.number().int().nonnegative(),
  status: z.enum(ENTITLEMENT_STATUSES),
  validFrom: z.string().max(40),
  validUntil: z.string().max(40).nullable(),
});
