// Metered generation (rev 6 phase 4, D2 quota). Only what E2E cannot reach: retries, crashes and
// the calendar. What this file guards, written before the code:
//   1. A retry is charged twice: a settled (or released) request id runs again within 24 h.
//   2. An in-flight duplicate is executed twice: a second call with the id of a running one reaches
//      the upstream.
//   3. A reservation leaks: a cancelled stream, an upstream error, an upstream that never answers
//      (the stream cap), or a crash between reserve and settle leaves credits held.
//   4. A settle is larger than its reservation (the account pays past what it was allowed).
//   5. An upstream that reports no usage is served free (it must be charged the reservation).
//   6. The month rollover: last month's grant or use counts in the new period, or `resetsAt` is not
//      the first instant of the next UTC month.
//   7. An unpriced model is served (text or image), or served from a cost record dated in the future.
//   8. A ledger line carries a world scope, or a ledger with a scope loads.
//   9. The call runs with no allowance left, or a per-account flood is not answered `gateway-busy`.
//  10. An upstream's 401 reaches the app as a 401 (main would sign the player out for the
//      operator's broken key).

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gatewayErrorSchema, gatewayModelListSchema, quotaStatusSchema } from "@shared/quota";
import { describe, expect, it } from "vitest";
import { FakeUpstream } from "../fixtures/gateway/upstream";
import {
  account,
  CHAT,
  call,
  chat,
  DAY_MS,
  defaultCosts,
  defaultUpstreams,
  grant,
  type Harness,
  IMAGE,
  linesOf,
  openWith,
  secretOf,
  sleep,
  start,
  startHanging,
  tempDir,
  writeSetup,
} from "./support";

const A = secretOf("quota-a");
/** The default chat's hold: a 17-token prompt estimate × 2 + 100 answer tokens × 10. */
const HOLD = 1_034;
/** The fake upstream's usage: (20 − 5) × 2 + 5 × 1 + 30 × 10. */
const USED = 335;

async function funded(options: Parameters<typeof start>[0] = {}, credits = 100_000) {
  const h = start(options);
  const a = await account(h.gw, A);
  if (credits > 0) await grant(h.gw, a.account, credits);
  return { ...h, a };
}

async function quota(h: Harness, token: string) {
  const answer = await call(h.gw, "GET", "/v1/quota", { token });
  expect(quotaStatusSchema.safeParse(answer.body).success).toBe(true);
  return answer.body;
}
const settles = (h: Harness) =>
  linesOf(h.dir, "ledger.jsonl").filter((line) => line.t === "settle");
const releases = (h: Harness) =>
  linesOf(h.dir, "ledger.jsonl").filter((line) => line.t === "release");

describe("request ids (1, 2)", () => {
  it("runs an id once: a settled or released id is refused for 24 h, then runs again", async () => {
    const h = await funded();
    const first = await chat(h.gw, h.a.token, "req-00000001");
    expect(first.status).toBe(200);
    expect(first.text).toContain("data: [DONE]");
    const again = await chat(h.gw, h.a.token, "req-00000001");
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("request-settled");

    h.upstream.mode = "status";
    expect((await chat(h.gw, h.a.token, "req-00000002")).status).toBe(502);
    h.upstream.mode = "usage";
    expect((await chat(h.gw, h.a.token, "req-00000002")).body.error.code).toBe("request-settled");
    expect(h.upstream.calls).toHaveLength(2);

    h.clock.ms += DAY_MS;
    expect((await chat(h.gw, h.a.token, "req-00000001")).status).toBe(200);
    expect(h.upstream.calls).toHaveLength(3);
    expect(settles(h)).toHaveLength(2);
    h.gw.close();
  });

  it("never executes an in-flight duplicate", async () => {
    const h = await funded();
    h.upstream.mode = "hang-headers";
    await startHanging(h, h.a.token, "req-inflight-1");
    const twin = await chat(h.gw, h.a.token, "req-inflight-1");
    expect(twin.status).toBe(409);
    expect(twin.body.error.code).toBe("request-in-flight");
    expect(h.upstream.calls).toHaveLength(1);
    expect((await quota(h, h.a.token)).reserved).toBe(HOLD);
    h.gw.close();
  });
});

