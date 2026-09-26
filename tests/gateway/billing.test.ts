// Subscriptions (rev 6 phase 4, D3) over a fixture provider: nothing here can charge money. Only
// what E2E cannot reach: hostile webhooks, provider ordering and a live key. What this file guards,
// written before the code:
//   1. A forged webhook is applied: a wrong signature, another secret, a changed body, or no header.
//   2. A replayed webhook is applied twice (the same event id), or a captured one is accepted long
//      after it was signed (outside the 300 s tolerance).
//   3. Out-of-order events: an older event delivered after a newer one decides the state (a
//      cancelled subscription comes back to life), or a restart folds them differently.
//   4. A plan without `unmapped_credits` metadata (or with a non-integer, zero or negative value) is
//      offered, can be checked out, or grants credits through a webhook.
//   5. A live key starts the gateway in development: without every one of GATEWAY_BILLING_LIVE=1,
//      NODE_ENV=production and GATEWAY_COMMERCIAL=1, or with a non-commercial model.
//   6. An entitlement for an account the gateway does not know is applied, or an active one does not
//      reach the quota, or a cancelled one keeps its credits.

import { plansResponseSchema } from "@shared/billing";
import { gatewayStatusSchema } from "@shared/quota";
import { describe, expect, it } from "vitest";
import {
  FakeStripe,
  LIVE_SHAPED_KEY,
  stripePrice,
  stripeSignature,
  subscriptionEvent,
  TEST_SECRET_KEY,
  WEBHOOK_SECRET,
} from "../fixtures/gateway/stripe";
import {
  account,
  call,
  chat,
  defaultCosts,
  defaultUpstreams,
  grant,
  type Harness,
  linesOf,
  openWith,
  secretOf,
  start,
  T0,
  tempDir,
  writeSetup,
} from "./support";

const A = secretOf("billing-a");
const TEST_ENV = { STRIPE_SECRET_KEY: TEST_SECRET_KEY, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET };
const NOW_S = Math.floor(T0 / 1000);
const CREDITS = 5_000_000;

function catalogue() {
  return [
    stripePrice({ id: "price_basic", credits: String(CREDITS), productName: "Wanderer" }),
    stripePrice({ id: "price_nometa", credits: undefined }),
    stripePrice({ id: "price_frac", credits: "12.5" }),
    stripePrice({ id: "price_zero", credits: "0" }),
    stripePrice({ id: "price_neg", credits: "-3" }),
    stripePrice({ id: "price_exp", credits: "1e3" }),
  ];
}

const priceOf = (id: string) => catalogue().find((price) => price.id === id) ?? {};

async function billed(env: Record<string, string> = TEST_ENV) {
  const stripe = new FakeStripe(catalogue());
  const h = start({ env, stripe });
  const a = await account(h.gw, A);
  return { ...h, stripe, a };
}

function send(h: Harness, raw: string, header: string | null) {
  return call(h.gw, "POST", "/v1/billing/webhook", {
    body: raw,
    headers: {
      "content-type": "application/json",
      ...(header === null ? {} : { "stripe-signature": header }),
    },
  });
}

function signed(h: Harness, event: Record<string, unknown>, atS = NOW_S) {
  const raw = JSON.stringify(event);
  return send(h, raw, stripeSignature(raw, atS));
}

const entitlements = (h: Harness) =>
  linesOf(h.dir, "ledger.jsonl").filter((line) => line.t === "entitlement");
const quota = async (h: Harness, token: string) =>
  (await call(h.gw, "GET", "/v1/quota", { token })).body;

