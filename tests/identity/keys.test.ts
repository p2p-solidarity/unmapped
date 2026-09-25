import { deriveSaveKey, HKDF_INFO, SECRET_BYTES } from "@renderer/identity/keys";
import { describe, expect, it } from "vitest";

function secret(fill: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(SECRET_BYTES).fill(fill);
}

async function rawBytes(key: CryptoKey): Promise<number[]> {
  return Array.from(new Uint8Array(await crypto.subtle.exportKey("raw", key)));
}

describe("deriveSaveKey", () => {
  it("is deterministic: the same secret derives the same key bytes", async () => {
    const a = await deriveSaveKey(secret(7));
    const b = await deriveSaveKey(secret(7));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(await rawBytes(a.value)).toEqual(await rawBytes(b.value));
    expect((await rawBytes(a.value)).length).toBe(32);
  });

  it("separates different secrets", async () => {
    const a = await deriveSaveKey(secret(7));
    const b = await deriveSaveKey(secret(8));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(await rawBytes(a.value)).not.toEqual(await rawBytes(b.value));
  });

  it("derives an AES-GCM-256 key usable for both directions", async () => {
    const derived = await deriveSaveKey(secret(3));
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    expect(derived.value.algorithm.name).toBe("AES-GCM");
    expect(derived.value.usages.sort()).toEqual(["decrypt", "encrypt"]);
  });

  it("rejects a secret of the wrong length", async () => {
    const derived = await deriveSaveKey(new Uint8Array(16));
    expect(derived.ok).toBe(false);
    if (derived.ok) return;
    expect(derived.error.code).toBe("key-bad-length");
  });

  it("pins the HKDF info string", () => {
    expect(HKDF_INFO).toBe("aether-spire/save");
  });
});
