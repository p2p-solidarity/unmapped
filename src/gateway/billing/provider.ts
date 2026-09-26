// The billing seam (rev 6 phase 4, D3): the gateway knows plans, checkout, the customer portal and
// signed webhooks only through this interface, so a provider is replaced by writing another one.
// No plan, price or credit amount exists in the gateway: a plan is whatever the provider's catalogue
// offers with `unmapped_credits` metadata, and a subscription without it grants nothing (Rule 2).

import type { BillingMode, BillingPlan, EntitlementStatus } from "@shared/billing";
import type { Result } from "@shared/result";

/** One subscription's state as a provider event states it. */
export interface SubscriptionEvent {
  /** The provider's event id: an event is applied at most once. */
  id: string;
  /** The provider's own timestamp (ms): events are ordered by it, never by arrival. */
  at: number;
  subscription: string;
  customer: string | null;
  /** The account the checkout was opened for (the provider's metadata), or null. */
  account: string | null;
  /** The provider's price id. */
  plan: string;
  /** From the price's `unmapped_credits`; null: the price is not a plan and grants nothing. */
  credits: number | null;
  status: EntitlementStatus;
  validFrom: string;
  validUntil: string | null;
}

export type WebhookEvent =
  | { kind: "subscription"; event: SubscriptionEvent }
  /** A signed event the gateway has no use for (invoices, customers, …). */
  | { kind: "ignored"; id: string; type: string };

export interface BillingProvider {
  /** Lowercase, as in `billing:<id>` (an entitlement's source). */
  readonly id: string;
  readonly mode: BillingMode;
  /** The catalogue's plans: only prices with valid `unmapped_credits`. */
  plans(): Promise<Result<BillingPlan[]>>;
  /** A hosted checkout page for one of `plans()`; the subscription carries the account id. */
  checkout(account: string, planId: string, returnUrl: string): Promise<Result<{ url: string }>>;
  /** The provider's customer portal (change plan, cancel, invoices). */
  portal(customer: string, returnUrl: string): Promise<Result<{ url: string }>>;
  /** Checks the signature over the exact raw body, then reads the event. */
  parseWebhook(raw: string, headers: Headers, nowMs: number): Result<WebhookEvent>;
}
