import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listInstances, resolveInstance } from "@main/instances/store";
import { migrateLegacyWorld, RECEIPT_FILE } from "@main/worlds/migrate";
import { createWorld, readWorldFile, writeWorldFile } from "@main/worlds/store";
import { WORLD_FILES } from "@shared/world";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { testGenesis } from "./fixtures";

let root = "";
let dirs = { worldsDir: "", cartridgesDir: "", instancesDir: "" };

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aether-legacy-migration-"));
  dirs = {
    worldsDir: join(root, "worlds"),
    cartridgesDir: join(root, "cartridges"),
    instancesDir: join(root, "instances"),
  };
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("legacy world migration", () => {
  it("preserves the source and returns the same pinned instance from its receipt", async () => {
    const source = [
      'root = Scene("Legacy", "meadow", [ground, gate])',
      'ground = Floor(8, 8, "grass")',
      'gate = Exit(7, 7, "The old horizon")',
      "",
    ].join("\n");
    const world = await createWorld(
      dirs.worldsDir,
      { name: "Old Keep", genesis: testGenesis, scene: source },
      new Date("2026-09-26T00:00:00Z"),
    );
    if (!world.ok) throw new Error(world.error.code);

    const first = await migrateLegacyWorld(dirs, world.value.id, new Date("2026-09-26T00:00:00Z"));
    if (!first.ok) throw new Error(first.error.code);
    const second = await migrateLegacyWorld(dirs, world.value.id, new Date("2026-09-26T00:00:00Z"));
    expect(second).toEqual(first);
    expect(await readWorldFile(dirs.worldsDir, world.value.id, WORLD_FILES.scene)).toEqual({
      ok: true,
      value: source,
    });
    await expect(stat(join(dirs.worldsDir, world.value.id, RECEIPT_FILE))).resolves.toBeDefined();
    expect(
      JSON.parse(await readFile(join(dirs.worldsDir, world.value.id, RECEIPT_FILE), "utf8")),
    ).toEqual(first.value);
    const resolved = await resolveInstance(
      dirs.cartridgesDir,
      dirs.instancesDir,
      first.value.instanceId,
    );
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.instance.meta.cartridge).toEqual(first.value.cartridge);
    expect(resolved.value.cartridge.manifest.name).toBe("Old Keep");
  });

  it("republishes an edited world as the next patch version once its receipt is stale", async () => {
    const source = [
      'root = Scene("Legacy", "meadow", [ground, gate])',
      'ground = Floor(8, 8, "grass")',
      'gate = Exit(7, 7, "The old horizon")',
      "",
    ].join("\n");
    const world = await createWorld(dirs.worldsDir, {
      name: "Edited Keep",
      genesis: testGenesis,
      scene: source,
    });
    if (!world.ok) throw new Error(world.error.code);
    const first = await migrateLegacyWorld(dirs, world.value.id);
    if (!first.ok) throw new Error(first.error.code);
    expect(first.value.cartridge.version).toBe("1.0.0");

    // The receipt goes stale (its instance is gone) and the floor is hand-edited afterwards.
    await rm(join(dirs.instancesDir, first.value.instanceId), { recursive: true, force: true });
    const edited = source.replace('Floor(8, 8, "grass")', 'Floor(9, 9, "sand")');
    const written = await writeWorldFile(dirs.worldsDir, world.value.id, WORLD_FILES.scene, edited);
    if (!written.ok) throw new Error(written.error.code);

    const second = await migrateLegacyWorld(dirs, world.value.id);
    if (!second.ok) throw new Error(second.error.code);
    expect(second.value.cartridge.cartridgeId).toBe(first.value.cartridge.cartridgeId);
    expect(second.value.cartridge.version).toBe("1.0.1");
    expect(second.value.cartridge.contentHash).not.toBe(first.value.cartridge.contentHash);
    const resolved = await resolveInstance(
      dirs.cartridgesDir,
      dirs.instancesDir,
      second.value.instanceId,
    );
    expect(resolved.ok).toBe(true);
  });

  it("adopts the already-created instance when a retry follows a lost receipt", async () => {
    const source = [
      'root = Scene("Legacy", "meadow", [ground, gate])',
      'ground = Floor(8, 8, "grass")',
      'gate = Exit(7, 7, "The old horizon")',
      "",
    ].join("\n");
    const world = await createWorld(dirs.worldsDir, {
      name: "Retry Keep",
      genesis: testGenesis,
      scene: source,
    });
    if (!world.ok) throw new Error(world.error.code);
    const first = await migrateLegacyWorld(dirs, world.value.id, new Date("2026-09-26T00:00:00Z"));
    if (!first.ok) throw new Error(first.error.code);
    // Simulate the crash window after createInstance: the receipt never reached disk.
    await rm(join(dirs.worldsDir, world.value.id, RECEIPT_FILE), { force: true });

    const retry = await migrateLegacyWorld(dirs, world.value.id, new Date("2026-09-26T00:00:00Z"));
    if (!retry.ok) throw new Error(retry.error.code);
    expect(retry.value.instanceId).toBe(first.value.instanceId);
    expect(retry.value.cartridge).toEqual(first.value.cartridge);
    const instances = await listInstances(dirs.instancesDir);
    expect(instances.ok && instances.value.length).toBe(1);
  });
});
