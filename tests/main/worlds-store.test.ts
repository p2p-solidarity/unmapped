import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorld, listWorlds, readWorldFile, writeWorldFile } from "@main/worlds/store";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInput } from "./fixtures";

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
  it("rejects a non-empty scene that is not a valid DSL program before creating a folder", async () => {
    const result = await createWorld(dir, { ...createInput(), scene: "not a scene\n" });
    expect(result.ok).toBe(false);
    expect(unwrap(await listWorlds(dir))).toEqual([]);
  });
});

describe("listWorlds", () => {
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
