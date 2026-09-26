// The gateway's HTTP surface (rev 6 phase 4, D1–D3). OpenAI-compatible where the app calls a model,
// plain JSON elsewhere; every error is `{ error: { code, message, hint? } }`.
//
//   GET  /v1/health                       { key, version, test }
//   GET  /v1/status                       { commercial, billing: { provider, mode } | null }
//   GET  /v1/models                       served, priced models, each with its licence record
//   GET  /v1/plans                        the provider's plans, or 503 billing-not-configured
//   POST /v1/auth/challenge               { nonce, gatewayKey, expiresAt }
//   POST /v1/auth/token                   signed sign-in → an account token (one per device)
//   POST /v1/auth/revoke             (T)  revokes the token presented
//   POST /v1/account/pairing              a new device asks for a pairing code (signed)
//   GET  /v1/account/pairing/<code>  (T)  the key behind a pending code (never spends it)
//   GET  /v1/account                 (T)  { id, keys, device }
//   POST /v1/account/keys            (T)  add (with the code) or remove a device key (signed)
//   POST /v1/account/verify/start    (T)  a verifier's code (503 verifier-not-configured without one)
//   POST /v1/account/verify/confirm  (T)  → the verified allowance for this period
//   GET  /v1/quota                   (T)  { period, granted, used, reserved, resetsAt, plan }
//   POST /v1/chat/completions        (T)  streaming with include_usage; X-Request-Id, X-Unmapped-Purpose
//   POST /v1/images/generations      (T)  the same headers
//   POST /v1/images/edits            (T)  multipart, the same headers
//   POST /v1/billing/checkout        (T)  { plan, returnUrl } → { url }
//   POST /v1/billing/portal          (T)  { returnUrl } → { url }
//   POST /v1/billing/webhook              the provider's signed events (never CORS)
//   POST /v1/admin/{grant,token,revoke}   the CLI, on loopback with the admin secret only
//   POST /v1/test/advance                 UNMAPPED_GATEWAY_TEST=1 only: moves the ledger clock
//
// (T): `Authorization: Bearer ugk_…`. CORS headers go only to origins in GATEWAY_WEB_ORIGINS, and
// never on the webhook, admin or test routes.

import { timingSafeEqual } from "node:crypto";
import {
  ACCOUNT_ID,
  challengeResponseSchema,
  keyChangeRequestSchema,
  pairingRequestSchema,
  signInRequestSchema,
  TOKEN_ID,
} from "@shared/account";
import { checkoutRequestSchema, portalRequestSchema } from "@shared/billing";
import { QUOTA_PERIOD } from "@shared/quota";
import { z } from "zod";
import type { Refusal, TokenAuth } from "./accounts";
import { webhook } from "./billingRoutes";
import { chatCompletions } from "./chat";
import { costFor } from "./costs";
import { imageEdits, imageGenerations } from "./images";
import { fail, json, readJson, refusal } from "./respond";
import type { GatewayState } from "./state";
import { subjectOf } from "./verifier";

export const GATEWAY_VERSION = 1;

export interface Client {
  ip: string;
  /** The socket's own address is loopback and no proxy header is present. */
  loopback: boolean;
}

const NO_CORS = /^\/v1\/(billing\/webhook|admin\/|test\/)/;
/** `GET /v1/account/pairing/<code>`. */
const PAIRING_LOOKUP = "/v1/account/pairing/";
/** The routes behind an account token; any other unknown path is a 404, token or not. */
const AUTHED = new Set([
  "/v1/chat/completions",
  "/v1/images/generations",
  "/v1/images/edits",
  "/v1/quota",
  "/v1/account",
  "/v1/auth/revoke",
  "/v1/account/keys",
  "/v1/account/verify/start",
  "/v1/account/verify/confirm",
  "/v1/billing/checkout",
  "/v1/billing/portal",
]);
const advanceSchema = z.strictObject({ days: z.number().positive().max(3650) });
const grantSchema = z.strictObject({
  account: z.string().regex(ACCOUNT_ID),
  credits: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  period: z.string().regex(QUOTA_PERIOD).nullable(),
});
const tokenSchema = z.strictObject({
  account: z.string().regex(ACCOUNT_ID),
  label: z.string().min(1).max(60),
});
const revokeSchema = z.strictObject({ tokenId: z.string().regex(TOKEN_ID) });
const verifyStartSchema = z.strictObject({ address: z.string().min(3).max(320) });
const verifyConfirmSchema = z.strictObject({
  challenge: z.string().min(1).max(200),
  code: z.string().min(1).max(40),
});