describe("holds never leak (3)", () => {
  it("releases the hold of a stream the client cancels", async () => {
    const h = await funded();
    h.upstream.mode = "hang-stream";
    const request = new Request("http://gateway.test/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${h.a.token}`,
        "content-type": "application/json",
        "x-request-id": "req-cancel-01",
        "x-unmapped-purpose": "witness",
      },
      body: JSON.stringify({
        model: CHAT,
        messages: [{ role: "user", content: "Hi" }],
        stream: true,
        max_tokens: 10,
      }),
    });
    const response = await h.gw.handle(request, { ip: "203.0.113.7", loopback: false });
    expect(response.status).toBe(200);
    expect((await quota(h, h.a.token)).reserved).toBeGreaterThan(0);
    await response.body?.cancel();
    expect(releases(h).map((line) => line.reason)).toEqual(["abort"]);
    expect(await quota(h, h.a.token)).toMatchObject({ used: 0, reserved: 0 });
    h.gw.close();
  });

  it("releases on an upstream error, a broken stream and an error event", async () => {
    const h = await funded();
    h.upstream.mode = "status";
    const refused = await chat(h.gw, h.a.token, "req-error-001");
    expect(refused.status).toBe(502);
    expect(refused.body.error.code).toBe("gateway-upstream");
    h.upstream.mode = "break";
    const broken = await chat(h.gw, h.a.token, "req-error-002");
    expect(broken.text).toContain("gateway-upstream");
    h.upstream.mode = "error-event";
    await chat(h.gw, h.a.token, "req-error-003");
    expect(releases(h).map((line) => line.reason)).toEqual(["error", "error", "error"]);
    expect(await quota(h, h.a.token)).toMatchObject({ used: 0, reserved: 0 });
    h.gw.close();
  });

  it("cuts an upstream that never answers, or goes quiet, at the stream cap", async () => {
    const h = await funded({ limits: { streamCapMs: 30 } });
    h.upstream.mode = "hang-headers";
    const silent = await chat(h.gw, h.a.token, "req-cap-00001");
    expect(silent.status).toBe(504);
    expect(silent.body.error.code).toBe("gateway-stream-cap");
    h.upstream.mode = "hang-stream";
    const quiet = await chat(h.gw, h.a.token, "req-cap-00002");
    expect(quiet.status).toBe(200);
    expect(quiet.text).toContain("gateway-stream-cap");
    expect(releases(h).map((line) => line.reason)).toEqual(["stream-cap", "stream-cap"]);
    expect(await quota(h, h.a.token)).toMatchObject({ used: 0, reserved: 0 });
    h.gw.close();
  });

  it("releases a hold a crash left between reserve and settle, and never runs its id again", async () => {
    const h = await funded();
    h.upstream.mode = "hang-headers";
    await startHanging(h, h.a.token, "req-crash-001");
    // The process dies: nothing settles or releases; only the lock is gone.
    h.gw.close();

    const after = start({ dir: h.dir, clock: h.clock, upstream: new FakeUpstream() });
    expect(after.gw.report.released).toBe(0);
    expect((await quota(after, h.a.token)).reserved).toBe(HOLD);
    expect((await chat(after.gw, h.a.token, "req-crash-001")).body.error.code).toBe(
      "request-in-flight",
    );
    h.clock.ms += 10 * 60_000;
    expect(after.gw.sweep()).toBe(1);
    expect(await quota(after, h.a.token)).toMatchObject({ used: 0, reserved: 0 });
    expect((await chat(after.gw, h.a.token, "req-crash-001")).body.error.code).toBe(
      "request-settled",
    );
    expect(after.upstream.calls).toHaveLength(0);

    after.upstream.mode = "hang-headers";
    await startHanging(after, h.a.token, "req-crash-002");
    after.gw.close();
    h.clock.ms += 11 * 60_000;
    const later = start({ dir: h.dir, clock: h.clock });
    expect(later.gw.report.released).toBe(1);
    expect(releases(later).map((line) => line.reason)).toEqual(["stale", "stale"]);
    later.gw.close();
  });
});

