import { generateDataKey, unwrapDataKey, wrapDataKey } from "@renderer/identity/dataKey";
import { deriveSaveKey } from "@renderer/identity/keys";
import { describe, expect, it } from "vitest";

async function raw(key: CryptoKey): Promise<number[]> {
  return Array.from(new Uint8Array(await crypto.subtle.exportKey("raw", key)));
}

describe("random Data Key wrapping", () => {
  it("round-trips one Data Key through a credential-specific wrapping record", async () => {
    const wrapping = await deriveSaveKey(new Uint8Array(32).fill(7));
    if (!wrapping.ok) throw new Error(wrapping.error.code);
    const dataKey = await generateDataKey();
    const record = await wrapDataKey(
      wrapping.value,
      dataKey,
      { method: "prf", credentialId: "credential-a" },
      new Date("2026-09-26T00:00:00.000Z"),
    );

    expect(record.id).toBe("prf:credential-a");
    const unwrapped = await unwrapDataKey(wrapping.value, record);
    expect(unwrapped.ok).toBe(true);
    if (unwrapped.ok) expect(await raw(unwrapped.value)).toEqual(await raw(dataKey));
  });

  it("generates independent Data Keys and rejects the wrong wrapping key", async () => {
    const first = await generateDataKey();
    const second = await generateDataKey();
    expect(await raw(first)).not.toEqual(await raw(second));

    const correct = await deriveSaveKey(new Uint8Array(32).fill(3));
    const wrong = await deriveSaveKey(new Uint8Array(32).fill(4));
    if (!correct.ok || !wrong.ok) throw new Error("wrapping key derivation failed");
    const record = await wrapDataKey(correct.value, first, {
      method: "keychain",
      credentialId: null,
    });
    const result = await unwrapDataKey(wrong.value, record);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("data-key-unwrap-failed");
  });
});
