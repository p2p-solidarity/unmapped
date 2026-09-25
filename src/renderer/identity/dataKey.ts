import type { DataKeyWrappingRecord } from "@shared/identity";
import { err, ok, type Result } from "@shared/result";
import { type Bytes, fromBase64, randomBytes, toBase64 } from "./bytes";

const DATA_KEY_BYTES = 32;
const WRAP_IV_BYTES = 12;

export async function generateDataKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", randomBytes(DATA_KEY_BYTES), { name: "AES-GCM" }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function wrapDataKey(
  wrappingKey: CryptoKey,
  dataKey: CryptoKey,
  identity: { method: DataKeyWrappingRecord["method"]; credentialId: string | null },
  now: Date = new Date(),
): Promise<DataKeyWrappingRecord> {
  const iv = randomBytes(WRAP_IV_BYTES);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", dataKey)) as Bytes;
  const wrapped = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrappingKey, raw),
  );
  return {
    formatVersion: 1,
    id: identity.method === "prf" ? `prf:${identity.credentialId}` : "keychain",
    method: identity.method,
    credentialId: identity.credentialId,
    iv: toBase64(iv),
    wrappedKey: toBase64(wrapped),
    createdAt: now.toISOString(),
  };
}

export async function unwrapDataKey(
  wrappingKey: CryptoKey,
  record: DataKeyWrappingRecord,
): Promise<Result<CryptoKey>> {
  try {
    const raw = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(record.iv) },
      wrappingKey,
      fromBase64(record.wrappedKey),
    );
    if (raw.byteLength !== DATA_KEY_BYTES)
      return err("data-key-invalid", "Wrapped Data Key has the wrong length.");
    return ok(
      await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]),
    );
  } catch {
    return err(
      "data-key-unwrap-failed",
      "This passkey or keychain secret cannot unwrap the saved Data Key.",
      "Use a credential that was added while the saves were unlocked.",
    );
  }
}
