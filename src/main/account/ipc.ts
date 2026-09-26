// `window.seed.gateway.*` for the account (rev 6 phase 4, D1). Every payload is zod-checked here
// (Rule 6); every answer is a `Result` (Rule 5). The token and the device key stay in main: the
// renderer sends a pairing code and a public key at most, and gets back an `AccountStatus`.

import { GATEWAY_IPC } from "@shared/gatewayApi";
import { AUTHOR_KEY } from "@shared/history/ids";
import { z } from "zod";
import type { MainContext } from "../context";
import { handle } from "../handle";
import { gatewaySetting } from "../inference/config";
import { gatewayCommercial } from "./gatewayHttp";
import { accountService } from "./service";

const noArgs = z.tuple([]);
/** As typed; the service normalises and checks both, answering `pairing-code-invalid` / `-key-invalid`. */
const typed = z.string().max(120);
const deviceKey = z.string().regex(AUTHOR_KEY);

export function registerAccountIpc(ctx: MainContext): void {
  const account = accountService(ctx);
  handle(GATEWAY_IPC.account, noArgs, () => account.status());
  handle(GATEWAY_IPC.signIn, noArgs, () => account.signIn());
  handle(GATEWAY_IPC.signOut, noArgs, () => account.signOut());
  handle(GATEWAY_IPC.requestPairing, noArgs, () => account.requestPairing());
  handle(GATEWAY_IPC.cancelPairing, noArgs, () => account.cancelPairing());
  handle(GATEWAY_IPC.lookupPairing, z.tuple([typed]), ([code]) => account.lookupPairing(code));
  handle(GATEWAY_IPC.approvePairing, z.tuple([typed, typed]), ([code, key]) =>
    account.approvePairing(code, key),
  );
  handle(GATEWAY_IPC.removeDevice, z.tuple([deviceKey]), ([key]) => account.removeDevice(key));
  handle(GATEWAY_IPC.quota, noArgs, () => account.quota());
  ctx.onBeforeQuit(() => account.dispose());
}