describe("settles (4, 5)", () => {
  it("settles on the provider's usage, never above the hold", async () => {
    const h = await funded();
    expect((await chat(h.gw, h.a.token, "req-settle-01")).status).toBe(200);
    h.upstream.usage = { prompt_tokens: 900_000, completion_tokens: 90_000 };
    expect((await chat(h.gw, h.a.token, "req-settle-02")).status).toBe(200);
    const [normal, huge] = settles(h);
    expect(normal).toMatchObject({
      v: 1,
      purpose: "witness",
      scope: null,
      provider: "local",
      model: CHAT,
      input: 20,
      output: 30,
      cached: 5,
      outcome: "done",
      credits: USED,
      charged: "usage",
    });
    expect(huge).toMatchObject({ input: 900_000, output: 90_000, credits: HOLD, charged: "usage" });
    expect((await quota(h, h.a.token)).used).toBe(USED + HOLD);
    h.gw.close();

    // A ledger whose settle outgrew its hold is damaged, never loaded.
    const path = join(h.dir, "ledger.jsonl");
    writeFileSync(
      path,
      readFileSync(path, "utf8").replace(
        `"credits":${HOLD},"charged"`,
        `"credits":${HOLD + 1},"charged"`,
      ),
    );
    const reopened = openWith({ dir: h.dir, clock: h.clock });
    expect(reopened.opened.ok).toBe(false);
    if (!reopened.opened.ok) expect(reopened.opened.error.code).toBe("gateway-ledger-damaged");
  });

  it("charges the hold when the upstream reports no usage, streamed or not", async () => {
    const h = await funded();
    h.upstream.mode = "no-usage";
    expect((await chat(h.gw, h.a.token, "req-nousage-1")).status).toBe(200);
    expect((await chat(h.gw, h.a.token, "req-nousage-2", { stream: false })).status).toBe(200);
    for (const line of settles(h)) {
      expect(line).toMatchObject({ input: null, output: null, credits: HOLD, charged: "reserved" });
    }
    expect((await quota(h, h.a.token)).used).toBe(2 * HOLD);
    h.gw.close();
  });

  it("forwards only whitelisted fields, and holds and charges pictures per picture", async () => {
    const h = await funded();
    await chat(h.gw, h.a.token, "req-body-0001", {
      extra: { n: 8, logit_bias: { 1: 100 }, grammar: 'root ::= "a"' },
    });
    const body = h.upstream.calls[0]?.body ?? {};
    expect(body).toMatchObject({
      model: "qwen-local",
      max_tokens: 100,
      stream: true,
      stream_options: { include_usage: true },
      grammar: 'root ::= "a"',
      chat_template_kwargs: { enable_thinking: false },
    });
    expect(body).not.toHaveProperty("n");
    expect(body).not.toHaveProperty("logit_bias");

    const pictures = await call(h.gw, "POST", "/v1/images/generations", {
      token: h.a.token,
      headers: { "x-request-id": "req-image-001", "x-unmapped-purpose": "image" },
      json: { model: IMAGE, prompt: "a lantern", n: 2 },
    });
    expect(pictures.status).toBe(200);
    expect(pictures.body.data).toHaveLength(2);
    const form = new FormData();
    form.set("model", IMAGE);
    form.set("prompt", "the same lantern, lit");
    form.append(
      "image",
      new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
      "look.png",
    );
    const edited = await call(h.gw, "POST", "/v1/images/edits", {
      token: h.a.token,
      headers: { "x-request-id": "req-image-002", "x-unmapped-purpose": "image" },
      body: form,
    });
    expect(edited.status).toBe(200);
    expect(h.upstream.calls[2]?.form?.get("model")).toBe(IMAGE);
    const [, first, second] = settles(h);
    expect(first).toMatchObject({ purpose: "image", credits: 20_000, input: 50, output: 4_000 });
    expect(second).toMatchObject({ purpose: "image", credits: 10_000 });
    h.gw.close();
  });
});