const notFound = () =>
  fail(404, { code: "not-found", message: "No such endpoint on this gateway." });

function corsHeaders(
  state: GatewayState,
  request: Request,
  path: string,
): Record<string, string> | null {
  const origin = request.headers.get("origin");
  if (origin === null || NO_CORS.test(path) || !state.origins.has(origin)) return null;
  return {
    "access-control-allow-origin": origin,
    vary: "origin",
    "access-control-allow-methods": "GET, POST",
    "access-control-allow-headers": "authorization, content-type, x-request-id, x-unmapped-purpose",
    "access-control-max-age": "600",
  };
}

function withHeaders(response: Response, headers: Record<string, string> | null): Response {
  if (headers === null) return response;
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
}

/** Sign-in, challenge and pairing per client address per minute. */
function authFlood(state: GatewayState, ip: string): Response | null {
  const real = state.clock.real();
  const window = state.authWindows.get(ip);
  if (window === undefined || real - window.start >= 60_000) {
    if (state.authWindows.size > 50_000) state.authWindows.clear();
    state.authWindows.set(ip, { start: real, count: 1 });
    return null;
  }
  window.count += 1;
  if (window.count <= state.limits.authPerMinute) return null;
  return fail(429, { code: "gateway-busy", message: "Too many sign-in requests from here." });
}

function adminAllowed(state: GatewayState, request: Request, client: Client): boolean {
  if (!client.loopback || request.headers.has("x-forwarded-for")) return false;
  const given = Buffer.from(request.headers.get("x-unmapped-admin") ?? "");
  const secret = Buffer.from(state.adminSecret);
  return given.length === secret.length && timingSafeEqual(given, secret);
}

async function admin(state: GatewayState, request: Request, client: Client, path: string) {
  if (!adminAllowed(state, request, client)) {
    return fail(403, {
      code: "admin-denied",
      message: "Admin calls come from the gateway CLI on this host.",
    });
  }
  if (path === "/v1/admin/grant") {
    const body = await readJson(request, grantSchema);
    if (!body.ok) return fail(400, body.error);
    if (!state.accounts.has(body.value.account)) {
      return fail(404, {
        code: "account-unknown",
        message: `No account ${body.value.account} here.`,
      });
    }
    const granted = state.ledger.grant(body.value.account, body.value.credits, body.value.period);
    return granted.ok ? json(200, granted.value) : fail(500, granted.error);
  }
  if (path === "/v1/admin/token") {
    const body = await readJson(request, tokenSchema);
    if (!body.ok) return fail(400, body.error);
    const issued = state.accounts.issueCliToken(body.value.account, body.value.label);
    return issued.ok ? json(200, issued.value) : fail(404, issued.error);
  }
  if (path === "/v1/admin/revoke") {
    const body = await readJson(request, revokeSchema);
    if (!body.ok) return fail(400, body.error);
    const revoked = state.accounts.revoke(body.value.tokenId, "operator");
    return revoked.ok ? json(200, { revoked: body.value.tokenId }) : fail(404, revoked.error);
  }
  return notFound();
}

function models(state: GatewayState) {
  const now = state.clock.now();
  const data = state.models
    .filter((model) => {
      const cost = costFor(state.costs, model.id, model.upstream.id, now);
      return cost !== null && (model.kind === "chat" ? "perMillion" in cost : "perImage" in cost);
    })
    .map((model) => ({
      id: model.id,
      object: "model" as const,
      owned_by: model.upstream.id,
      kind: model.kind,
      default: model.default,
      licence: model.licence,
    }));
  return json(200, { object: "list", data });
}

