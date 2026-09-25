// Unlock: turn a passkey PRF secret (or the OS keychain fallback) into the AES-GCM save key.
//
// HKDF-SHA256 with a zero salt and info "aether-spire/save" is what separates the raw 32-byte
// secret from the key used for saves, so the same secret can later derive other keys with a
// different info string without reusing key material. Key bytes are never logged or persisted.

import { useSessionStore } from "@renderer/state";
import { err, ok, type Result } from "@shared/result";
import { seedApi } from "./api";
import { type Bytes, fromBase64 } from "./bytes";
import { derivePrf, registerPasskey, storedCredentialId } from "./prf";

export interface UnlockedKey {
  method: "prf" | "keychain";
  key: CryptoKey;
  /** base64url id of the passkey that derived the key; null for the keychain fallback. */
  credentialId: string | null;
}

export const HKDF_INFO = "aether-spire/save";
export const SECRET_BYTES = 32;
const HKDF_SALT = new Uint8Array(32);

const KEYCHAIN_HINT =
  "Passkey PRF is unavailable here. Use the OS keychain instead — that key never leaves this machine.";

/** HKDF-SHA256(secret) -> AES-GCM-256. Deterministic: same secret, same key. */
export async function deriveSaveKey(secret: Bytes): Promise<Result<CryptoKey>> {
  if (secret.length !== SECRET_BYTES) {
    return err(
      "key-bad-length",
      `Expected a ${SECRET_BYTES}-byte secret, received ${secret.length}.`,
      "Re-run the unlock flow; the source of the secret is wrong.",
    );
  }
  const base = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: HKDF_SALT,
      info: new TextEncoder().encode(HKDF_INFO),
    },
    base,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  return ok(key);
}

let current: UnlockedKey | null = null;

/** The key unlocked this session, for modules that need it without prop-drilling (ENS restore). */
export function currentKey(): UnlockedKey | null {
  return current;
}

export function lock(): void {
  current = null;
  useSessionStore.getState().setUnlock(null);
}

function adopt(unlocked: UnlockedKey): Result<UnlockedKey> {
  current = unlocked;
  useSessionStore
    .getState()
    .setUnlock({ method: unlocked.method, credentialId: unlocked.credentialId });
  return ok(unlocked);
}

interface PrfSecret {
  secret: Bytes;
  credentialId: string;
}

async function prfSecret(): Promise<Result<PrfSecret>> {
  const stored = storedCredentialId();
  if (stored !== null) {
    const derived = await derivePrf(stored);
    return derived.ok ? ok({ secret: derived.value, credentialId: stored }) : derived;
  }
  const registered = await registerPasskey();
  if (!registered.ok) return registered;
  if (!registered.value.prfEnabled) {
    return err(
      "prf-unsupported",
      "The new passkey was created without PRF support.",
      KEYCHAIN_HINT,
    );
  }
  const derived = await derivePrf(registered.value.credentialId);
  return derived.ok
    ? ok({ secret: derived.value, credentialId: registered.value.credentialId })
    : derived;
}

/**
 * Passkey first: derive PRF from the stored credential, or register one in this runtime and derive from that.
 * `prf-unsupported` falls back to the OS keychain automatically; `prf-cancelled` does not — the
 * player said no, so they pick the fallback themselves via `unlockWithKeychain()`.
 */
export async function unlock(): Promise<Result<UnlockedKey>> {
  const secret = await prfSecret();
  if (secret.ok) {
    const key = await deriveSaveKey(secret.value.secret);
    if (!key.ok) return key;
    return adopt({ method: "prf", key: key.value, credentialId: secret.value.credentialId });
  }
  if (secret.error.code === "prf-unsupported") return unlockWithKeychain();
  return secret;
}

/** Electron safeStorage key from main. Same machine only — it does not travel with the passkey. */
export async function unlockWithKeychain(): Promise<Result<UnlockedKey>> {
  const api = seedApi();
  if (!api.ok) return api;
  const stored = await api.value.vault.getKey();
  if (!stored.ok) return stored;

  let secret: Bytes;
  try {
    secret = fromBase64(stored.value);
  } catch {
    return err(
      "vault-bad-key",
      "The stored keychain key is not valid base64.",
      "Delete the vault file in userData so a fresh key is generated.",
    );
  }
  const key = await deriveSaveKey(secret);
  if (!key.ok) return key;
  return adopt({ method: "keychain", key: key.value, credentialId: null });
}
