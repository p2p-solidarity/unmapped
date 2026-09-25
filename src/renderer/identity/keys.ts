// Unlock: turn a passkey PRF secret (or the OS keychain fallback) into the AES-GCM save key.
//
// HKDF-SHA256 with a zero salt and info "aether-spire/save" is what separates the raw 32-byte
// secret from the key used for saves, so the same secret can later derive other keys with a
// different info string without reusing key material. Key bytes are never logged or persisted.

import { useSessionStore } from "@renderer/state";
import type { DataKeyWrappingRecord } from "@shared/identity";
import type { SeedApi } from "@shared/ipc";
import { err, ok, type Result } from "@shared/result";
import { seedApi } from "./api";
import { type Bytes, fromBase64 } from "./bytes";
import { generateDataKey, unwrapDataKey, wrapDataKey } from "./dataKey";
import { derivePrf, registerPasskey, storeCredentialId, storedCredentialId } from "./prf";

export interface UnlockedKey {
  method: "prf" | "keychain";
  /** Random Data Key used for every new encryption. */
  key: CryptoKey;
  /** Pre-wrapping credential key, retained only to open existing ASP1 ciphertext. */
  legacyKey: CryptoKey;
  /** base64url id of the passkey that derived the key; null for the keychain fallback. */
  credentialId: string | null;
}

// Keep the original info label: this derived key now wraps the random Data Key, and retaining the
// label also lets the migration path decrypt ASP1 files written before wrapping records existed.
/**
 * Frozen for the life of the format: this string is mixed into every save key, so renaming it
 * makes every existing encrypted save undecryptable. It is not a product name.
 */
export const HKDF_INFO = "aether-spire/save";
export const SECRET_BYTES = 32;
const HKDF_SALT = new Uint8Array(32);

const KEYCHAIN_HINT =
  "Passkey PRF is unavailable here. Use the OS keychain instead — that key never leaves this machine.";

/** HKDF-SHA256(secret) -> the AES-GCM key that wraps a random Data Key. */
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

/** Adds one credential-specific wrapper around the already-unlocked Data Key. */
export async function addPasskeyWrapping(): Promise<Result<string>> {
  const dataKey = current?.key;
  if (dataKey === undefined) {
    return err("data-key-locked", "Unlock saves before adding another passkey.");
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
  const secret = await derivePrf(registered.value.credentialId);
  if (!secret.ok) return secret;
  const wrappingKey = await deriveSaveKey(secret.value);
  if (!wrappingKey.ok) return wrappingKey;
  const api = seedApi();
  if (!api.ok) return api;
  const stored = await api.value.vault.getWrappingRecords();
  if (!stored.ok) return stored;
  const id = `prf:${registered.value.credentialId}`;
  if (stored.value.some((record) => record.id === id)) {
    storeCredentialId(registered.value.credentialId);
    return ok(registered.value.credentialId);
  }
  const record = await wrapDataKey(wrappingKey.value, dataKey, {
    method: "prf",
    credentialId: registered.value.credentialId,
  });
  const saved = await api.value.vault.putWrappingRecord(record);
  if (!saved.ok) return saved;
  storeCredentialId(registered.value.credentialId);
  return ok(registered.value.credentialId);
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

async function keychainWrappingKey(api: SeedApi): Promise<Result<CryptoKey>> {
  const stored = await api.vault.getKey();
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
  return deriveSaveKey(secret);
}

async function addKeychainRecovery(
  api: SeedApi,
  records: DataKeyWrappingRecord[],
  dataKey: CryptoKey,
): Promise<Result<DataKeyWrappingRecord | null>> {
  if (records.some((record) => record.id === "keychain")) return ok(null);
  const wrappingKey = await keychainWrappingKey(api);
  if (!wrappingKey.ok) return wrappingKey;
  return ok(
    await wrapDataKey(wrappingKey.value, dataKey, { method: "keychain", credentialId: null }),
  );
}

function reportRecoveryFailure(error: { message: string }): void {
  useSessionStore
    .getState()
    .toast("danger", `Saves unlocked, but keychain recovery was not added: ${error.message}`);
}

/**
 * A passkey unlock also enrols this machine's OS keychain as a recovery wrapper (plan §七 asks for
 * more than one way back in). That is a deliberate same-machine trade-off, so it is said out loud
 * the moment it happens instead of being silent.
 */
async function enrolKeychainRecovery(
  api: SeedApi,
  records: DataKeyWrappingRecord[],
  dataKey: CryptoKey,
): Promise<void> {
  const recovery = await addKeychainRecovery(api, records, dataKey);
  if (!recovery.ok) return reportRecoveryFailure(recovery.error);
  if (recovery.value === null) return;
  const saved = await api.vault.putWrappingRecord(recovery.value);
  if (!saved.ok) return reportRecoveryFailure(saved.error);
  useSessionStore
    .getState()
    .toast(
      "info",
      "Keychain recovery added: saves on this machine also unlock through the OS keychain.",
    );
}

async function unlockDataKey(
  wrappingKey: CryptoKey,
  identity: Pick<UnlockedKey, "method" | "credentialId">,
): Promise<Result<CryptoKey>> {
  const api = seedApi();
  if (!api.ok) return api;
  const stored = await api.value.vault.getWrappingRecords();
  if (!stored.ok) return stored;
  const id = identity.method === "prf" ? `prf:${identity.credentialId}` : "keychain";
  const record = stored.value.find((item) => item.id === id);
  if (record !== undefined) {
    const dataKey = await unwrapDataKey(wrappingKey, record);
    if (!dataKey.ok || identity.method !== "prf") return dataKey;
    await enrolKeychainRecovery(api.value, stored.value, dataKey.value);
    return dataKey;
  }
  if (stored.value.length > 0) {
    return err(
      "data-key-wrapping-missing",
      "This credential has no wrapping record for the existing Data Key.",
      "Unlock with an already linked credential, then add this passkey.",
    );
  }
  const dataKey = await generateDataKey();
  const wrapped = await wrapDataKey(wrappingKey, dataKey, identity);
  const saved = await api.value.vault.putWrappingRecord(wrapped);
  if (!saved.ok) return saved;
  if (identity.method === "prf") await enrolKeychainRecovery(api.value, [wrapped], dataKey);
  return ok(dataKey);
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
    const wrappingKey = await deriveSaveKey(secret.value.secret);
    if (!wrappingKey.ok) return wrappingKey;
    const identity = { method: "prf" as const, credentialId: secret.value.credentialId };
    const key = await unlockDataKey(wrappingKey.value, identity);
    if (!key.ok) return key;
    storeCredentialId(identity.credentialId);
    return adopt({ ...identity, key: key.value, legacyKey: wrappingKey.value });
  }
  if (secret.error.code === "prf-unsupported") return unlockWithKeychain();
  return secret;
}

/** Electron safeStorage key from main. Same machine only — it does not travel with the passkey. */
export async function unlockWithKeychain(): Promise<Result<UnlockedKey>> {
  const api = seedApi();
  if (!api.ok) return api;
  const wrappingKey = await keychainWrappingKey(api.value);
  if (!wrappingKey.ok) return wrappingKey;
  const identity = { method: "keychain" as const, credentialId: null };
  const key = await unlockDataKey(wrappingKey.value, identity);
  return key.ok ? adopt({ ...identity, key: key.value, legacyKey: wrappingKey.value }) : key;
}
