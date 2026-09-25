import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createWorld,
  importWorldFiles,
  listWorlds,
  readWorldFile,
  removeWorld,
  writeWorldFile,
} from "@main/worlds/store";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInput, testGenesis } from "./fixtures";

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "aether-worlds-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.value;
}

describe("createWorld", () => {
  it("writes the five dotfiles with floor 1 and an empty karma log", async () => {
    const meta = unwrap(await createWorld(dir, createInput("Salt Marsh")));
    expect(meta.floor).toBe(1);
    expect(meta.name).toBe("Salt Marsh");
    expect(meta.archetype).toBe("delve");
    expect(meta.id.startsWith("salt-marsh-")).toBe(true);

    const worldDir = join(dir, meta.id);
    expect(await readFile(join(worldDir, "karma.jsonl"), "utf8")).toBe("");
    expect(JSON.parse(await readFile(join(worldDir, "inventory.json"), "utf8"))).toEqual({
      items: [],
      materials: [],
    });
    expect(JSON.parse(await readFile(join(worldDir, "genesis.json"), "utf8"))).toEqual(testGenesis);
    expect(await readFile(join(worldDir, "world.oui"), "utf8")).toContain("Scene(");
    expect(JSON.parse(await readFile(join(worldDir, "meta.json"), "utf8")).id).toBe(meta.id);
  });

  it("rejects an empty name or an empty scene", async () => {
    const noName = await createWorld(dir, { ...createInput(), name: "   " });
    expect(noName.ok).toBe(false);
    const noScene = await createWorld(dir, { ...createInput(), scene: "" });
    expect(noScene.ok).toBe(false);
  });

  it("rejects a non-empty scene that is not a valid DSL program before creating a folder", async () => {
    const result = await createWorld(dir, { ...createInput(), scene: "not a scene\n" });
    expect(result.ok).toBe(false);
    expect(unwrap(await listWorlds(dir))).toEqual([]);
  });
});

describe("listWorlds", () => {
  it("is an empty ready list before anything exists", async () => {
    expect(unwrap(await listWorlds(dir))).toEqual([]);
    expect(unwrap(await listWorlds(join(dir, "nope")))).toEqual([]);
  });

  it("lists created worlds and skips directories with a corrupt meta.json", async () => {
    const a = unwrap(
      await createWorld(dir, createInput("Alpha"), new Date("2026-01-01T00:00:00Z")),
    );
    const b = unwrap(await createWorld(dir, createInput("Beta"), new Date("2026-02-01T00:00:00Z")));
    await writeFile(join(dir, a.id, "meta.json"), "{ not json");
    const listed = unwrap(await listWorlds(dir));
    expect(listed.map((meta) => meta.id)).toEqual([b.id]);
  });
});

describe("readWorldFile / writeWorldFile", () => {
  it("round-trips a file and bumps meta.updatedAt", async () => {
    const meta = unwrap(await createWorld(dir, createInput(), new Date("2026-01-01T00:00:00Z")));
    const later = new Date("2026-03-04T05:06:07Z");
    const updated = unwrap(
      await writeWorldFile(
        dir,
        meta.id,
        "world.oui",
        'root = Scene("Second Floor", "abyss", [ground])\nground = Floor(8, 8, "stone")\n',
        later,
      ),
    );
    expect(updated.updatedAt).toBe(later.toISOString());
    expect(updated.createdAt).toBe(meta.createdAt);
    expect(unwrap(await readWorldFile(dir, meta.id, "world.oui"))).toContain("Second Floor");
  });

  it("accepts a valid karma.jsonl and rejects a bad line", async () => {
    const meta = unwrap(await createWorld(dir, createInput()));
    const good = `${JSON.stringify({
      at: "2026-01-01T00:00:00.000Z",
      floor: 1,
      npcId: null,
      choice: "opened the gate",
      action: "open_exit",
      effect: "the gate groans open",
    })}\n`;
    expect((await writeWorldFile(dir, meta.id, "karma.jsonl", good)).ok).toBe(true);

    const bad = await writeWorldFile(dir, meta.id, "karma.jsonl", `${good}{"at":1}\n`);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("world-file-invalid");
    expect(unwrap(await readWorldFile(dir, meta.id, "karma.jsonl"))).toBe(good);
  });

  it("rejects a malformed inventory.json, an empty world.oui and unknown files", async () => {
    const meta = unwrap(await createWorld(dir, createInput()));
    const badInventory = await writeWorldFile(dir, meta.id, "inventory.json", '{"items":"nope"}');
    expect(badInventory.ok).toBe(false);

    const emptyScene = await writeWorldFile(dir, meta.id, "world.oui", "   \n");
    expect(emptyScene.ok).toBe(false);

    const unknown = await writeWorldFile(dir, meta.id, "notes.txt", "hello");
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe("world-file-unknown");
  });

  it("rejects a non-empty world.oui that the DSL cannot parse", async () => {
    const meta = unwrap(await createWorld(dir, createInput()));
    const result = await writeWorldFile(dir, meta.id, "world.oui", "not a scene\n");
    expect(result.ok).toBe(false);
    expect(unwrap(await readWorldFile(dir, meta.id, "world.oui"))).toContain("Test Floor");
  });

  it("refuses ids that would escape the worlds dir or do not exist", async () => {
    const traversal = await readWorldFile(dir, "../../etc", "meta.json");
    expect(traversal.ok).toBe(false);
    if (!traversal.ok) expect(traversal.error.code).toBe("world-id-invalid");

    const missing = await writeWorldFile(dir, "ghost-1", "world.oui", "Scene()\n");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe("world-missing");
  });
});

describe("importWorldFiles", () => {
  it("validates every dotfile before creating the imported world", async () => {
    const source = unwrap(await createWorld(dir, createInput("Source")));
    const scene = unwrap(await readWorldFile(dir, source.id, "world.oui"));
    const genesis = unwrap(await readWorldFile(dir, source.id, "genesis.json"));
    const inventory = '{"items":"not-an-array"}';
    const karma = unwrap(await readWorldFile(dir, source.id, "karma.jsonl"));
    const meta = unwrap(await readWorldFile(dir, source.id, "meta.json"));

    const imported = await importWorldFiles(dir, {
      "world.oui": scene,
      "genesis.json": genesis,
      "karma.jsonl": karma,
      "inventory.json": inventory,
      "meta.json": meta,
    });
    expect(imported.ok).toBe(false);
    expect(unwrap(await listWorlds(dir))).toHaveLength(1);
  });
});

describe("removeWorld", () => {
  it("deletes the directory and errors for a world that is gone", async () => {
    const meta = unwrap(await createWorld(dir, createInput()));
    expect((await removeWorld(dir, meta.id)).ok).toBe(true);
    expect(unwrap(await listWorlds(dir))).toEqual([]);

    const again = await removeWorld(dir, meta.id);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("world-missing");
  });
});
