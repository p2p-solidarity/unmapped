// `POST /v1/billing/webhook` (rev 6 phase 4, D3): a provider event becomes an entitlement line only
// after its signature verifies over the exact raw body, and only once per event id. The provider's
// timestamp orders it (`Ledger`), so an older event arriving late is kept but decides nothing. An
// event for an account this gateway does not know, or for a price without `unmapped_credits`,
// grants nothing. Answers are 2xx for everything the provider should not retry.

import { isoAt } from "./clock";
import { fail, json, readText } from "./respond";
import type { GatewayState } from "./state";

const WEBHOOK_MAX = 1024 * 1024;

export async function webhook(state: GatewayState, request: Request): Promise<Response> {
  const billing = state.billing;
  if (billing === null) {
    return fail(503, { code: "billing-not-configured", message: "This gateway sells no plans." });
  }
  const raw = await readText(request, WEBHOOK_MAX);
  if (!raw.ok) return fail(413, raw.error);
  const parsed = billing.parseWebhook(raw.value, request.headers, state.clock.wall());
  if (!parsed.ok) {
    state.log(`webhook refused: ${parsed.error.code}`);
    return fail(400, parsed.error);
  }
  if (parsed.value.kind === "ignored") {
    return json(200, { received: true, ignored: parsed.value.type });
  }
  const event = parsed.value.event;
  if (event.account === null || !state.accounts.has(event.account)) {
    state.log(`webhook ${event.id}: subscription ${event.subscription} names no account here`);
    return json(200, { received: true, ignored: "account-unknown" });
  }
  if (event.credits === null) {
    state.log(
      `webhook ${event.id}: price ${event.plan} has no valid unmapped_credits; grants nothing`,
    );
  }
  const applied = state.ledger.entitlement({
    provider: billing.id,
    eventId: event.id,
    providerAt: isoAt(event.at),
    subscription: event.subscription,
    customer: event.customer,
    entitlement: {
      accountId: event.account,
      source: `billing:${billing.id}`,
      plan: event.plan,
      creditsPerPeriod: event.credits ?? 0,
      status: event.status,
      validFrom: event.validFrom,
      validUntil: event.validUntil,
    },
  });
  if (!applied.ok) {
    state.log(`webhook ${event.id}: ${applied.error.message}`);
    return fail(500, applied.error);
  }
  state.log(`webhook ${event.id} ${event.status} ${event.subscription}: ${applied.value}`);
  return json(200, { received: true, result: applied.value });
}
