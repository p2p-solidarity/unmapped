import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveRuntimePin } from "@main/cartridges/integrity";
import { publishCartridgeRevision } from "@main/cartridges/store";
import { upgradeLegacyInstance } from "@main/instances/legacy";
import {
  checkpointInstance,
  createInstance,
  listInstances,
  listLegacyInstances,
  readInstance,
  resolveInstance,
} from "@main/instances/store";
import type { CartridgeManifest } from "@shared/cartridge";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { V1_INSTANCE_ID, v1CartridgeInput, v1InstanceFiles } from "../fixtures/v1";
import { v2CartridgeInput } from "../fixtures/v2";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aether-legacy-saves-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.value;
}

function refOf(manifest: CartridgeManifest) {
  return {
    cartridgeId: manifest.cartridgeId,
    version: manifest.version,
    contentHash: manifest.contentHash,
  };
}

/** Writes a format 1 save to disk exactly as the older build laid it out. */
async function writeV1(instancesDir: string, manifest: CartridgeManifest): Promise<string> {
  const files = v1InstanceFiles(refOf(manifest));
  const dir = join(instancesDir, V1_INSTANCE_ID);
  await mkdir(join(dir, "saves", "default"), { recursive: true });
  await writeFile(join(dir, "instance.json"), `${JSON.stringify(files.instance, null, 2)}\n`);
  await writeFile(
    join(dir, "saves", "default", "save.json"),
    `${JSON.stringify(files.save, null, 2)}\n`,
  );
  await writeFile(join(dir, "saves", "default", "karma.jsonl"), files.karma);
  return dir;
}

describe("saves from an older build", () => {
  it("lists them separately instead of failing the whole library", async () => {
    const cartridgesDir = join(root, "cartridges");
    const instancesDir = join(root, "instances");
    const manifest = unwrap(await publishCartridgeRevision(cartridgesDir, v2CartridgeInput()));
    const current = unwrap(await createInstance(instancesDir, manifest, "Current run"));
    const oldDir = join(instancesDir, "old-run-1");
    await mkdir(join(oldDir, "saves", "default"), { recursive: true });
    const { runtimePin: _pin, ...legacyMeta } = current.meta;
    await writeFile(
      join(oldDir, "instance.json"),
      JSON.stringify({ ...legacyMeta, formatVersion: 1, instanceId: "old-run-1" }),
    );

    const listed = unwrap(await listInstances(instancesDir));
    expect(listed.map((meta) => meta.instanceId)).toEqual([current.meta.instanceId]);
    expect(unwrap(await listLegacyInstances(instancesDir))).toEqual(["old-run-1"]);
    // Its save.json is gone, so even with the cartridge installed it cannot be upgraded.
    const opened = await resolveInstance(cartridgesDir, instancesDir, "old-run-1");
    expect(opened.ok ? "ok" : opened.error.code).toBe("instance-legacy-format");
  });

  it("upgrades a format 1 instance and save to the current shape (pure)", async () => {
    const manifest = unwrap(
      await publishCartridgeRevision(join(root, "cartridges"), v1CartridgeInput()),
    );
    const files = v1InstanceFiles(refOf(manifest));
    const upgraded = unwrap(upgradeLegacyInstance(files.instance, files.save, manifest));
    const pin = unwrap(deriveRuntimePin(manifest));
    expect(upgraded.meta).toMatchObject({ formatVersion: 2, instanceId: V1_INSTANCE_ID });
    expect(upgraded.meta.runtimePin).toEqual(pin);
    expect(upgraded.save).toMatchObject({
      formatVersion: 2,
      runtimePin: pin,
      player: null,
      party: null,
      flags: { drones_cleared: true, visits: 2 },
      inventory: { items: [], materials: ["scrap"] },
      updatedAt: "2026-09-26T06:10:00.000Z",
    });
    const other = { ...refOf(manifest), version: "9.9.9" };
    const wrong = upgradeLegacyInstance(
      { ...(files.instance as object), cartridge: other },
      files.save,
      manifest,
    );
    expect(wrong.ok ? "ok" : wrong.error.code).toBe("save-identity-mismatch");
  });

  it("opens one whose cartridge is installed, leaves its files alone, and saves it as format 2", async () => {
    const cartridgesDir = join(root, "cartridges");
    const instancesDir = join(root, "instances");
    const manifest = unwrap(await publishCartridgeRevision(cartridgesDir, v1CartridgeInput()));
    const dir = await writeV1(instancesDir, manifest);
    const before = await readFile(join(dir, "instance.json"), "utf8");
    const saveBefore = await readFile(join(dir, "saves", "default", "save.json"), "utf8");

    const opened = unwrap(await resolveInstance(cartridgesDir, instancesDir, V1_INSTANCE_ID));
    expect(opened.instance.save.currentSceneId).toBe("deck");
    expect(opened.instance.karma).toHaveLength(1);
    expect(
      unwrap(await listInstances(instancesDir, cartridgesDir)).map((m) => m.instanceId),
    ).toEqual([V1_INSTANCE_ID]);
    expect(unwrap(await listLegacyInstances(instancesDir, cartridgesDir))).toEqual([]);
    // Reading never rewrites the older files.
    expect(await readFile(join(dir, "instance.json"), "utf8")).toBe(before);
    expect(await readFile(join(dir, "saves", "default", "save.json"), "utf8")).toBe(saveBefore);

    // The next ordinary save writes the current format.
    unwrap(
      await checkpointInstance(
        instancesDir,
        {
          instanceId: V1_INSTANCE_ID,
          expectedUpdatedAt: opened.instance.meta.updatedAt,
          flags: { ...opened.instance.save.flags, visits: 3 },
          inventory: opened.instance.save.inventory,
          mutation: null,
          karma: opened.instance.karma,
        },
        new Date("2026-09-26T00:00:00.000Z"),
        cartridgesDir,
      ),
    );
    const rewritten = unwrap(await readInstance(instancesDir, V1_INSTANCE_ID));
    expect(rewritten.meta.formatVersion).toBe(2);
    expect(rewritten.save.flags.visits).toBe(3);
    unwrap(await resolveInstance(cartridgesDir, instancesDir, V1_INSTANCE_ID));
  });

  it("keeps one whose cartridge is missing in the older-build list", async () => {
    const cartridgesDir = join(root, "cartridges");
    const instancesDir = join(root, "instances");
    const manifest = unwrap(
      await publishCartridgeRevision(join(root, "elsewhere"), v1CartridgeInput()),
    );
    await writeV1(instancesDir, manifest);
    expect(unwrap(await listInstances(instancesDir, cartridgesDir))).toEqual([]);
    expect(unwrap(await listLegacyInstances(instancesDir, cartridgesDir))).toEqual([
      V1_INSTANCE_ID,
    ]);
    const opened = await resolveInstance(cartridgesDir, instancesDir, V1_INSTANCE_ID);
    expect(opened.ok ? "ok" : opened.error.code).toBe("instance-legacy-format");
  });
});
