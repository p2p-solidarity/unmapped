// What the gateway refuses to start with (rev 6 phase 4, D3 "Nothing charges real money in
// development", D4 "The switch"). Pure over the env, the saved keys and the checked upstreams, so
// every refusal is a value a test can reach without a server.
//
//   GATEWAY_COMMERCIAL=1   every served model's licence record must say commercial
//   a live billing key     (sk_live_ / rk_live_) needs all of GATEWAY_BILLING_LIVE=1,
//                          NODE_ENV=production and GATEWAY_COMMERCIAL=1 (and so only commercial
//                          models), and never runs with the test clock
//   billing half set up    a secret key without the webhook secret (or the other way round)
//
// Billing keys resolve saved (`set-key stripe`, `set-key stripe-webhook`) → STRIPE_SECRET_KEY /
// STRIPE_WEBHOOK_SECRET, the app's order.

import type { BillingMode } from "@shared/billing";
import { err, ok, type Result } from "@shared/result";
import { stripeMode } from "./billing/stripe";
import { type EnvLike, type ResolvedKey, resolveKey, type SavedKeys } from "./secrets";
import type { UpstreamSet } from "./upstreams";

export interface BillingKeys {
  provider: "stripe";
  mode: BillingMode;
  secretKey: string;
  webhookSecret: string;
  sources: { secret: ResolvedKey["source"]; webhook: ResolvedKey["source"] };
}

export interface StartupDecision {
  commercial: boolean;
  test: boolean;
  billing: BillingKeys | null;
}

export function checkStartup(
  env: EnvLike,
  saved: SavedKeys,
  upstreams: UpstreamSet,
): Result<StartupDecision> {
  const commercial = env.GATEWAY_COMMERCIAL === "1";
  const test = env.UNMAPPED_GATEWAY_TEST === "1";
  const nonCommercial = upstreams.models.filter((model) => !model.licence.commercial);
  if (commercial && nonCommercial.length > 0) {
    return err(
      "gateway-noncommercial-upstream",
      `GATEWAY_COMMERCIAL=1, but ${nonCommercial
        .map((model) => `${model.id} (${model.licence.id})`)
        .join(", ")} may not be sold.`,
      "Stop serving those models, or unset GATEWAY_COMMERCIAL.",
    );
  }
  const secret = resolveKey("stripe", "STRIPE_SECRET_KEY", saved, env);
  const webhook = resolveKey("stripe-webhook", "STRIPE_WEBHOOK_SECRET", saved, env);
  if (secret === null && webhook === null) return ok({ commercial, test, billing: null });
  if (secret === null || webhook === null) {
    return err(
      "gateway-billing-incomplete",
      `Billing has ${secret === null ? "a webhook secret but no secret key" : "a secret key but no webhook secret"}.`,
      "Set both STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET (or save both), or neither.",
    );
  }
  const mode = stripeMode(secret.key);
  if (mode === null) {
    return err(
      "gateway-billing-key",
      "The Stripe secret key is neither a test key (sk_test_ / rk_test_) nor a live one.",
    );
  }
  if (!/^whsec_[A-Za-z0-9]+$/.test(webhook.key)) {
    return err("gateway-billing-key", "The Stripe webhook secret does not start with whsec_.");
  }
  if (mode === "live") {
    const missing = [
      env.GATEWAY_BILLING_LIVE === "1" ? null : "GATEWAY_BILLING_LIVE=1",
      env.NODE_ENV === "production" ? null : "NODE_ENV=production",
      commercial ? null : "GATEWAY_COMMERCIAL=1",
      test ? "UNMAPPED_GATEWAY_TEST unset" : null,
    ].filter((item): item is string => item !== null);
    if (missing.length > 0) {
      return err(
        "gateway-billing-live-refused",
        `A live Stripe key would charge real money, and this start lacks ${missing.join(", ")}.`,
        "Use a test key (sk_test_…) in development. Going live is a person's decision.",
      );
    }
  }
  return ok({
    commercial,
    test,
    billing: {
      provider: "stripe",
      mode,
      secretKey: secret.key,
      webhookSecret: webhook.key,
      sources: { secret: secret.source, webhook: webhook.source },
    },
  });
}
