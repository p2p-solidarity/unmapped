// WebAuthn PRF. The passkey turns a fixed salt into a deterministic 32-byte secret for the
// credential selected in this runtime. A synced passkey can be reused only when this app can
// discover and assert that credential. Real calls only — there is no simulated PRF path here.
//
// Where this works: WebAuthn needs a secure context with a real origin. In dev the renderer is
// served over http://localhost, which counts as trustworthy, so registration and assertion both
// work. A packaged build loads the renderer from file://, where no rp id can be derived and the
// call fails (SecurityError / NotSupportedError) — that is precisely what the keychain fallback in
// keys.ts covers. Never log the PRF output.

import { type AppError, err, fail, ok, type Result } from "@shared/result";
import { type Bytes, fromBase64, randomBytes, toBase64Url, toBytes } from "./bytes";

/** Frozen: renaming the key loses the pointer to the passkey this device already enrolled. */
export const CREDENTIAL_STORAGE_KEY = "aether.credentialId";
/** The PRF salt is SHA-256 of this string; changing it changes every derived key. */
/** Frozen: the PRF evaluation point. Renaming it orphans every passkey-wrapped Data Key. */
export const PRF_SALT_SOURCE = "aether-spire/v1";
export const PRF_SECRET_BYTES = 32;

const RP_NAME = "UNMAPPED";
/** Frozen: part of the credential identity; a different value enrols a different passkey. */
const USER_NAME = "aether-spire-player";
const ES256 = -7;
const RS256 = -257;

const KEYCHAIN_HINT =
  "Passkey PRF is unavailable here. Use the OS keychain instead — that key never leaves this machine.";
const CANCEL_HINT = "Retry and approve the Touch ID, Windows Hello or security-key prompt.";

export interface PasskeyRegistration {
  credentialId: string;
  /** The authenticator reported that it can evaluate PRF for this credential. */
  prfEnabled: boolean;
}

function unsupported(message: string): Result<never> {
  return err("prf-unsupported", message, KEYCHAIN_HINT);
}

/** Honest capability probe — returns the blocking error, or null when PRF may be attempted. */
export function prfAvailability(): AppError | null {
  if (typeof navigator === "undefined" || !("credentials" in navigator)) {
    return {
      code: "prf-unsupported",
      message: "navigator.credentials is not available in this runtime.",
      hint: KEYCHAIN_HINT,
    };
  }
  if (typeof PublicKeyCredential === "undefined") {
    return {
      code: "prf-unsupported",
      message: "PublicKeyCredential is not available in this runtime.",
      hint: KEYCHAIN_HINT,
    };
  }
  if (typeof window === "undefined" || !window.isSecureContext) {
    return {
      code: "prf-unsupported",
      message: "WebAuthn needs a secure context; this window is not one.",
      hint: KEYCHAIN_HINT,
    };
  }
  return null;
}

function mapWebAuthnError(cause: unknown, action: string): Result<never> {
  const name = cause instanceof DOMException ? cause.name : "";
  const message = cause instanceof Error ? cause.message : String(cause);
  if (name === "NotAllowedError") {
    return err("prf-cancelled", `Passkey ${action} was cancelled or timed out.`, CANCEL_HINT);
  }
  if (name === "NotSupportedError" || name === "SecurityError") {
    return unsupported(`Passkey ${action} is not supported on this origin: ${message}`);
  }
  return err("prf-failed", `Passkey ${action} failed: ${message}`, CANCEL_HINT);
}

let saltPromise: Promise<Bytes> | null = null;

/** SHA-256("aether-spire/v1") — the single PRF evaluation point for save keys. */
export function prfSalt(): Promise<Bytes> {
  if (saltPromise === null) {
    saltPromise = crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(PRF_SALT_SOURCE))
      .then((digest) => new Uint8Array(digest));
  }
  return saltPromise;
}

/** Local convenience only: which passkey to ask for. Losing it means a fresh registration. */
export function storedCredentialId(): string | null {
  try {
    return localStorage.getItem(CREDENTIAL_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeCredentialId(credentialId: string): void {
  try {
    localStorage.setItem(CREDENTIAL_STORAGE_KEY, credentialId);
  } catch {
    // Storage disabled: the next unlock simply registers a fresh passkey.
  }
}

export function clearCredentialId(): void {
  try {
    localStorage.removeItem(CREDENTIAL_STORAGE_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

export async function registerPasskey(): Promise<Result<PasskeyRegistration>> {
  const blocked = prfAvailability();
  if (blocked !== null) return fail(blocked);

  let credential: Credential | null;
  try {
    credential = await navigator.credentials.create({
      publicKey: {
        rp: { name: RP_NAME, id: location.hostname || undefined },
        // There is no server to issue a challenge: the PRF output never leaves this machine, so a
        // fresh random challenge is used purely so no two ceremonies look alike.
        challenge: randomBytes(32),
        user: { id: randomBytes(16), name: USER_NAME, displayName: USER_NAME },
        pubKeyCredParams: [
          { type: "public-key", alg: ES256 },
          { type: "public-key", alg: RS256 },
        ],
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
        extensions: { prf: {} },
      },
    });
  } catch (cause) {
    return mapWebAuthnError(cause, "registration");
  }

  if (!(credential instanceof PublicKeyCredential)) {
    return err("prf-failed", "The authenticator returned no passkey.", CANCEL_HINT);
  }
  const credentialId = toBase64Url(new Uint8Array(credential.rawId));
  const extensions = credential.getClientExtensionResults();
  const prfEnabled = extensions.prf?.enabled === true;
  return ok({ credentialId, prfEnabled });
}

/** Evaluates PRF for `credentialId` and returns the raw 32-byte secret (never persisted). */
export async function derivePrf(credentialId: string): Promise<Result<Bytes>> {
  const blocked = prfAvailability();
  if (blocked !== null) return fail(blocked);

  let rawId: Bytes;
  try {
    rawId = fromBase64(credentialId);
  } catch {
    return err(
      "prf-failed",
      "The stored credential id is not valid base64url.",
      "Register the passkey again to replace it.",
    );
  }

  const salt = await prfSalt();
  let assertion: Credential | null;
  try {
    assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: [{ id: rawId, type: "public-key" }],
        userVerification: "required",
        extensions: { prf: { eval: { first: salt } } },
      },
    });
  } catch (cause) {
    return mapWebAuthnError(cause, "assertion");
  }

  if (!(assertion instanceof PublicKeyCredential)) {
    return err("prf-failed", "The authenticator returned no assertion.", CANCEL_HINT);
  }
  const extensions = assertion.getClientExtensionResults();
  if (extensions.prf?.enabled === false) {
    return unsupported("This authenticator reports that the PRF extension is disabled.");
  }
  const first = extensions.prf?.results?.first;
  if (first === undefined) {
    return unsupported("This authenticator returned no PRF output for that passkey.");
  }
  const secret = toBytes(first);
  if (secret.length !== PRF_SECRET_BYTES) {
    return err(
      "prf-failed",
      `Expected ${PRF_SECRET_BYTES} PRF bytes, received ${secret.length}.`,
      CANCEL_HINT,
    );
  }
  return ok(secret);
}
