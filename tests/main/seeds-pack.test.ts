import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packWorld, unpackSeed } from "@main/seeds/pack";
import { createWorld, importWorldFiles, listWorlds, readWorldFile } from "@main/worlds/store";
import { strToU8, unzipSync, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInput } from "./fixtures";

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "aether-seeds-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.value;
}

describe("packWorld / unpackSeed", () => {
  it("round-trips a world through a .seed with meta.json at the zip root", async () => {
    const meta = unwrap(await createWorld(dir, createInput("Round Trip")));
    const bytes = unwrap(await packWorld(join(dir, meta.id)));
    expect(Object.keys(unzipSync(bytes)).sort()).toEqual([
      "genesis.json",
      "inventory.json",
      "karma.jsonl",
      "meta.json",
      "world.oui",
    ]);

    const { files } = unwrap(unpackSeed(bytes));
    expect(JSON.parse(files["meta.json"]).name).toBe("Round Trip");
    expect(files["world.oui"]).toContain("Scene(");
    expect(files["karma.jsonl"]).toBe("");
  });

  it("imports an unpacked seed as a new world with a fresh id", async () => {
    const meta = unwrap(await createWorld(dir, createInput("Traveller")));
    const bytes = unwrap(await packWorld(join(dir, meta.id)));
    const { files } = unwrap(unpackSeed(bytes));
    const imported = unwrap(
      await importWorldFiles(dir, files, new Date("2027-05-05T05:05:05.000Z")),
    );
    expect(imported.id).not.toBe(meta.id);
    expect(imported.name).toBe("Traveller");
    expect(imported.floor).toBe(meta.floor);
    expect(imported.updatedAt).toBe("2027-05-05T05:05:05.000Z");
    expect(JSON.parse(unwrap(await readWorldFile(dir, imported.id, "meta.json"))).id).toBe(
      imported.id,
    );
    expect(unwrap(await listWorlds(dir))).toHaveLength(2);
  });

  it("errors when the world directory is missing a dotfile", async () => {
    const result = await packWorld(join(dir, "does-not-exist"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("seed-incomplete");
  });
});

describe("unpackSeed rejection", () => {
  async function validEntries(): Promise<Record<string, Uint8Array>> {
    const meta = unwrap(await createWorld(dir, createInput("Guarded")));
    const bytes = unwrap(await packWorld(join(dir, meta.id)));
    return unzipSync(bytes);
  }

  it("rejects a zip carrying an extra file", async () => {
    const entries = await validEntries();
    entries["payload.sh"] = strToU8("rm -rf /");
    const result = unpackSeed(zipSync(entries));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("seed-unknown-file");
      expect(result.error.message).toContain("payload.sh");
    }
  });

  it("rejects a zip missing meta.json", async () => {
    const entries = await validEntries();
    delete entries["meta.json"];
    const result = unpackSeed(zipSync(entries));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("seed-incomplete");
  });

  it("rejects a zip whose meta.json has the wrong shape", async () => {
    const entries = await validEntries();
    entries["meta.json"] = strToU8(JSON.stringify({ id: "x", name: "y" }));
    const result = unpackSeed(zipSync(entries));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("world-file-invalid");
  });

  it("rejects a zip with malformed karma or inventory before import", async () => {
    const entries = await validEntries();
    entries["inventory.json"] = strToU8('{"items":"not-an-array"}');
    const badInventory = unpackSeed(zipSync(entries));
    expect(badInventory.ok).toBe(false);
    if (!badInventory.ok) expect(badInventory.error.code).toBe("world-file-invalid");

    const karmaEntries = await validEntries();
    karmaEntries["karma.jsonl"] = strToU8('{"at":1}\n');
    const badKarma = unpackSeed(zipSync(karmaEntries));
    expect(badKarma.ok).toBe(false);
    if (!badKarma.ok) expect(badKarma.error.code).toBe("world-file-invalid");
  });

  it("rejects bytes that are not a zip at all", () => {
    const result = unpackSeed(strToU8("this is not a zip"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("seed-unreadable");
  });
});
