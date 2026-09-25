// AES-GCM container for anything the player owns off-disk (encrypted seeds).
//
// Layout: "ASP1" (4 bytes) | random IV (12 bytes) | AES-GCM ciphertext+tag.
// Pure: no window, no IPC, no stores — so vitest exercises exactly the code the app runs.

import { err, ok, type Result } from "@shared/result";
import type { Bytes } from "./bytes";
import type { UnlockedKey } from "./keys";

/** Either the session's unlocked key or a bare AES-GCM CryptoKey (tests, re-encryption). */
export type KeyLike = CryptoKey | UnlockedKey;

export const SEED_HEADER = "ASP1";
const HEADER = Uint8Array.from([0x41, 0x53, 0x50, 0x31]);
const IV_BYTES = 12;
export const SEED_PREFIX_BYTES = HEADER.length + IV_BYTES;

const HEADER_HINT = "That file is not an Unwritten Land encrypted seed (.seed.enc).";
const DECRYPT_HINT =
  "Wrong key or a damaged file. Unlock with the same passkey (or the same machine keychain) that produced it.";

function cryptoKey(key: KeyLike): CryptoKey {
  return "key" in key ? key.key : key;
}

function decryptionKeys(key: KeyLike): CryptoKey[] {
  return "key" in key ? [key.key, key.legacyKey] : [key];
}

export async function encryptBytes(key: KeyLike, bytes: Bytes): Promise<Bytes> {
  const iv = new Uint8Array(IV_BYTES);
  crypto.getRandomValues(iv);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey(key), bytes),
  );
  const out = new Uint8Array(SEED_PREFIX_BYTES + cipher.length);
  out.set(HEADER, 0);
  out.set(iv, HEADER.length);
  out.set(cipher, SEED_PREFIX_BYTES);
  return out;
}

export async function decryptBytes(key: KeyLike, bytes: Bytes): Promise<Result<Bytes>> {
  if (bytes.length <= SEED_PREFIX_BYTES) {
    return err("bad-header", `Payload is only ${bytes.length} bytes long.`, HEADER_HINT);
  }
  for (let i = 0; i < HEADER.length; i += 1) {
    if (bytes[i] !== HEADER[i]) {
      return err("bad-header", `Expected the ${SEED_HEADER} header.`, HEADER_HINT);
    }
  }
  const iv = bytes.subarray(HEADER.length, SEED_PREFIX_BYTES);
  const cipher = bytes.subarray(SEED_PREFIX_BYTES);
  for (const candidate of decryptionKeys(key)) {
    try {
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, candidate, cipher);
      return ok(new Uint8Array(plain));
    } catch {
      // A pre-Data-Key ASP1 payload uses the credential-derived legacy key; try it next.
    }
  }
  return err("decrypt-failed", "AES-GCM authentication failed.", DECRYPT_HINT);
}