describe("the month (6)", () => {
  it("counts a grant and its use only in their own UTC month", async () => {
    const clock = new (await import("./support")).FakeClock();
    clock.ms = Date.parse("2026-10-31T23:59:00.000Z");
    const h = await funded({ clock }, 0);
    await grant(h.gw, h.a.account, 5_000);
    await grant(h.gw, h.a.account, 7_000, "2026-12");
    expect(await quota(h, h.a.token)).toEqual({
      period: "2026-10",
      granted: 5_000,
      used: 0,
      reserved: 0,
      resetsAt: "2026-11-01T00:00:00.000Z",
      plan: null,
    });
    expect((await chat(h.gw, h.a.token, "req-month-001")).status).toBe(200);
    expect((await quota(h, h.a.token)).used).toBe(USED);

    clock.ms = Date.parse("2026-11-01T00:00:00.000Z");
    expect(await quota(h, h.a.token)).toMatchObject({ period: "2026-11", granted: 0, used: 0 });
    expect((await chat(h.gw, h.a.token, "req-month-002")).body.error.code).toBe("quota-exhausted");
    clock.ms = Date.parse("2026-12-15T00:00:00.000Z");
    expect(await quota(h, h.a.token)).toMatchObject({
      period: "2026-12",
      granted: 7_000,
      resetsAt: "2027-01-01T00:00:00.000Z",
    });
    h.gw.close();
  });
});

describe("pricing (7)", () => {
  it("serves no model without a record in force, text or image", async () => {
    const dir = tempDir();
    const [chatCost] = defaultCosts();
    writeSetup(
      dir,
      defaultUpstreams(),
      chatCost === undefined ? [] : [{ ...chatCost, asOf: "2026-10-11" }],
    );
    const h = await funded({ dir });
    expect((await call(h.gw, "GET", "/v1/models")).body.data).toEqual([]);
    const text = await chat(h.gw, h.a.token, "req-price-001");
    expect(text.status).toBe(404);
    expect(text.body.error.code).toBe("gateway-model-unpriced");
    const picture = await call(h.gw, "POST", "/v1/images/generations", {
      token: h.a.token,
      headers: { "x-request-id": "req-price-002", "x-unmapped-purpose": "image" },
      json: { model: IMAGE, prompt: "a lantern" },
    });
    expect(picture.body.error.code).toBe("gateway-model-unpriced");
    expect(
      (await chat(h.gw, h.a.token, "req-price-003", { model: "gpt-unknown" })).body.error.code,
    ).toBe("gateway-model-unavailable");
    expect(h.upstream.calls).toHaveLength(0);

    h.clock.ms = Date.parse("2026-10-11T00:00:00.000Z");
    const models = (await call(h.gw, "GET", "/v1/models")).body;
    expect(gatewayModelListSchema.safeParse(models).success).toBe(true);
    const listed = models.data;
    expect(listed.map((model: { id: string }) => model.id)).toEqual([CHAT]);
    expect(listed[0]).toMatchObject({
      kind: "chat",
      default: true,
      licence: { id: "apache-2.0", commercial: true },
    });
    expect((await chat(h.gw, h.a.token, "req-price-004")).status).toBe(200);
    h.gw.close();

    const wrongKind = tempDir();
    writeSetup(wrongKind, defaultUpstreams(), [
      { model: CHAT, upstream: "local", perImage: 0.01, source: "fixture", asOf: "2026-01-01" },
    ]);
    const w = await funded({ dir: wrongKind });
    expect((await chat(w.gw, w.a.token, "req-price-005")).body.error.code).toBe(
      "gateway-model-unpriced",
    );
    w.gw.close();
  });
});

