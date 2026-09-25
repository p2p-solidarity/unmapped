// Pure key helpers — no electron, so vitest can cover the encoding rules. The key itself is the
// keychain *fallback* for saves: the primary path is the passkey PRF in `src/renderer/identity`.

import { randomBytes } from "node:crypto";
import { join } from "node:path";

export const VAULT_KEY_BYTES = 32;
export const VAULT_KEY_FILE = "vault.key";

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export function vaultKeyPath(userData: string): string {
  return join(userData, VAULT_KEY_FILE);
}

export function generateKeyBytes(): Uint8Array {
  return new Uint8Array(randomBytes(VAULT_KEY_BYTES));
}

export function encodeKey(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** Strict: rejects anything that is not exactly 32 bytes of well-formed base64. */
export function decodeKey(value: string): Uint8Array | null {
  const trimmed = value.trim();
  if (!BASE64.test(trimmed)) return null;
  const bytes = new Uint8Array(Buffer.from(trimmed, "base64"));
  return isValidKey(bytes) ? bytes : null;
}

export function isValidKey(bytes: Uint8Array): boolean {
  return bytes.length === VAULT_KEY_BYTES;
}
