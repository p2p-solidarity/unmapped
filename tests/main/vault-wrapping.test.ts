import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readWrappingRecords,
  upsertWrappingRecord,
  wrappingRecordsSchema,
} from "@main/vault/wrapping";
import type { DataKeyWrappingRecord } from "@shared/identity";
import { describe, expect, it } from "vitest";

const keychain: DataKeyWrappingRecord = {
  formatVersion: 1,
  id: "keychain",
  method: "keychain",
  credentialId: null,
  iv: "AAAAAAAAAAAAAAAA",
  wrappedKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  createdAt: "2026-09-26T00:00:00.000Z",
};

describe("Data Key wrapping record schema", () => {
  it("requires identity-consistent unique records", () => {
    expect(wrappingRecordsSchema.safeParse([keychain]).success).toBe(true);
    expect(
      wrappingRecordsSchema.safeParse([
        { ...keychain, method: "prf", credentialId: "credential-a" },
      ]).success,
    ).toBe(false);
    expect(wrappingRecordsSchema.safeParse([keychain, keychain]).success).toBe(false);
    expect(wrappingRecordsSchema.safeParse([{ ...keychain, iv: "too-short" }]).success).toBe(false);
  });
});

describe("upsertWrappingRecord", () => {
  it("replaces only the record with the same id and keeps every other credential", async () => {
    const userData = await mkdtemp(join(tmpdir(), "aether-vault-"));
    try {
      const passkey: DataKeyWrappingRecord = {
        ...keychain,
        id: "prf:abc",
        method: "prf",
        credentialId: "abc",
      };
      expect((await upsertWrappingRecord(userData, keychain)).ok).toBe(true);
      expect((await upsertWrappingRecord(userData, passkey)).ok).toBe(true);
      const rotated = { ...keychain, iv: "BBBBBBBBBBBBBBBB" };
      expect((await upsertWrappingRecord(userData, rotated)).ok).toBe(true);
      const stored = await readWrappingRecords(userData);
      expect(stored.ok).toBe(true);
      if (!stored.ok) return;
      expect(stored.value.map((record) => record.id).sort()).toEqual(["keychain", "prf:abc"]);
      expect(stored.value.find((record) => record.id === "keychain")?.iv).toBe("BBBBBBBBBBBBBBBB");
      const bad = await upsertWrappingRecord(userData, { ...passkey, id: "keychain" });
      expect(bad.ok).toBe(false);
    } finally {
      await rm(userData, { recursive: true, force: true });
    }
  });
});