describe("no world scope (8)", () => {
  it("writes none, whatever the caller sends, and refuses a ledger that carries one", async () => {
    const h = await funded();
    const sent = await chat(h.gw, h.a.token, "req-scope-001", {
      headers: { "x-unmapped-scope": "instance:w-secret-world" },
      extra: { scope: { kind: "instance", id: "w-secret-world" }, user: "w-secret-world" },
    });
    expect(sent.status).toBe(200);
    const ledger = readFileSync(join(h.dir, "ledger.jsonl"), "utf8");
    expect(ledger).not.toContain("w-secret-world");
    expect(JSON.stringify(h.upstream.calls[0]?.body)).not.toContain("w-secret-world");
    expect(settles(h).map((line) => line.scope)).toEqual([null]);
    h.gw.close();

    const path = join(h.dir, "ledger.jsonl");
    writeFileSync(path, ledger.replace('"scope":null', '"scope":{"kind":"instance","id":"w1"}'));
    const reopened = openWith({ dir: h.dir, clock: h.clock });
    expect(reopened.opened.ok ? "" : reopened.opened.error.code).toBe("gateway-ledger-damaged");
  });
});

describe("allowance and floods (9, 10)", () => {
  it("runs nothing without allowance for the whole hold", async () => {
    const h = await funded({}, 0);
    const none = await chat(h.gw, h.a.token, "req-empty-001");
    expect(none.status).toBe(402);
    expect(gatewayErrorSchema.safeParse(none.body).success).toBe(true);
    expect(none.body.error).toMatchObject({
      code: "quota-exhausted",
      resetsAt: "2026-11-01T00:00:00.000Z",
    });
    await grant(h.gw, h.a.account, HOLD - 1);
    expect((await chat(h.gw, h.a.token, "req-empty-002")).status).toBe(402);
    expect(h.upstream.calls).toHaveLength(0);
    await grant(h.gw, h.a.account, 1);
    expect((await chat(h.gw, h.a.token, "req-empty-003")).status).toBe(200);
    h.gw.close();
  });

  it("answers a flood with gateway-busy, per minute and in flight", async () => {
    const h = await funded({ limits: { requestsPerMinute: 3, inFlight: 1 } });
    for (let i = 1; i <= 3; i += 1)
      expect((await chat(h.gw, h.a.token, `req-flood-00${i}`)).status).toBe(200);
    const fourth = await chat(h.gw, h.a.token, "req-flood-004");
    expect(fourth.status).toBe(429);
    expect(fourth.body.error.code).toBe("gateway-busy");
    expect(h.upstream.calls).toHaveLength(3);
    h.clock.tick(60_000);
    h.upstream.mode = "hang-headers";
    await startHanging(h, h.a.token, "req-flood-005");
    expect((await chat(h.gw, h.a.token, "req-flood-006")).body.error.code).toBe("gateway-busy");
    h.gw.close();
  });

  it("never passes an upstream's 401 on as the player's 401", async () => {
    const h = await funded();
    h.upstream.mode = "status";
    h.upstream.status = 401;
    const answer = await chat(h.gw, h.a.token, "req-upauth-01");
    expect(answer.status).toBe(502);
    expect(answer.body.error.code).toBe("gateway-upstream-auth");
    expect((await call(h.gw, "GET", "/v1/quota", { token: h.a.token })).status).toBe(200);
    expect(releases(h).map((line) => line.reason)).toEqual(["error"]);
    await sleep(0);
    h.gw.close();
  });
});
