// An account on the generation gateway (rev 6 phase 4, D1): a gateway record of device keys, and
// nothing else — no password, no email in clear, no world id, no content. History never mentions
// it: the world service never learns an account id and the gateway never learns a world id.
//
// Every signed text starts with its own "unmapped-…:v1" line (as in @shared/history/sign), so a
// signature made for one purpose never verifies for another:
//   sign-in            "unmapped-gateway:v1\n" + nonce + "\n" + gatewayKey
//   pairing request    "unmapped-gateway-pair:v1\n" + nonce + "\n" + gatewayKey
//   add / remove key   "unmapped-account:v1\n" + ("add" | "remove") + "\n" + accountId + "\n" + key
// Nonces come from the gateway (`POST /v1/auth/challenge`), are single-use and last five minutes.
//
// Pure: no Node, no DOM. Device keys and account tokens live in main only (Rule 6); a renderer
// sees at most an `AccountView` or "signed in".

import { z } from "zod";
import { AUTHOR_KEY, base32, NONCE, SIGNATURE, sha256Bytes } from "./history/ids";
import { signText, verifyText } from "./history/sign";

/** "a" + base32(128 random bits). */
export const ACCOUNT_ID = /^a[a-z2-7]{26}$/;
/** "ugk_" + base32(256 random bits); stored only as its sha256 by the gateway. */
export const GATEWAY_TOKEN = /^ugk_[a-z2-7]{52}$/;
/** A token's public name (logs, the CLI): "t" + 16 base32 characters of its sha256. */
export const TOKEN_ID = /^t[a-z2-7]{16}$/;
/** Pairing codes: 8 characters without 0/O or 1/I, shown to a person and typed by another. */
export const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const PAIRING_CODE = /^[A-HJ-NP-Z2-9]{8}$/;

export const TOKEN_IDLE_DAYS = 90;
export const PAIRING_TTL_MS = 10 * 60_000;
export const CHALLENGE_TTL_MS = 5 * 60_000;

const SIGN_IN_PREFIX = "unmapped-gateway:v1\n";
const PAIR_PREFIX = "unmapped-gateway-pair:v1\n";
const ACCOUNT_PREFIX = "unmapped-account:v1\n";

export type KeyChange = "add" | "remove";

export function signInText(nonce: string, gatewayKey: string): string {
  return `${SIGN_IN_PREFIX}${nonce}\n${gatewayKey}`;
}

export function pairingText(nonce: string, gatewayKey: string): string {
  return `${PAIR_PREFIX}${nonce}\n${gatewayKey}`;
}

export function keyChangeText(action: KeyChange, accountId: string, key: string): string {
  return `${ACCOUNT_PREFIX}${action}\n${accountId}\n${key}`;
}

export function signSignIn(secretKey: Uint8Array, nonce: string, gatewayKey: string): string {
  return signText(secretKey, signInText(nonce, gatewayKey));
}

export function verifySignIn(key: string, sig: string, nonce: string, gatewayKey: string): boolean {
  return verifyText(key, signInText(nonce, gatewayKey), sig);
}

export function signPairing(secretKey: Uint8Array, nonce: string, gatewayKey: string): string {
  return signText(secretKey, pairingText(nonce, gatewayKey));
}

export function verifyPairing(
  key: string,
  sig: string,
  nonce: string,
  gatewayKey: string,
): boolean {
  return verifyText(key, pairingText(nonce, gatewayKey), sig);
}

export function signKeyChange(
  secretKey: Uint8Array,
  action: KeyChange,
  accountId: string,
  key: string,
): string {
  return signText(secretKey, keyChangeText(action, accountId, key));
}

export function verifyKeyChange(
  by: string,
  sig: string,
  action: KeyChange,
  accountId: string,
  key: string,
): boolean {
  return verifyText(by, keyChangeText(action, accountId, key), sig);
}

/**
 * What both devices show while pairing, so a person can compare them: 16 base32 characters of the
 * key's sha256 in four groups ("ABCD-EFGH-IJKL-MNOP").
 */
export function keyFingerprint(key: string): string {
  const digest = base32(sha256Bytes(key)).slice(0, 16).toUpperCase();
  return digest.match(/.{4}/g)?.join("-") ?? digest;
}

/** A code as a person typed it ("abcd efgh", "ABCD-EFGH") → its canonical spelling, or null. */
export function normalisePairingCode(text: string): string | null {
  const code = text.replace(/[\s-]/g, "").toUpperCase();
  return PAIRING_CODE.test(code) ? code : null;
}

const key = z.string().regex(AUTHOR_KEY);
const sig = z.string().regex(SIGNATURE);
const nonce = z.string().regex(NONCE);

/** `POST /v1/auth/challenge` → */
export const challengeResponseSchema = z.strictObject({
  nonce,
  gatewayKey: key,
  expiresAt: z.string().max(40),
});

/** `POST /v1/auth/token`. `create: false` never makes an account (a pairing device polls with it). */
export const signInRequestSchema = z.strictObject({
  key,
  nonce,
  sig,
  create: z.boolean().optional(),
  label: z.string().trim().min(1).max(60).optional(),
});

export const signInResponseSchema = z.strictObject({
  account: z.string().regex(ACCOUNT_ID),
  token: z.string().regex(GATEWAY_TOKEN),
  tokenId: z.string().regex(TOKEN_ID),
  created: z.boolean(),
  idleDays: z.number().int().positive(),
});

/** `POST /v1/account/pairing`, signed by the new device. */
export const pairingRequestSchema = z.strictObject({ key, nonce, sig });

export const pairingResponseSchema = z.strictObject({
  code: z.string().regex(PAIRING_CODE),
  expiresAt: z.string().max(40),
});

/**
 * `GET /v1/account/pairing/<code>` (a signed-in account only): the key that asked for a pending
 * code, so the approving device types just the code and compares this fingerprint with the one the
 * new device shows. Looking a code up never spends it; approving does.
 */
export const pairingLookupSchema = z.strictObject({
  key,
  fingerprint: z.string().regex(/^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/),
  expiresAt: z.string().max(40),
});

/** `POST /v1/account/keys`: a statement signed by `by`, a key already in the account. */
export const keyChangeRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("add"), key, by: key, sig, code: z.string().max(20) }),
  z.strictObject({ action: z.literal("remove"), key, by: key, sig }),
]);

export interface AccountKey {
  key: string;
  addedAt: string;
  /** The key that signed the `add`; null for the key that created the account. */
  addedBy: string | null;
}

/** `GET /v1/account`. */
export interface AccountView {
  id: string;
  keys: AccountKey[];
  /** The device key this token was issued to; null for a token made by the gateway CLI. */
  device: string | null;
}

export const accountViewSchema = z.strictObject({
  id: z.string().regex(ACCOUNT_ID),
  keys: z
    .array(z.strictObject({ key, addedAt: z.string().max(40), addedBy: key.nullable() }))
    .min(1)
    .max(64),
  device: key.nullable(),
});
