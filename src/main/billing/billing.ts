// Plans and subscriptions from main (rev 6 phase 4, D3). No plan, price or credit amount exists in
// this code (Rule 2): `GET /v1/plans` answers the billing provider's own catalogue, or
// `billing-not-configured`, and with no gateway at all the answer is `gateway-not-configured`.
// Checkout and the customer portal are the provider's pages, opened in the system browser from the
// address the gateway answers; the app never sees a payment detail and the renderer never names a
// page to open. UNMAPPED_BILLING_BROWSER=none only logs the address (for E2E runs).

import { type PlansResponse, plansResponseSchema, redirectResponseSchema } from "@shared/billing";
import { err, fail, ok, type Result } from "@shared/result";
import { shell } from "electron";
import { gatewayJson, needsSignIn, plain } from "../account/gatewayHttp";
import { gatewayNotConfigured, gatewaySetting, isLoopbackEndpoint } from "../inference/config";
import { resolveProviderKey } from "../inference/keyStore";
import type { EnvLike } from "../inference/keys";
import { returnPage } from "./returnPage";

function base(env: EnvLike): Result<string> {
  const setting = gatewaySetting(env);
  if (!setting.ok) return setting;
  return setting.value === null ? fail(gatewayNotConfigured()) : ok(setting.value);
}

export async function readPlans(env: EnvLike = process.env): Promise<Result<PlansResponse>> {
  const gateway = base(env);
  if (!gateway.ok) return gateway;
  return plain(
    await gatewayJson(gateway.value, { method: "GET", path: "/plans" }, plansResponseSchema),
  );
}

/** Only the provider's https page (or one on this computer, for a local test) opens. */
function openable(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || (parsed.protocol === "http:" && isLoopbackEndpoint(url));
  } catch {
    return false;
  }
}

async function open(url: string, env: EnvLike): Promise<Result<void>> {
  if (!openable(url)) {
    return err(
      "billing-page-refused",
      "The gateway answered a billing page that is not an https:// address.",
      "Ask the gateway's operator; nothing was opened.",
    );
  }
  if (env.UNMAPPED_BILLING_BROWSER === "none") {
    process.stdout.write(`[billing] page ${url}\n`);
    return ok(undefined);
  }
  try {
    await shell.openExternal(url);
    return ok(undefined);
  } catch (error) {
    return err(
      "open-external-failed",
      error instanceof Error ? error.message : String(error),
      "Open your browser and try again.",
    );
  }
}

/** POSTs `/billing/checkout` or `/billing/portal` and opens the page it answers. */
export async function openBillingPage(
  page: { kind: "checkout"; plan: string } | { kind: "portal" },
  onReturn: () => void,
  env: EnvLike = process.env,
): Promise<Result<void>> {
  const gateway = base(env);
  if (!gateway.ok) return gateway;
  const token = await resolveProviderKey("hosted", env);
  if (!token.ok || token.value === null) return needsSignIn();
  let returnUrl: string;
  try {
    returnUrl = await returnPage(onReturn);
  } catch (error) {
    return err(
      "billing-return-page-failed",
      `The page the provider returns to could not start: ${error instanceof Error ? error.message : String(error)}`,
      "Try again.",
    );
  }
  const body = page.kind === "checkout" ? { plan: page.plan, returnUrl } : { returnUrl };
  const answer = await gatewayJson(
    gateway.value,
    { method: "POST", path: `/billing/${page.kind}`, token: token.value.key, body },
    redirectResponseSchema,
  );
  if (!answer.ok) return fail(answer.error);
  return open(answer.value.url, env);
}