describe("webhook signatures (1, 2)", () => {
  it("refuses a wrong signature, another secret, a changed body and no header", async () => {
    const h = await billed();
    const raw = JSON.stringify(
      subscriptionEvent({
        eventId: "evt_1",
        created: NOW_S,
        account: h.a.account,
        status: "active",
        price: priceOf("price_basic"),
      }),
    );
    const refusals = [
      await send(h, raw, `t=${NOW_S},v1=${"ab".repeat(32)}`),
      await send(h, raw, stripeSignature(raw, NOW_S, "whsec_someoneelse")),
      await send(h, raw.replace('"active"', '"trialing"'), stripeSignature(raw, NOW_S)),
      await send(h, raw, null),
    ];
    expect(refusals.map((answer) => [answer.status, answer.body.error.code])).toEqual([
      [400, "billing-webhook-forged"],
      [400, "billing-webhook-forged"],
      [400, "billing-webhook-forged"],
      [400, "billing-webhook-unsigned"],
    ]);
    expect(entitlements(h)).toEqual([]);
    expect((await quota(h, h.a.token)).granted).toBe(0);
    h.gw.close();
  });

  it("applies an event once, refuses one signed long ago, and one from the other mode", async () => {
    const h = await billed();
    const event = subscriptionEvent({
      eventId: "evt_2",
      created: NOW_S,
      account: h.a.account,
      status: "active",
      price: priceOf("price_basic"),
    });
    expect((await signed(h, event)).body).toEqual({ received: true, result: "applied" });
    expect((await signed(h, event)).body).toEqual({ received: true, result: "duplicate" });
    expect(entitlements(h)).toHaveLength(1);

    const captured = subscriptionEvent({
      eventId: "evt_3",
      created: NOW_S - 400,
      account: h.a.account,
      status: "canceled",
      price: priceOf("price_basic"),
    });
    const stale = await signed(h, captured, NOW_S - 301);
    expect(stale.body.error.code).toBe("billing-webhook-stale");
    const live = await signed(
      h,
      subscriptionEvent({
        eventId: "evt_4",
        created: NOW_S,
        account: h.a.account,
        status: "canceled",
        price: priceOf("price_basic"),
        livemode: true,
      }),
    );
    expect(live.body.error.code).toBe("billing-webhook-mode");
    expect(await quota(h, h.a.token)).toMatchObject({ granted: CREDITS, plan: "price_basic" });
    h.gw.close();
  });
});

describe("ordering (3)", () => {
  it("orders by the provider's timestamps, never by arrival, the same after a restart", async () => {
    const h = await billed();
    const base = { account: h.a.account, price: priceOf("price_basic") };
    const canceled = subscriptionEvent({
      ...base,
      eventId: "evt_b",
      created: NOW_S - 10,
      type: "customer.subscription.deleted",
      status: "canceled",
    });
    const active = subscriptionEvent({
      ...base,
      eventId: "evt_a",
      created: NOW_S - 20,
      status: "active",
    });
    expect((await signed(h, canceled)).body.result).toBe("applied");
    expect((await signed(h, active)).body.result).toBe("older");
    expect(await quota(h, h.a.token)).toMatchObject({ granted: 0, plan: null });

    // The same second: the more final state wins, whichever arrives first.
    const tie = { ...base, subscription: "sub_tie", created: NOW_S - 5 };
    await signed(h, subscriptionEvent({ ...tie, eventId: "evt_t1", status: "active" }));
    await signed(h, subscriptionEvent({ ...tie, eventId: "evt_t2", status: "canceled" }));
    const tie2 = { ...base, subscription: "sub_tie2", created: NOW_S - 5 };
    await signed(h, subscriptionEvent({ ...tie2, eventId: "evt_t4", status: "canceled" }));
    await signed(h, subscriptionEvent({ ...tie2, eventId: "evt_t3", status: "active" }));
    expect(await quota(h, h.a.token)).toMatchObject({ granted: 0, plan: null });
    h.gw.close();

    const again = start({ dir: h.dir, clock: h.clock, env: TEST_ENV, stripe: h.stripe });
    expect(await quota(again, h.a.token)).toMatchObject({ granted: 0, plan: null });
    again.gw.close();
  });
});

