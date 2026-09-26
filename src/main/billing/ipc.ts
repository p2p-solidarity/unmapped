// `window.seed.gateway.{plans, checkout, portal}` (rev 6 phase 4, D3). The renderer names a plan id
// the provider's catalogue listed, nothing else: main asks the gateway for the page and opens it.
// A 401 on the account token signs this device out, as on every other hosted call.

import { GATEWAY_IPC } from "@shared/gatewayApi";
import { fail, type Result } from "@shared/result";
import { z } from "zod";
import { accountService } from "../account/service";
import type { MainContext } from "../context";
import { handle } from "../handle";
import { openBillingPage, readPlans } from "./billing";

export function registerBillingIpc(ctx: MainContext): void {
  const account = accountService(ctx);
  const onReturn = () => void account.refreshQuota();
  const signedOutOn401 = async (result: Result<void>): Promise<Result<void>> => {
    if (!result.ok && result.error.code.startsWith("account-token-")) {
      await account.status();
      return fail({ ...result.error, code: "account-signed-out" });
    }
    return result;
  };
  handle(GATEWAY_IPC.plans, z.tuple([]), () => readPlans());
  handle(GATEWAY_IPC.checkout, z.tuple([z.string().min(1).max(200)]), async ([plan]) =>
    signedOutOn401(await openBillingPage({ kind: "checkout", plan }, onReturn)),
  );
  handle(GATEWAY_IPC.portal, z.tuple([]), async () =>
    signedOutOn401(await openBillingPage({ kind: "portal" }, onReturn)),
  );
}
