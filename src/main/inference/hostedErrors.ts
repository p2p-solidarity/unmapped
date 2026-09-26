// What a hosted call's failure means to the player (rev 6 phase 4, D2 "New errors"). The gateway
// answers `{ error: { code, message, hint?, resetsAt? } }` with a status, or mid-stream as an SSE
// `data: {"error": …}` event (which the OpenAI SDK raises as an APIError with no status). Its codes
// pass through, except that every refused account token reads as one `account-signed-out`: main then
// clears a saved token so `.env`'s UNMAPPED_GATEWAY_KEY takes over (`forgetDeadToken`).
//
//   401 account-token-{invalid,revoked,expired}  → account-signed-out
//   402 quota-exhausted (resetsAt)                → quota-exhausted, with the reset in the message
//   404 gateway-model-{unavailable,unpriced}      409 request-{in-flight,settled}
//   429 gateway-busy   400 gateway-max-tokens     502 gateway-upstream-auth / gateway-upstream*
//   504 gateway-stream-cap (also mid-stream)

import { GATEWAY_ERRORS, gatewayErrorSchema } from "@shared/quota";
import type { AppError } from "@shared/result";
import type { APIError } from "openai";

const SIGNED_OUT: ReadonlySet<string> = new Set([
  GATEWAY_ERRORS.tokenInvalid,
  GATEWAY_ERRORS.tokenRevoked,
  GATEWAY_ERRORS.tokenExpired,
]);

/** Whether a gateway error code means this device's token is no longer accepted. */
export function isDeadTokenCode(code: string): boolean {
  return SIGNED_OUT.has(code) || code === "account-signed-out";
}

export function signedOutError(why?: string): AppError {
  return {
    code: "account-signed-out",
    message: why ?? "This device is not signed in to the generation gateway.",
    hint: "Sign in again in Settings → Advanced settings → Account, add UNMAPPED_GATEWAY_KEY to .env, or use your own key or a local model in Settings → Model.",
  };
}

/** The gateway's own error body, or null when the answer was not one. */
function gatewayBody(value: unknown) {
  const parsed = gatewayErrorSchema.safeParse({ error: value });
  return parsed.success ? parsed.data.error : null;
}

/** An APIError from a hosted call as the AppError the player sees. */
export function hostedError(e: APIError): AppError {
  const body = gatewayBody(e.error);
  if (e.status === 401 || (body !== null && isDeadTokenCode(body.code))) {
    return signedOutError(body?.message);
  }
  if (body === null) {
    return {
      code: "provider",
      message: e.message,
      hint: `the gateway returned ${String(e.status ?? "an error")}`,
    };
  }
  if (body.code === GATEWAY_ERRORS.quotaExhausted) {
    return {
      code: body.code,
      message: `${body.message}${body.resetsAt === undefined ? "" : ` It resets ${body.resetsAt}.`}`,
      hint:
        body.hint ??
        "Use your own key or a local model (Settings → Model), subscribe (Settings → Advanced settings → Plan), or wait for the reset.",
    };
  }
  return body.hint === undefined
    ? { code: body.code, message: body.message }
    : { code: body.code, message: body.message, hint: body.hint };
}
