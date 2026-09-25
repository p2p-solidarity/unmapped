import {
  decodeKey,
  encodeKey,
  generateKeyBytes,
  isValidKey,
  VAULT_KEY_BYTES,
  vaultKeyPath,
} from "@main/vault/key";
import { describe, expect, it } from "vitest";

describe("vault key helpers", () => {
  it("generates 32 fresh bytes", () => {
    const a = generateKeyBytes();
    const b = generateKeyBytes();
    expect(a.length).toBe(VAULT_KEY_BYTES);
    expect(isValidKey(a)).toBe(true);
    expect(encodeKey(a)).not.toBe(encodeKey(b));
  });

  it("round-trips through base64", () => {
    const bytes = generateKeyBytes();
    const decoded = decodeKey(encodeKey(bytes));
    expect(decoded).not.toBeNull();
    expect(Array.from(decoded ?? [])).toEqual(Array.from(bytes));
  });

  it("rejects malformed or wrong-length keys", () => {
    expect(decodeKey("not base64!!")).toBeNull();
    expect(decodeKey("")).toBeNull();
    expect(decodeKey(encodeKey(new Uint8Array(16)))).toBeNull();
    expect(isValidKey(new Uint8Array(31))).toBe(false);
  });

  it("stores the key inside userData", () => {
    expect(vaultKeyPath("/tmp/userdata")).toBe("/tmp/userdata/vault.key");
  });
});
