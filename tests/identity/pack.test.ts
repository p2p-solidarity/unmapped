import { encryptBytes } from "@renderer/identity/crypto";
import {
  importEncryptedSeedBytes,
  packFiles,
  unpackFiles,
  type WorldFiles,
} from "@renderer/identity/seedSync";
import type { SeedApi } from "@shared/ipc";
import { ok } from "@shared/result";
import { WORLD_FILES, type WorldMeta } from "@shared/world";
import { strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

const files: WorldFiles = {
  [WORLD_FILES.scene]:
    'root = Scene("floor-1", "meadow", [ground])\nground = Floor(8, 8, "grass")\n',
  [WORLD_FILES.genesis]: JSON.stringify({
    archetype: "farm",
    physics: "gentle",
    language: "en-US",
    seed: 1,
    intent: "",
    createdAt: "2026-01-01T00:00:00.000Z",
  }),
  [WORLD_FILES.karma]: "",
  [WORLD_FILES.inventory]: JSON.stringify({ items: [], materials: [] }),
  [WORLD_FILES.meta]: JSON.stringify({
    id: "w1",
    name: "Test",
    archetype: "farm",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    floor: 3,
    mutation: null,
  }),
};

describe("packFiles / unpackFiles", () => {
  it("round-trips every world dotfile", () => {
    const unpacked = unpackFiles(packFiles(files));
    expect(unpacked.ok).toBe(true);
    if (!unpacked.ok) return;
    expect(unpacked.value).toEqual(files);
  });

  it("keeps meta.json at the zip root, matching main's seeds/pack layout", () => {
    const entries = Object.keys(unzipSync(packFiles(files))).sort();
    expect(entries).toEqual([
      "genesis.json",
      "inventory.json",
      "karma.jsonl",
      "meta.json",
      "world.oui",
    ]);
  });

  it("reports which dotfiles a seed is missing", () => {
    const partial = zipSync({ "meta.json": strToU8(files[WORLD_FILES.meta]) });
    const unpacked = unpackFiles(partial);
    expect(unpacked.ok).toBe(false);
    if (unpacked.ok) return;
    expect(unpacked.error.code).toBe("seed-incomplete");
    expect(unpacked.error.message).toContain("world.oui");
  });

  it("reports a payload that is not a zip", () => {
    const unpacked = unpackFiles(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(unpacked.ok).toBe(false);
    if (unpacked.ok) return;
    expect(unpacked.error.code).toBe("seed-corrupt");
  });

  it("rejects invalid encrypted files before creating a partial world", async () => {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
    let creates = 0;
    const api = {
      worlds: {
        list: async () => ok([]),
        create: async (_input: unknown) => {
          creates += 1;
          return ok({} as WorldMeta);
        },
        read: async () => ok(""),
        write: async () => ok({} as WorldMeta),
        remove: async () => ok(undefined),
        exportSeed: async () => ok({ path: "", bytes: 0 }),
        importSeed: async () => ok({} as WorldMeta),
        migrate: async () => ok({} as never),
        onChanged: () => () => undefined,
      },
      cartridges: {} as SeedApi["cartridges"],
      game: {} as SeedApi["game"],
      instances: {} as SeedApi["instances"],
      profiles: {} as SeedApi["profiles"],
      workspaces: {} as SeedApi["workspaces"],
      inference: {} as SeedApi["inference"],
      vault: {} as SeedApi["vault"],
      mods: {} as SeedApi["mods"],
      works: {} as SeedApi["works"],
      chain: {} as SeedApi["chain"],
      app: {} as SeedApi["app"],
      createDrafts: {} as SeedApi["createDrafts"],
    } as SeedApi;
    const previous = globalThis.window;
    Object.defineProperty(globalThis, "window", { configurable: true, value: { seed: api } });
    try {
      const sealed = await encryptBytes(key, packFiles({ ...files, "inventory.json": "bad" }));
      const result = await importEncryptedSeedBytes(sealed, key);
      expect(result.ok).toBe(false);
      expect(creates).toBe(0);
    } finally {
      if (previous === undefined) delete (globalThis as { window?: Window }).window;
      else Object.defineProperty(globalThis, "window", { configurable: true, value: previous });
    }
  });

  it("rolls back a newly created world when restoring a later dotfile fails", async () => {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
    let removes = 0;
    const created: WorldMeta = {
      id: "restored-1",
      name: "Restored",
      archetype: "farm",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      floor: 1,
      mutation: null,
      flags: {},
      mods: [],
    };
    const api = {
      worlds: {
        list: async () => ok([]),
        create: async (_input: unknown) => ok(created),
        read: async () => ok(""),
        write: async () => ({
          ok: false as const,
          error: { code: "write-failed", message: "nope" },
        }),
        remove: async () => {
          removes += 1;
          return ok(undefined);
        },
        exportSeed: async () => ok({ path: "", bytes: 0 }),
        importSeed: async () => ok(created),
        migrate: async () => ok({} as never),
        onChanged: () => () => undefined,
      },
      cartridges: {} as SeedApi["cartridges"],
      game: {} as SeedApi["game"],
      instances: {} as SeedApi["instances"],
      profiles: {} as SeedApi["profiles"],
      workspaces: {} as SeedApi["workspaces"],
      inference: {} as SeedApi["inference"],
      vault: {} as SeedApi["vault"],
      mods: {} as SeedApi["mods"],
      works: {} as SeedApi["works"],
      chain: {} as SeedApi["chain"],
      app: {} as SeedApi["app"],
      createDrafts: {} as SeedApi["createDrafts"],
    } as SeedApi;
    const previous = globalThis.window;
    Object.defineProperty(globalThis, "window", { configurable: true, value: { seed: api } });
    try {
      const sealed = await encryptBytes(key, packFiles(files));
      const result = await importEncryptedSeedBytes(sealed, key);
      expect(result.ok).toBe(false);
      expect(removes).toBe(1);
    } finally {
      if (previous === undefined) delete (globalThis as { window?: Window }).window;
      else Object.defineProperty(globalThis, "window", { configurable: true, value: previous });
    }
  });
});
