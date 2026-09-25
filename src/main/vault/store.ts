// The only file in `vault/` that imports electron. Keeps `safeStorage` behind one thin function so
// the encoding rules stay unit-testable in `key.ts`.

import { chmod, readFile, writeFile } from "node:fs/promises";
import { err, fail, ok, type Result, toError } from "@shared/result";
import { safeStorage } from "electron";
import { decodeKey, encodeKey, generateKeyBytes, vaultKeyPath } from "./key";

const FILE_MODE = 0o600;
const UNAVAILABLE_HINT =
  "Unlock your OS keychain (macOS Keychain / gnome-keyring / Windows DPAPI) and restart UNMAPPED, or unlock the world with a passkey instead.";

async function readStoredKey(path: string): Promise<string | null> {
  let blob: Buffer;
  try {
    blob = await readFile(path);
  } catch {
    return null;
  }
  try {
    const decoded = decodeKey(safeStorage.decryptString(blob));
    return decoded === null ? null : encodeKey(decoded);
  } catch {
    return null;
  }
}

/** Returns base64 of the raw 32-byte key, creating and encrypting it on first use. */
export async function getOrCreateKey(userData: string): Promise<Result<string>> {
  if (!safeStorage.isEncryptionAvailable()) {
    return err("vault-unavailable", "OS keychain encryption unavailable", UNAVAILABLE_HINT);
  }
  const path = vaultKeyPath(userData);
  const existing = await readStoredKey(path);
  if (existing !== null) return ok(existing);
  try {
    const base64 = encodeKey(generateKeyBytes());
    await writeFile(path, safeStorage.encryptString(base64), { mode: FILE_MODE });
    await chmod(path, FILE_MODE);
    return ok(base64);
  } catch (error) {
    return fail(toError(error, "vault-write-failed"));
  }
}
