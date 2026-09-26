// Stripe behind the billing seam (rev 6 phase 4, D3): Checkout in subscription mode, Billing, the
// customer portal, and signed webhooks. Plain `fetch` against the REST API (no SDK). Plans come only
// from the catalogue: active recurring Prices whose metadata carries `unmapped_credits` (credits per
// calendar month, whatever the price's billing interval), named by their Product.
//
// Webhooks are checked as Stripe documents: `Stripe-Signature: t=<s>,v1=<hex>` is HMAC-SHA256 of
// `${t}.${raw body}` under the endpoint's `whsec_` secret, compared in constant time, within 300 s.
// A live-mode event never counts on a test-mode gateway, and the other way round.
//
// Keys resolve saved (`set-key stripe` / `set-key stripe-webhook`) → STRIPE_SECRET_KEY /
// STRIPE_WEBHOOK_SECRET; `startup.ts` refuses a live key unless every live condition holds.

import { createHmac, timingSafeEqual } from "node:crypto";
import { ACCOUNT_ID } from "@shared/account";
import {
  BILLING_INTERVALS,
  type BillingInterval,
  type BillingMode,
  type BillingPlan,
  CREDITS_METADATA,
  type EntitlementStatus,
  parseCredits,
} from "@shared/billing";
import { err, ok, type Result } from "@shared/result";
import type { BillingProvider, SubscriptionEvent, WebhookEvent } from "./provider";

export const STRIPE_API = "https://api.stripe.com/v1";
export const WEBHOOK_TOLERANCE_S = 300;
/** The metadata key the checkout writes on the subscription. */
export const ACCOUNT_METADATA = "unmapped_account";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
type Json = Record<string, unknown>;

export function stripeMode(secretKey: string): BillingMode | null {
  if (/^(sk|rk)_test_[A-Za-z0-9]+$/.test(secretKey)) return "test";
  if (/^(sk|rk)_live_[A-Za-z0-9]+$/.test(secretKey)) return "live";
  return null;
}

const obj = (value: unknown): Json =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : {};
const str = (value: unknown): string | null => (typeof value === "string" ? value : null);
const int = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) ? value : null;
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

function form(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join("&");
}

/** One catalogue price as a plan, or null when it is not one (no credits, no amount, inactive). */
export function planOfPrice(price: Json): BillingPlan | null {
  const credits = parseCredits(obj(price.metadata)[CREDITS_METADATA]);
  const product = obj(price.product);
  const recurring = obj(price.recurring);
  const interval = str(recurring.interval);
  const intervalCount = int(recurring.interval_count) ?? 1;
  const amount = int(price.unit_amount);
  const id = str(price.id);
  const name = str(product.name);
  const currency = str(price.currency);
  if (credits === null || id === null || name === null || amount === null || amount < 0) {
    return null;
  }
  if (price.active === false || product.active === false) return null;
  if (!BILLING_INTERVALS.includes(interval as BillingInterval) || intervalCount < 1) return null;
  if (currency === null || !/^[a-z]{3}$/.test(currency)) return null;
  return {
    id,
    name: name.slice(0, 200),
    credits,
    amount,
    currency,
    interval: interval as BillingInterval,
    intervalCount,
  };
}

function statusOf(status: string | null, deleted: boolean): EntitlementStatus {
  if (deleted) return "canceled";
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  // canceled, incomplete, incomplete_expired, paused: not (or no longer) paid for.
  return "canceled";
}

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

/** A subscription event's state, read from the snapshot the (verified) event carries. */
export function subscriptionEventOf(event: Json): SubscriptionEvent | null {
  const id = str(event.id);
  const created = int(event.created);
  const sub = obj(obj(event.data).object);
  const subscription = str(sub.id);
  if (id === null || created === null || subscription === null) return null;
  const items = Array.isArray(obj(sub.items).data) ? (obj(sub.items).data as unknown[]) : [];
  const item = obj(items[0]);
  const price = obj(item.price);
  const plan = str(price.id);
  const start =
    int(sub.start_date) ?? int(item.current_period_start) ?? int(sub.current_period_start);
  if (plan === null || start === null) return null;
  const until = int(sub.ended_at) ?? int(sub.cancel_at);
  const customer = str(sub.customer) ?? str(obj(sub.customer).id);
  const account = str(obj(sub.metadata)[ACCOUNT_METADATA]);
  return {
    id,
    at: created * 1000,
    subscription,
    customer,
    account: account !== null && ACCOUNT_ID.test(account) ? account : null,
    plan,
    credits: parseCredits(obj(price.metadata)[CREDITS_METADATA]),
    status: statusOf(str(sub.status), event.type === "customer.subscription.deleted"),
    validFrom: iso(start),
    validUntil: until === null ? null : iso(until),
  };
}