async function verify(state: GatewayState, request: Request, auth: TokenAuth, confirm: boolean) {
  if (state.verifier === null || state.limits.freeCredits < 1) {
    return fail(503, {
      code: "verifier-not-configured",
      message: "This gateway has no verifier for the free allowance.",
      hint: "The operator grants allowance with `bun run gateway -- grant`.",
    });
  }
  const { verifier, pepper } = state.verifier;
  if (!confirm) {
    const body = await readJson(request, verifyStartSchema);
    if (!body.ok) return fail(400, body.error);
    const started = await verifier.start(body.value.address);
    return started.ok ? json(200, started.value) : fail(400, started.error);
  }
  const body = await readJson(request, verifyConfirmSchema);
  if (!body.ok) return fail(400, body.error);
  const confirmed = await verifier.confirm(body.value.challenge, body.value.code);
  if (!confirmed.ok) return fail(400, confirmed.error);
  const subject = subjectOf(pepper, confirmed.value.address);
  const granted = state.ledger.grant(
    auth.account,
    state.limits.freeCredits,
    null,
    "verifier",
    subject,
  );
  return granted.ok ? json(200, granted.value) : fail(409, granted.error);
}

async function authed(
  state: GatewayState,
  request: Request,
  path: string,
  auth: TokenAuth,
): Promise<Response> {
  const method = request.method;
  if (path === "/v1/chat/completions" && method === "POST")
    return chatCompletions(state, request, auth);
  if (path === "/v1/images/generations" && method === "POST")
    return imageGenerations(state, request, auth);
  if (path === "/v1/images/edits" && method === "POST") return imageEdits(state, request, auth);
  if (path === "/v1/quota" && method === "GET") return json(200, state.ledger.quota(auth.account));
  if (path === "/v1/account" && method === "GET") {
    return json(200, state.accounts.view(auth.account, auth.device));
  }
  if (path === "/v1/auth/revoke" && method === "POST") {
    const revoked = state.accounts.revoke(auth.tokenId, "signed-out");
    return revoked.ok ? json(200, { revoked: auth.tokenId }) : fail(500, revoked.error);
  }
  if (path === "/v1/account/keys" && method === "POST") {
    const body = await readJson(request, keyChangeRequestSchema);
    if (!body.ok) return fail(400, body.error);
    const changed = state.accounts.changeKey(auth, body.value);
    return changed.ok ? json(200, changed.value) : refusal(changed);
  }
  if (path === "/v1/account/verify/start" && method === "POST")
    return verify(state, request, auth, false);
  if (path === "/v1/account/verify/confirm" && method === "POST")
    return verify(state, request, auth, true);
  if ((path === "/v1/billing/checkout" || path === "/v1/billing/portal") && method === "POST") {
    return billingPage(state, request, auth, path === "/v1/billing/checkout");
  }
  return notFound();
}

function billingOff(): Response {
  return fail(503, {
    code: "billing-not-configured",
    message: "This gateway sells no plans.",
    hint: "The operator sets up a billing provider (STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET).",
  });
}

async function billingPage(
  state: GatewayState,
  request: Request,
  auth: TokenAuth,
  checkout: boolean,
) {
  const billing = state.billing;
  if (billing === null) return billingOff();
  if (checkout) {
    const body = await readJson(request, checkoutRequestSchema);
    if (!body.ok) return fail(400, body.error);
    const page = await billing.checkout(auth.account, body.value.plan, body.value.returnUrl);
    return page.ok
      ? json(200, page.value)
      : fail(page.error.code === "billing-plan-unknown" ? 400 : 502, page.error);
  }
  const body = await readJson(request, portalRequestSchema);
  if (!body.ok) return fail(400, body.error);
  const customer = state.ledger.customerOf(auth.account, billing.id);
  if (customer === null) {
    return fail(404, {
      code: "billing-no-customer",
      message: "This account has never subscribed.",
    });
  }
  const page = await billing.portal(customer, body.value.returnUrl);
  return page.ok ? json(200, page.value) : fail(502, page.error);
}

