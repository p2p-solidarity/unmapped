// A fake Stripe for the billing tests (tests/gateway/billing.test.ts): the catalogue, Checkout and
// portal endpoints the gateway's Stripe provider calls, answered in memory, plus webhook events
// signed the way Stripe signs them. Nothing here talks to Stripe or can charge money. Every key and
// secret below is a made-up test-mode value (and one made-up live-shaped key, which the gateway
// must refuse to start with). Test-only; never imported by app code.

import { createHmac } from "node:crypto";

export const TEST_SECRET_KEY = "sk_test_fixture51Hnotarealkey";
export const LIVE_SHAPED_KEY = "sk_live_fixture51Hnotarealkey";
export const WEBHOOK_SECRET = "whsec_fixturenotarealsecret";

type Json = Record<string, unknown>;

export interface PriceSpec {
  id: string;
  /** `unmapped_credits` exactly as the catalogue would hold it; undefined: no metadata key. */
  credits: string | undefined;
  amount?: number;
  currency?: string;
  interval?: string;
  productName?: string;
  active?: boolean;
}

export function stripePrice(spec: PriceSpec): Json {
  return {
    id: spec.id,
    object: "price",
    active: spec.active ?? true,
    currency: spec.currency ?? "usd",
    unit_amount: spec.amount ?? 500,
    type: "recurring",
    recurring: { interval: spec.interval ?? "month", interval_count: 1 },
    metadata: spec.credits === undefined ? {} : { unmapped_credits: spec.credits },
    product: {
      id: `prod_${spec.id}`,
      object: "product",
      name: spec.productName ?? `Plan ${spec.id}`,
      active: true,
    },
  };
}

export class FakeStripe {
  readonly requests: {
    method: string;
    path: string;
    form: URLSearchParams | null;
    auth: string | null;
  }[] = [];

  constructor(public prices: Json[]) {}

  readonly fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const parsed = new URL(url);
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    const form = typeof init?.body === "string" ? new URLSearchParams(init.body) : null;
    this.requests.push({ method, path: parsed.pathname, form, auth: headers.get("authorization") });
    if (method === "GET" && parsed.pathname === "/v1/prices") {
      return Response.json({ object: "list", data: this.prices, has_more: false });
    }
    if (method === "POST" && parsed.pathname === "/v1/checkout/sessions") {
      return Response.json({
        id: "cs_test_1",
        url: "https://checkout.stripe.test/c/pay/cs_test_1",
      });
    }
    if (method === "POST" && parsed.pathname === "/v1/billing_portal/sessions") {
      return Response.json({ id: "bps_1", url: "https://billing.stripe.test/p/session/bps_1" });
    }
    return Response.json({ error: { message: "No such route in the fake" } }, { status: 404 });
  };

  /** The checkout sessions the gateway asked for. */
  checkouts(): URLSearchParams[] {
    return this.requests
      .filter((request) => request.path === "/v1/checkout/sessions")
      .map((request) => request.form ?? new URLSearchParams());
  }
}

/** Stripe's header: HMAC-SHA256 over `${t}.${raw}`. */
export function stripeSignature(raw: string, timestampS: number, secret = WEBHOOK_SECRET): string {
  const v1 = createHmac("sha256", secret).update(`${timestampS}.${raw}`, "utf8").digest("hex");
  return `t=${timestampS},v1=${v1}`;
}

export interface SubscriptionSpec {
  eventId: string;
  /** The event's `created`, in seconds. */
  created: number;
  type?: string;
  subscription?: string;
  account: string | null;
  customer?: string;
  status: string;
  price: Json;
  startS?: number;
  cancelAtS?: number | null;
  endedAtS?: number | null;
  livemode?: boolean;
}

export function subscriptionEvent(spec: SubscriptionSpec): Json {
  return {
    id: spec.eventId,
    object: "event",
    type: spec.type ?? "customer.subscription.updated",
    created: spec.created,
    livemode: spec.livemode ?? false,
    data: {
      object: {
        id: spec.subscription ?? "sub_1",
        object: "subscription",
        customer: spec.customer ?? "cus_1",
        status: spec.status,
        start_date: spec.startS ?? spec.created - 60,
        cancel_at: spec.cancelAtS ?? null,
        ended_at: spec.endedAtS ?? null,
        metadata: spec.account === null ? {} : { unmapped_account: spec.account },
        items: {
          object: "list",
          data: [
            {
              id: "si_1",
              price: spec.price,
              current_period_start: spec.startS ?? spec.created - 60,
            },
          ],
        },
      },
    },
  };
}
