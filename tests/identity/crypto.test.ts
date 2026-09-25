import { decryptBytes, encryptBytes, SEED_HEADER } from "@renderer/identity/crypto";
import { describe, expect, it } from "vitest";

async function localKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]) as Promise<CryptoKey>;
}

const payload = new TextEncoder().encode('Scene name="floor-1"\nFloor width=12\n');

describe("encryptBytes / decryptBytes", () => {
  it("round-trips a payload", async () => {
    const key = await localKey();
    const sealed = await encryptBytes(key, payload);
    expect(new TextDecoder().decode(sealed.subarray(0, 4))).toBe(SEED_HEADER);
    expect(sealed.length).toBe(payload.length + 4 + 12 + 16);

    const opened = await decryptBytes(key, sealed);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(new TextDecoder().decode(opened.value)).toBe(new TextDecoder().decode(payload));
  });

  it("uses a fresh IV for every call", async () => {
    const key = await localKey();
    const a = await encryptBytes(key, payload);
    const b = await encryptBytes(key, payload);
    expect(Array.from(a.subarray(4, 16))).not.toEqual(Array.from(b.subarray(4, 16)));
  });

  it("rejects a wrong header", async () => {
    const key = await localKey();
    const sealed = await encryptBytes(key, payload);
    sealed[0] = 0x42;
    const opened = await decryptBytes(key, sealed);
    expect(opened.ok).toBe(false);
    if (opened.ok) return;
    expect(opened.error.code).toBe("bad-header");
  });

  it("rejects a payload too short to hold a header and IV", async () => {
    const key = await localKey();
    const opened = await decryptBytes(key, new Uint8Array(8));
    expect(opened.ok).toBe(false);
    if (opened.ok) return;
    expect(opened.error.code).toBe("bad-header");
  });

  it("rejects tampered ciphertext", async () => {
    const key = await localKey();
    const sealed = await encryptBytes(key, payload);
    const last = sealed.length - 1;
    sealed[last] = (sealed[last] ?? 0) ^ 0xff;
    const opened = await decryptBytes(key, sealed);
    expect(opened.ok).toBe(false);
    if (opened.ok) return;
    expect(opened.error.code).toBe("decrypt-failed");
  });

  it("rejects the wrong key", async () => {
    const sealed = await encryptBytes(await localKey(), payload);
    const opened = await decryptBytes(await localKey(), sealed);
    expect(opened.ok).toBe(false);
    if (opened.ok) return;
    expect(opened.error.code).toBe("decrypt-failed");
  });

  it("opens legacy ciphertext with the pre-Data-Key credential key", async () => {
    const legacyKey = await localKey();
    const dataKey = await localKey();
    const sealed = await encryptBytes(legacyKey, payload);
    const opened = await decryptBytes(
      { method: "prf", credentialId: "legacy", key: dataKey, legacyKey },
      sealed,
    );
    expect(opened.ok).toBe(true);
    if (opened.ok)
      expect(new TextDecoder().decode(opened.value)).toBe(new TextDecoder().decode(payload));
  });
});