async function route(state: GatewayState, request: Request, client: Client, path: string) {
  const method = request.method;
  if (path === "/v1/health" && method === "GET") {
    return json(200, {
      key: state.accounts.gatewayKey,
      version: GATEWAY_VERSION,
      test: state.test,
    });
  }
  if (path === "/v1/status" && method === "GET") {
    const billing =
      state.billing === null ? null : { provider: state.billing.id, mode: state.billing.mode };
    return json(200, { commercial: state.commercial, billing });
  }
  if (path === "/v1/models" && method === "GET") return models(state);
  if (path === "/v1/plans" && method === "GET") {
    if (state.billing === null) return billingOff();
    const plans = await state.billing.plans();
    if (!plans.ok) return fail(502, plans.error);
    return json(200, { provider: state.billing.id, mode: state.billing.mode, plans: plans.value });
  }
  if (path === "/v1/billing/webhook" && method === "POST") return webhook(state, request);
  if (path.startsWith("/v1/admin/") && method === "POST")
    return admin(state, request, client, path);
  if (path === "/v1/test/advance" && method === "POST") {
    if (!state.test || state.advance === null) {
      return fail(403, { code: "test-mode-off", message: "The test clock is off." });
    }
    const body = await readJson(request, advanceSchema);
    if (!body.ok) return fail(400, body.error);
    const offsetDays = state.advance(body.value.days);
    return json(200, { offsetDays, now: new Date(state.clock.now()).toISOString() });
  }
  if (path === "/v1/auth/challenge" && method === "POST") {
    return (
      authFlood(state, client.ip) ??
      json(200, challengeResponseSchema.parse(state.accounts.challenge()))
    );
  }
  if (path === "/v1/auth/token" && method === "POST") {
    const flood = authFlood(state, client.ip);
    if (flood !== null) return flood;
    const body = await readJson(request, signInRequestSchema);
    if (!body.ok) return fail(400, body.error);
    const signed = state.accounts.signIn(body.value);
    return signed.ok ? json(200, signed.value) : refusal(signed as Refusal);
  }
  if (path === "/v1/account/pairing" && method === "POST") {
    const flood = authFlood(state, client.ip);
    if (flood !== null) return flood;
    const body = await readJson(request, pairingRequestSchema);
    if (!body.ok) return fail(400, body.error);
    const code = state.accounts.requestPairing(body.value);
    return code.ok ? json(200, code.value) : refusal(code as Refusal);
  }
  if (path.startsWith(PAIRING_LOOKUP) && method === "GET") {
    // Rate-limited like the other pairing routes, and only for a signed-in account.
    const flood = authFlood(state, client.ip);
    if (flood !== null) return flood;
    const auth = state.accounts.authenticate(request.headers.get("authorization"));
    if (!auth.ok) return refusal(auth as Refusal, 401);
    // A malformed escape is just an unknown code (never a 500).
    let code = "";
    try {
      code = decodeURIComponent(path.slice(PAIRING_LOOKUP.length));
    } catch {}
    const found = state.accounts.lookupPairing(code);
    return found.ok ? json(200, found.value) : refusal(found as Refusal);
  }
  if (!AUTHED.has(path)) return notFound();
  const auth = state.accounts.authenticate(request.headers.get("authorization"));
  if (!auth.ok) return refusal(auth as Refusal, 401);
  return authed(state, request, path, auth.value);
}

/** Every request. Never throws: an unexpected failure is a logged 500. */
export async function handleHttp(
  state: GatewayState,
  request: Request,
  client: Client,
): Promise<Response> {
  const path = new URL(request.url).pathname;
  const cors = corsHeaders(state, request, path);
  if (request.method === "OPTIONS") {
    return cors === null
      ? fail(403, {
          code: "cors-origin-refused",
          message: "That origin may not call this gateway.",
        })
      : withHeaders(new Response(null, { status: 204 }), cors);
  }
  try {
    return withHeaders(await route(state, request, client, path), cors);
  } catch (error) {
    state.log(
      `http ${request.method} ${path}: ${error instanceof Error ? error.stack : String(error)}`,
    );
    return withHeaders(
      fail(500, { code: "gateway-internal", message: "The gateway failed on that request." }),
      cors,
    );
  }
}