/** Whether `header` signs `raw` under `secret` at a time within the tolerance of `nowMs`. */
export function verifyStripeSignature(
  raw: string,
  header: string | null,
  secret: string,
  nowMs: number,
): Result<void> {
  const parts = (header ?? "").split(",").map((part) => part.trim().split("="));
  const ts = parts.find(([name]) => name === "t")?.[1];
  const signatures = parts.filter(([name]) => name === "v1").map(([, value]) => value ?? "");
  if (ts === undefined || !/^\d{1,12}$/.test(ts) || signatures.length === 0) {
    return err("billing-webhook-unsigned", "The webhook carries no Stripe signature.");
  }
  const expected = createHmac("sha256", secret).update(`${ts}.${raw}`, "utf8").digest();
  const matches = signatures.some((hex) => {
    if (!/^[a-f0-9]{64}$/.test(hex)) return false;
    return timingSafeEqual(Buffer.from(hex, "hex"), expected);
  });
  if (!matches) return err("billing-webhook-forged", "The webhook signature does not verify.");
  if (Math.abs(nowMs / 1000 - Number(ts)) > WEBHOOK_TOLERANCE_S) {
    return err(
      "billing-webhook-stale",
      `The webhook was signed more than ${WEBHOOK_TOLERANCE_S} s from the gateway's clock.`,
      "Check the gateway host's clock (NTP).",
    );
  }
  return ok(undefined);
}

export class StripeProvider implements BillingProvider {
  readonly id = "stripe";
  readonly mode: BillingMode;

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
    private readonly fetchFn: Fetch = (input, init) => fetch(input, init),
    private readonly api = STRIPE_API,
  ) {
    const mode = stripeMode(secretKey);
    if (mode === null) throw new Error("not a Stripe secret key");
    this.mode = mode;
  }

  private async call(method: "GET" | "POST", path: string, body?: string): Promise<Result<Json>> {
    let response: Response;
    try {
      response = await this.fetchFn(`${this.api}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.secretKey}`,
          ...(body === undefined ? {} : { "content-type": "application/x-www-form-urlencoded" }),
        },
        ...(body === undefined ? {} : { body }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      return err(
        "billing-provider-unreachable",
        `Could not reach Stripe: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    let json: Json = {};
    try {
      json = obj(await response.json());
    } catch {}
    if (!response.ok) {
      const message = str(obj(json.error).message) ?? `HTTP ${response.status}`;
      return err("billing-provider", `Stripe refused ${method} ${path}: ${message.slice(0, 300)}`);
    }
    return ok(json);
  }

  async plans(): Promise<Result<BillingPlan[]>> {
    const plans: BillingPlan[] = [];
    let after: string | null = null;
    for (let page = 0; page < 5; page += 1) {
      const query: string =
        "/prices?active=true&type=recurring&limit=100&expand[]=data.product" +
        (after === null ? "" : `&starting_after=${encodeURIComponent(after)}`);
      const listed = await this.call("GET", query);
      if (!listed.ok) return listed;
      const data = Array.isArray(listed.value.data) ? (listed.value.data as unknown[]) : [];
      for (const price of data) {
        const plan = planOfPrice(obj(price));
        if (plan !== null) plans.push(plan);
      }
      after = str(obj(data.at(-1)).id);
      if (listed.value.has_more !== true || after === null) break;
    }
    return ok(plans);
  }

  async checkout(
    account: string,
    planId: string,
    returnUrl: string,
  ): Promise<Result<{ url: string }>> {
    const plans = await this.plans();
    if (!plans.ok) return plans;
    if (!plans.value.some((plan) => plan.id === planId)) {
      return err(
        "billing-plan-unknown",
        `"${planId}" is not a plan in the catalogue.`,
        `A plan is an active recurring price with ${CREDITS_METADATA} metadata.`,
      );
    }
    const session = await this.call(
      "POST",
      "/checkout/sessions",
      form({
        mode: "subscription",
        "line_items[0][price]": planId,
        "line_items[0][quantity]": "1",
        success_url: returnUrl,
        cancel_url: returnUrl,
        client_reference_id: account,
        [`metadata[${ACCOUNT_METADATA}]`]: account,
        [`subscription_data[metadata][${ACCOUNT_METADATA}]`]: account,
      }),
    );
    if (!session.ok) return session;
    const url = str(session.value.url);
    return url === null ? err("billing-provider", "Stripe answered no checkout URL.") : ok({ url });
  }

  async portal(customer: string, returnUrl: string): Promise<Result<{ url: string }>> {
    const session = await this.call(
      "POST",
      "/billing_portal/sessions",
      form({ customer, return_url: returnUrl }),
    );
    if (!session.ok) return session;
    const url = str(session.value.url);
    return url === null ? err("billing-provider", "Stripe answered no portal URL.") : ok({ url });
  }

  parseWebhook(raw: string, headers: Headers, nowMs: number): Result<WebhookEvent> {
    const signed = verifyStripeSignature(
      raw,
      headers.get("stripe-signature"),
      this.webhookSecret,
      nowMs,
    );
    if (!signed.ok) return signed;
    let event: Json;
    try {
      event = obj(JSON.parse(raw));
    } catch {
      return err("billing-webhook-invalid", "The signed webhook is not JSON.");
    }
    if (event.livemode !== (this.mode === "live")) {
      return err(
        "billing-webhook-mode",
        `A ${event.livemode === true ? "live" : "test"}-mode event reached a ${this.mode}-mode gateway.`,
        "Point the Stripe webhook endpoint of the right mode at this gateway.",
      );
    }
    const type = str(event.type) ?? "";
    if (!SUBSCRIPTION_EVENTS.has(type))
      return ok({ kind: "ignored", id: str(event.id) ?? "", type });
    const subscription = subscriptionEventOf(event);
    if (subscription === null) {
      return err(
        "billing-webhook-invalid",
        `The ${type} event has no subscription the gateway can read.`,
      );
    }
    return ok({ kind: "subscription", event: subscription });
  }
}
