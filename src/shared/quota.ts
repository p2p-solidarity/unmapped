// The gateway's metered surface as the app reads it (rev 6 phase 4, D2): headers, the quota, the
// status, the model list and the error codes main maps. Credits come from the operator's dated cost
// records, so the app shows them only as a share of the allowance plus tokens and calls — never as
// money. The period is the calendar month in UTC.
//
// Pure: no Node, no DOM. Every schema here is for a response main receives from the network.

import { z } from "zod";
import { type LicenceRecord, licenceRecordSchema } from "./licence";
import { USAGE_PURPOSES } from "./usage";

/** The chat (or image) id: execution is de-duplicated by (account, request id) for 24 h. */
export const REQUEST_ID_HEADER = "x-request-id";
/** A `UsagePurpose`. No world scope is ever sent: the gateway never learns a world. */
export const PURPOSE_HEADER = "x-unmapped-purpose";
export const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
export const QUOTA_PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

/** How long a request id stays spent. */
export const REQUEST_DEDUP_MS = 24 * 3_600_000;

/** Error codes the gateway answers with (main maps them in `mapProviderError`). */
export const GATEWAY_ERRORS = {
  /** 402, with `resetsAt`. */
  quotaExhausted: "quota-exhausted",
  /** 401: main clears the saved token and shows "signed out". */
  tokenInvalid: "account-token-invalid",
  tokenRevoked: "account-token-revoked",
  tokenExpired: "account-token-expired",
  /** 404. */
  modelUnavailable: "gateway-model-unavailable",
  modelUnpriced: "gateway-model-unpriced",
  /** 409. */
  requestInFlight: "request-in-flight",
  requestSettled: "request-settled",
  /** 429. */
  busy: "gateway-busy",
} as const;

/** "YYYY-MM" of a UTC instant. */
export function quotaPeriod(ms: number): string {
  return new Date(ms).toISOString().slice(0, 7);
}

/** The first instant of the month after `period`, as an ISO time. */
export function periodResetsAt(period: string): string {
  const [year = 0, month = 1] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString();
}

/** `GET /v1/quota`, in credits. `plan` is the provider price id of the active subscription. */
export interface QuotaStatus {
  period: string;
  granted: number;
  used: number;
  reserved: number;
  resetsAt: string;
  plan: string | null;
}

const credits = z.number().int().nonnegative();

export const quotaStatusSchema = z.strictObject({
  period: z.string().regex(QUOTA_PERIOD),
  granted: credits,
  used: credits,
  reserved: credits,
  resetsAt: z.string().max(40),
  plan: z.string().max(200).nullable(),
});

/** `GET /v1/status`: whether the gateway sells (then every served model is commercial). */
export interface GatewayStatus {
  commercial: boolean;
  billing: { provider: string; mode: "test" | "live" } | null;
}

export const gatewayStatusSchema = z.strictObject({
  commercial: z.boolean(),
  billing: z
    .strictObject({ provider: z.string().min(1).max(40), mode: z.enum(["test", "live"]) })
    .nullable(),
});

export type GatewayModelKind = "chat" | "image";

/** One entry of `GET /v1/models`: OpenAI's shape plus its kind, default flag and licence. */
export interface GatewayModel {
  id: string;
  object: "model";
  owned_by: string;
  kind: GatewayModelKind;
  /** The model the gateway uses for this kind when the asked one is not listed. */
  default: boolean;
  licence: LicenceRecord;
}

export const gatewayModelListSchema = z.strictObject({
  object: z.literal("list"),
  data: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(200),
        object: z.literal("model"),
        owned_by: z.string().max(80),
        kind: z.enum(["chat", "image"]),
        default: z.boolean(),
        licence: licenceRecordSchema,
      }),
    )
    .max(200),
});

/** The body of every gateway error: `{ error: GatewayError }`. */
export const gatewayErrorSchema = z.object({
  error: z.object({
    code: z.string().max(80),
    message: z.string().max(2000),
    hint: z.string().max(2000).optional(),
    resetsAt: z.string().max(40).optional(),
  }),
});

export const purposeSchema = z.enum(USAGE_PURPOSES);