describe("plans come only from credits metadata (4)", () => {
  it("offers, checks out and grants only prices with a whole positive unmapped_credits", async () => {
    const h = await billed();
    const plans = await call(h.gw, "GET", "/v1/plans");
    expect(plansResponseSchema.safeParse(plans.body).success).toBe(true);
    expect(plans.body).toEqual({
      provider: "stripe",
      mode: "test",
      plans: [
        {
          id: "price_basic",
          name: "Wanderer",
          credits: CREDITS,
          amount: 500,
          currency: "usd",
          interval: "month",
          intervalCount: 1,
        },
      ],
    });
    for (const id of ["price_nometa", "price_frac", "price_zero", "price_neg", "price_exp"]) {
      const refused = await call(h.gw, "POST", "/v1/billing/checkout", {
        token: h.a.token,
        json: { plan: id, returnUrl: "http://127.0.0.1:5173/done" },
      });
      expect(refused.status).toBe(400);
      expect(refused.body.error.code).toBe("billing-plan-unknown");
    }
    expect(h.stripe.checkouts()).toEqual([]);
    const page = await call(h.gw, "POST", "/v1/billing/checkout", {
      token: h.a.token,
      json: { plan: "price_basic", returnUrl: "https://unmapped.example/plan" },
    });
    expect(page.body.url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    const [session] = h.stripe.checkouts();
    expect(session?.get("mode")).toBe("subscription");
    expect(session?.get("line_items[0][price]")).toBe("price_basic");
    expect(session?.get("subscription_data[metadata][unmapped_account]")).toBe(h.a.account);

    for (const [index, id] of ["price_nometa", "price_frac", "price_zero"].entries()) {
      const event = subscriptionEvent({
        eventId: `evt_meta_${index}`,
        subscription: `sub_meta_${index}`,
        created: NOW_S,
        account: h.a.account,
        status: "active",
        price: priceOf(id),
      });
      expect((await signed(h, event)).status).toBe(200);
    }
    expect(entitlements(h).map((line) => line.entitlement.creditsPerPeriod)).toEqual([0, 0, 0]);
    expect(await quota(h, h.a.token)).toMatchObject({ granted: 0, plan: null });
    h.gw.close();
  });
});

describe("a live key (5)", () => {
  const live = { STRIPE_SECRET_KEY: LIVE_SHAPED_KEY, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET };
  const all = { GATEWAY_BILLING_LIVE: "1", NODE_ENV: "production", GATEWAY_COMMERCIAL: "1" };

  it("refuses to start with a live key unless every live condition holds", () => {
    const stripe = new FakeStripe(catalogue());
    const cases: Record<string, string>[] = [
      {},
      { GATEWAY_BILLING_LIVE: "1", NODE_ENV: "production" },
      { GATEWAY_BILLING_LIVE: "1", GATEWAY_COMMERCIAL: "1" },
      { NODE_ENV: "production", GATEWAY_COMMERCIAL: "1" },
      { ...all, NODE_ENV: "development" },
      { ...all, UNMAPPED_GATEWAY_TEST: "1" },
    ];
    for (const extra of cases) {
      const { opened } = openWith({ env: { ...live, ...extra }, stripe });
      expect(opened.ok ? "started" : opened.error.code).toBe("gateway-billing-live-refused");
    }
    const bare = openWith({ env: live, stripe });
    expect(bare.opened.ok ? "" : bare.opened.error.message).toContain(
      "GATEWAY_BILLING_LIVE=1, NODE_ENV=production, GATEWAY_COMMERCIAL=1",
    );
    expect(stripe.requests).toEqual([]);
  });

  it("refuses a live key while any served model is non-commercial", async () => {
    const dir = tempDir();
    const upstreams = defaultUpstreams();
    const models = upstreams.upstreams[0]?.models ?? [];
    models.push({ id: "qwen-image-2.1", kind: "image", licence: "qwen-research" });
    writeSetup(dir, upstreams, defaultCosts());
    const stripe = new FakeStripe(catalogue());
    const refused = openWith({ dir, env: { ...live, ...all }, stripe });
    expect(refused.opened.ok ? "" : refused.opened.error.code).toBe(
      "gateway-noncommercial-upstream",
    );

    const started = start({ env: { ...live, ...all }, stripe });
    const status = await call(started.gw, "GET", "/v1/status");
    expect(gatewayStatusSchema.safeParse(status.body).success).toBe(true);
    expect(status.body).toEqual({
      commercial: true,
      billing: { provider: "stripe", mode: "live" },
    });
    expect(stripe.requests).toEqual([]);
    started.gw.close();
  });
});

describe("entitlements reach the quota (6)", () => {
  it("applies nothing for an unknown account, counts an active plan, and drops a cancelled one", async () => {
    const h = await billed();
    const price = priceOf("price_basic");
    const nobody = await signed(
      h,
      subscriptionEvent({
        eventId: "evt_n1",
        created: NOW_S,
        account: null,
        status: "active",
        price,
      }),
    );
    expect(nobody.body).toEqual({ received: true, ignored: "account-unknown" });
    const stranger = await signed(
      h,
      subscriptionEvent({
        eventId: "evt_n2",
        created: NOW_S,
        account: `a${"b".repeat(26)}`,
        status: "active",
        price,
      }),
    );
    expect(stranger.body.ignored).toBe("account-unknown");
    expect(entitlements(h)).toEqual([]);
    expect(
      (
        await call(h.gw, "POST", "/v1/billing/portal", {
          token: h.a.token,
          json: { returnUrl: "https://unmapped.example/" },
        })
      ).body.error.code,
    ).toBe("billing-no-customer");

    await grant(h.gw, h.a.account, 1_000);
    await signed(
      h,
      subscriptionEvent({
        eventId: "evt_s1",
        created: NOW_S - 30,
        account: h.a.account,
        status: "active",
        price,
      }),
    );
    expect(await quota(h, h.a.token)).toMatchObject({
      granted: 1_000 + CREDITS,
      plan: "price_basic",
    });
    expect((await chat(h.gw, h.a.token, "req-plan-0001")).status).toBe(200);
    const portal = await call(h.gw, "POST", "/v1/billing/portal", {
      token: h.a.token,
      json: { returnUrl: "https://unmapped.example/" },
    });
    expect(portal.body.url).toMatch(/^https:\/\/billing\.stripe\.test\//);
    expect(h.stripe.requests.at(-1)?.form?.get("customer")).toBe("cus_1");

    await signed(
      h,
      subscriptionEvent({
        eventId: "evt_s2",
        created: NOW_S - 10,
        type: "customer.subscription.deleted",
        account: h.a.account,
        status: "canceled",
        price,
      }),
    );
    expect(await quota(h, h.a.token)).toMatchObject({ granted: 1_000, plan: null });

    // Still "active", but past its cancel_at: it has ended.
    await signed(
      h,
      subscriptionEvent({
        eventId: "evt_s3",
        subscription: "sub_2",
        created: NOW_S - 5,
        account: h.a.account,
        status: "active",
        price,
        cancelAtS: NOW_S - 1,
      }),
    );
    expect((await quota(h, h.a.token)).granted).toBe(1_000);
    h.gw.close();
  });

  it("answers billing-not-configured when no provider is set up", async () => {
    const h = start();
    const plans = await call(h.gw, "GET", "/v1/plans");
    expect(plans.status).toBe(503);
    expect(plans.body.error.code).toBe("billing-not-configured");
    expect((await call(h.gw, "GET", "/v1/status")).body).toEqual({
      commercial: false,
      billing: null,
    });
    const half = openWith({ env: { STRIPE_SECRET_KEY: TEST_SECRET_KEY } });
    expect(half.opened.ok ? "" : half.opened.error.code).toBe("gateway-billing-incomplete");
    h.gw.close();
  });
});
