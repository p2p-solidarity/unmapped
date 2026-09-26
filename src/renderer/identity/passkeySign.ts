// The player's passkey as their lineage-market account — no wallet. The app's existing passkey
// (the one the unlock flow enrolled; its credential id is `storedCredentialId()`) is reused; a
// machine without one enrols a fresh passkey. Its P-256 public key was never kept at enrolment, so
// the first use asks the passkey to sign twice and recovers the key from the two signatures
// (`recoverPasskeyKey`); after that each market action is one prompt over the digest main built.
// What is stored locally is only a pointer (credential id + public key), like the credential id
// itself — never a secret, and it can always be recovered again.

import type { MarketKey, WireAuth } from "@shared/market";
import { type PasskeyAssertion, recoverPasskeyKey, toWebAuthnAuth } from "@shared/passkeyAuth";
import { err, ok, type Result } from "@shared/result";
import { fromBase64, randomBytes } from "./bytes";
import { registerPasskey, storedCredentialId } from "./prf";

/** Frozen: renaming it forgets which passkey signs for the market on this device. */
const MARKET_PASSKEY_KEY = "aether.marketPasskey";
const CANCEL_HINT = "Approve the Touch ID, Windows Hello or security-key prompt to continue.";

export interface MarketPasskey {
  credentialId: string;
  key: MarketKey;
  /** Where the passkey signs: this window (security key) or the system browser (Touch ID). */
  via?: "app" | "browser";
}

export function storedMarketPasskey(): MarketPasskey | null {
  try {
    const raw = localStorage.getItem(MARKET_PASSKEY_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as MarketPasskey;
    const hex32 = /^0x[0-9a-f]{64}$/;
    return typeof parsed.credentialId === "string" &&
      hex32.test(parsed.key?.qx ?? "") &&
      hex32.test(parsed.key?.qy ?? "")
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function remember(passkey: MarketPasskey): void {
  try {
    localStorage.setItem(MARKET_PASSKEY_KEY, JSON.stringify(passkey));
  } catch {
    // Storage disabled: the next session recovers the key again (two prompts).
  }
}

function unavailable(): Result<never> | null {
  if (
    typeof navigator === "undefined" ||
    !("credentials" in navigator) ||
    typeof PublicKeyCredential === "undefined" ||
    !window.isSecureContext
  ) {
    return err(
      "passkey-unavailable",
      "Passkeys are not available in this window.",
      "Run the app in development (http://localhost) or a build served from a real origin.",
    );
  }
  return null;
}

/** One WebAuthn assertion by `credentialId` over `challenge`. */
async function assert(
  credentialId: string,
  challenge: Uint8Array,
): Promise<Result<PasskeyAssertion>> {
  const blocked = unavailable();
  if (blocked !== null) return blocked;
  let credential: Credential | null;
  try {
    credential = await navigator.credentials.get({
      publicKey: {
        challenge: challenge.slice(),
        allowCredentials: [{ id: fromBase64(credentialId).slice(), type: "public-key" }],
        userVerification: "required",
      },
    });
  } catch (cause) {
    const name = cause instanceof DOMException ? cause.name : "";
    return err(
      name === "NotAllowedError" ? "passkey-cancelled" : "passkey-failed",
      `The passkey did not sign: ${cause instanceof Error ? cause.message : String(cause)}`,
      CANCEL_HINT,
    );
  }
  if (!(credential instanceof PublicKeyCredential)) {
    return err("passkey-failed", "The authenticator returned no assertion.", CANCEL_HINT);
  }
  const response = credential.response as AuthenticatorAssertionResponse;
  return ok({
    authenticatorData: new Uint8Array(response.authenticatorData),
    clientDataJSON: new Uint8Array(response.clientDataJSON),
    signature: new Uint8Array(response.signature),
  });
}

/**
 * The passkey that signs for the market: the stored one, or the app's passkey (enrolled now if
 * this machine has none) with its public key recovered from two signatures.
 */
export async function marketPasskey(): Promise<Result<MarketPasskey>> {
  const stored = storedMarketPasskey();
  if (stored !== null) return ok(stored);
  let credentialId = storedCredentialId();
  if (credentialId === null) {
    const registered = await registerPasskey();
    if (!registered.ok) return registered;
    credentialId = registered.value.credentialId;
  }
  const first = await assert(credentialId, randomBytes(32));
  if (!first.ok) return first;
  const second = await assert(credentialId, randomBytes(32));
  if (!second.ok) return second;
  const key = await recoverPasskeyKey(first.value, second.value);
  if (!key.ok) return key;
  const passkey: MarketPasskey = { credentialId, key: key.value, via: "app" };
  remember(passkey);
  return ok(passkey);
}

/** The passkey's signature over one market batch's digest, in the form main relays. */
export async function signMarketChallenge(
  passkey: MarketPasskey,
  challengeHex: `0x${string}`,
): Promise<Result<WireAuth>> {
  const challenge = new Uint8Array(
    (challengeHex.slice(2).match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16)),
  );
  const assertion = await assert(passkey.credentialId, challenge);
  if (!assertion.ok) return assertion;
  const auth = toWebAuthnAuth(assertion.value, challenge);
  if (!auth.ok) return auth;
  return ok({
    ...auth.value,
    challengeIndex: Number(auth.value.challengeIndex),
    typeIndex: Number(auth.value.typeIndex),
  });
}
