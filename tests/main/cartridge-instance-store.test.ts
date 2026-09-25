import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packCartridge, unpackCartridge } from "@main/cartridges/pack";
import {
  cartridgeCompatibility,
  listCartridgeRevisions,
  publishCartridgeRevision,
  readCartridgeRevision,
} from "@main/cartridges/store";
import {
  packInstanceBackup,
  restoreInstanceBackup,
  unpackInstanceBackup,
} from "@main/instances/backup";
import {
  checkpointInstance,
  completeInstance,
  createInstance,
  resolveInstance,
  transitionInstance,
} from "@main/instances/store";
import { upgradeInstance } from "@main/instances/upgrade";
import type { PublishCartridgeInput } from "@shared/cartridge";
import { strToU8, unzipSync, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { testGenesis } from "./fixtures";

let root = "";
let cartridgesDir = "";
let instancesDir = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aether-cartridges-"));
  cartridgesDir = join(root, "cartridges");
  instancesDir = join(root, "instances");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.value;
}

const rules = [
  'root = Rules("tps_exploration@1", "grounded", [tps, fps, forward, back, left, right, interact])',
  'tps = Kit("tps_exploration@1", 4, 7, 6.4, 15, 2, 55, 0.0022, 9)',
  'fps = Kit("fps_puzzle@1", 3.5, 5, 0, 15, 3, 70, 0.0022, 0)',
  'forward = Bind("move_forward", ["KeyW"])',
  'back = Bind("move_backward", ["KeyS"])',
  'left = Bind("move_left", ["KeyA"])',
  'right = Bind("move_right", ["KeyD"])',
  'interact = Bind("interact", ["KeyE"])',
].join("\n");

/**
 * `target === null` makes a terminal scene whose Exit is the ending gate (no targetSceneId);
 * `gate: false` leaves a terminal scene without any way to finish.
 */
function scene(
  id: string,
  kit: "tps_exploration@1" | "fps_puzzle@1",
  target: string | null,
  gate = true,
) {
  const terminal = target === null;
  const contract = `contract = Contract("${id}", "${kit}", [], [], "carry", ["${id}_done"], ${terminal})`;
  const exit = terminal
    ? gate
      ? '\nexit = Exit(7, 7, "The light")'
      : ""
    : `\nexit = Exit(7, 7, "Continue", "${target}")`;
  const children = exit === "" ? "[contract, ground]" : "[contract, ground, exit]";
  return `root = Scene("${id}", "meadow", ${children})\n${contract}\nground = Floor(8, 8, "grass")${exit}\n`;
}

function cartridgeInput(
  entrance = scene("entrance", "tps_exploration@1", "vault"),
  ending = scene("ending", "tps_exploration@1", null),
  version = "1.0.0",
): PublishCartridgeInput {
  return {
    manifest: {
      formatVersion: 1,
      cartridgeId: "salt-marsh",
      version,
      name: "Salt Marsh",
      description: "A small test cartridge.",
      author: "kidney",
      createdAt: "2026-09-26T00:00:00.000Z",
      engineApiVersion: 1,
      saveSchemaVersion: 1,
      entrySceneId: "entrance",
      story: {
        premise: "Cross the salt marsh and open its vault.",
        finale: "Escape with the marsh relic.",
        scenes: [
          {
            id: "entrance",
            title: "Entrance",
            summary: "Enter the marsh.",
            objective: "Find the vault.",
            kit: "tps_exploration@1",
          },
          {
            id: "vault",
            title: "Vault",
            summary: "Solve the sealed vault.",
            objective: "Open the seal.",
            kit: "fps_puzzle@1",
          },
          {
            id: "ending",
            title: "Ending",
            summary: "Leave with the relic.",
            objective: "Reach the light.",
            kit: "tps_exploration@1",
          },
        ],
      },
      scenes: [
        { id: "entrance", title: "Entrance" },
        { id: "vault", title: "Vault" },
        { id: "ending", title: "Ending" },
      ],
      requiredKits: ["tps_exploration@1", "fps_puzzle@1"],
      genesis: testGenesis,
      lineage: null,
    },
    rules,
    scenes: {
      entrance,
      vault: scene("vault", "fps_puzzle@1", "ending"),
      ending,
    },
  };
}

function duplicateFirstCentralEntry(zip: Uint8Array): Uint8Array {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = zip.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error("test ZIP has no end record");
  const central = view.getUint32(end + 16, true);
  const entryBytes =
    46 +
    view.getUint16(central + 28, true) +
    view.getUint16(central + 30, true) +
    view.getUint16(central + 32, true);
  const copy = new Uint8Array(zip.length + entryBytes);
  copy.set(zip.subarray(0, end), 0);
  copy.set(zip.subarray(central, central + entryBytes), end);
  copy.set(zip.subarray(end), end + entryBytes);
  const next = new DataView(copy.buffer);
  next.setUint16(end + entryBytes + 8, view.getUint16(end + 8, true) + 1, true);
  next.setUint16(end + entryBytes + 10, view.getUint16(end + 10, true) + 1, true);
  next.setUint32(end + entryBytes + 12, view.getUint32(end + 12, true) + entryBytes, true);
  return copy;
}

describe("immutable cartridge revisions", () => {
  it("publishes, verifies, and idempotently reuses the same revision", async () => {
    const first = unwrap(await publishCartridgeRevision(cartridgesDir, cartridgeInput()));
    expect(first.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    const second = unwrap(await publishCartridgeRevision(cartridgesDir, cartridgeInput()));
    expect(second).toEqual(first);

    const loaded = unwrap(
      await readCartridgeRevision(cartridgesDir, first.cartridgeId, first.version),
    );
    expect(loaded.manifest).toEqual(first);
    expect(loaded.rules).toContain("Rules(");
    expect(loaded.scenes.entrance).toBe(scene("entrance", "tps_exploration@1", "vault"));

    const manifestPath = join(cartridgesDir, "salt-marsh", "1.0.0", "manifest.json");
    expect(JSON.parse(await readFile(manifestPath, "utf8")).contentHash).toBe(first.contentHash);
  });

  it("lists intact incompatible revisions but refuses to run them", async () => {
    const input = cartridgeInput();
    input.manifest.engineApiVersion = 2;
    const manifest = unwrap(await publishCartridgeRevision(cartridgesDir, input));

    expect(unwrap(await listCartridgeRevisions(cartridgesDir))).toEqual([manifest]);
    const compatibility = cartridgeCompatibility(manifest);
    expect(compatibility.ok).toBe(false);
    if (!compatibility.ok) expect(compatibility.error.code).toBe("cartridge-engine-unsupported");

    const instance = await createInstance(instancesDir, manifest, "Unsupported run");
    expect(instance.ok).toBe(false);
    if (!instance.ok) expect(instance.error.code).toBe("cartridge-engine-unsupported");
  });

  it("rejects different bytes at an existing cartridge id and version", async () => {
    unwrap(await publishCartridgeRevision(cartridgesDir, cartridgeInput()));
    const changed = await publishCartridgeRevision(
      cartridgesDir,
      cartridgeInput(
        scene("entrance", "tps_exploration@1", "vault").replace("entrance", "changed"),
      ),
    );
    expect(changed.ok).toBe(false);
    if (!changed.ok) expect(changed.error.code).toBe("cartridge-version-conflict");
  });

  it("rejects a terminal scene without an ending gate and a non-terminal exit without a target", async () => {
    const noGate = await publishCartridgeRevision(
      cartridgesDir,
      cartridgeInput(undefined, scene("ending", "tps_exploration@1", null, false)),
    );
    expect(noGate.ok).toBe(false);
    if (!noGate.ok) expect(noGate.error.code).toBe("cartridge-ending-missing");

    const untargeted = [
      'root = Scene("entrance", "meadow", [contract, ground, exit])',
      'contract = Contract("entrance", "tps_exploration@1", [], [], "carry", ["entrance_done"], false)',
      'ground = Floor(8, 8, "grass")',
      'exit = Exit(7, 7, "Somewhere")',
      "",
    ].join("\n");
    const dangling = await publishCartridgeRevision(cartridgesDir, cartridgeInput(untargeted));
    expect(dangling.ok).toBe(false);
    if (!dangling.ok) expect(dangling.error.code).toBe("cartridge-route-invalid");
  });

  it("rejects a cartridge whose scene contract targets a missing scene", async () => {
    const invalid = cartridgeInput(scene("entrance", "tps_exploration@1", "missing"));
    const result = await publishCartridgeRevision(cartridgesDir, invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("cartridge-route-invalid");
  });

  it("rejects an offline prerequisite that no scene can grant", async () => {
    const entrance = scene("entrance", "tps_exploration@1", "vault").replace(
      '[], [], "carry"',
      '["missing_flag"], [], "carry"',
    );
    const result = await publishCartridgeRevision(cartridgesDir, cartridgeInput(entrance));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("cartridge-prerequisite-invalid");
  });
});

describe("portable cartridge and save archives", () => {
  it("keeps cartridge exports content-only and verifies their exact bytes", async () => {
    const manifest = unwrap(await publishCartridgeRevision(cartridgesDir, cartridgeInput()));
    const revision = unwrap(await readCartridgeRevision(cartridgesDir, "salt-marsh", "1.0.0"));
    const packed = unwrap(packCartridge(revision));
    expect(Object.keys(unzipSync(packed)).sort()).toEqual([
      "manifest.json",
      "rules.oui",
      "scenes/ending.oui",
      "scenes/entrance.oui",
      "scenes/vault.oui",
    ]);
    expect(unwrap(unpackCartridge(packed)).manifest.contentHash).toBe(manifest.contentHash);

    const extra = zipSync({
      "manifest.json": strToU8("{}"),
      "../save.json": strToU8("personal"),
    });
    const unsafe = unpackCartridge(extra);
    expect(unsafe.ok).toBe(false);
    if (!unsafe.ok) expect(unsafe.error.code).toBe("cartridge-pack-unsafe");

    const duplicate = unpackCartridge(duplicateFirstCentralEntry(packed));
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error.code).toBe("cartridge-pack-duplicate");

    const unsafeDirectory = unpackCartridge(
      zipSync({ ...unzipSync(packed), "../": new Uint8Array() }),
    );
    expect(unsafeDirectory.ok).toBe(false);
    if (!unsafeDirectory.ok) expect(unsafeDirectory.error.code).toBe("cartridge-pack-unsafe");
  });

  it("restores save-only backups only when the exact cartridge is installed", async () => {
    const manifest = unwrap(await publishCartridgeRevision(cartridgesDir, cartridgeInput()));
    const instance = unwrap(await createInstance(instancesDir, manifest, "Portable run"));
    const packed = unwrap(await packInstanceBackup(instancesDir, instance.meta.instanceId));
    expect(Object.keys(unzipSync(packed)).sort()).toEqual([
      "instance.json",
      "saves/default/karma.jsonl",
      "saves/default/save.json",
    ]);
    const record = unwrap(unpackInstanceBackup(packed));

    const withExtraSlot = unzipSync(packed);
    withExtraSlot["saves/other/save.json"] = strToU8("{}");
    withExtraSlot["saves/other/karma.jsonl"] = strToU8("");
    const extraSlot = unpackInstanceBackup(zipSync(withExtraSlot));
    expect(extraSlot.ok).toBe(false);
    if (!extraSlot.ok) expect(extraSlot.error.code).toBe("backup-unknown-file");

    const duplicate = unpackInstanceBackup(duplicateFirstCentralEntry(packed));
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error.code).toBe("backup-duplicate");

    const extraDirectory = unpackInstanceBackup(
      zipSync({ ...unzipSync(packed), "saves/other/": new Uint8Array() }),
    );
    expect(extraDirectory.ok).toBe(false);
    if (!extraDirectory.ok) expect(extraDirectory.error.code).toBe("backup-unknown-file");

    const missing = await restoreInstanceBackup(
      join(root, "empty-cartridges"),
      instancesDir,
      record,
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe("cartridge-missing");
  });

  it("validates the saved scene and preserves a suffix when a maximum-length id is taken", async () => {
    const manifest = unwrap(await publishCartridgeRevision(cartridgesDir, cartridgeInput()));
    const instance = unwrap(await createInstance(instancesDir, manifest, "Portable run"));
    const packed = unwrap(await packInstanceBackup(instancesDir, instance.meta.instanceId));
    const record = unwrap(unpackInstanceBackup(packed));

    const badScene = await restoreInstanceBackup(cartridgesDir, join(root, "bad"), {
      ...record,
      save: { ...record.save, currentSceneId: "missing" },
    });
    expect(badScene.ok).toBe(false);
    if (!badScene.ok) expect(badScene.error.code).toBe("backup-scene-missing");

    const longId = `i${"d".repeat(95)}`;
    await mkdir(join(instancesDir, longId), { recursive: true });
    const restored = unwrap(
      await restoreInstanceBackup(
        cartridgesDir,
        instancesDir,
        {
          ...record,
          meta: { ...record.meta, instanceId: longId },
          save: { ...record.save, instanceId: longId },
        },
        new Date("2026-09-26T12:00:00Z"),
      ),
    );
    expect(restored.instance.meta.instanceId).not.toBe(longId);
    expect(restored.instance.meta.instanceId).toMatch(/-r[a-z0-9]+$/);
    expect(restored.instance.meta.instanceId).toHaveLength(96);
  });
});

describe("pinned instances", () => {
  it("creates a default save and resolves the exact immutable revision", async () => {
    const manifest = unwrap(await publishCartridgeRevision(cartridgesDir, cartridgeInput()));
    const instance = unwrap(
      await createInstance(
        instancesDir,
        manifest,
        "Salt Marsh run",
        new Date("2026-09-26T01:00:00Z"),
      ),
    );

    expect(instance.meta.cartridge).toEqual({
      cartridgeId: "salt-marsh",
      version: "1.0.0",
      contentHash: manifest.contentHash,
    });
    expect(instance.save.currentSceneId).toBe("entrance");
    expect(instance.save.inventory).toEqual({ items: [], materials: [] });

    const resolved = unwrap(
      await resolveInstance(cartridgesDir, instancesDir, instance.meta.instanceId),
    );
    expect(resolved.cartridge.manifest.contentHash).toBe(manifest.contentHash);
    expect(resolved.instance).toEqual(instance);
  });

  it("moves through declared scenes offline and persists the checkpoint", async () => {
    const manifest = unwrap(await publishCartridgeRevision(cartridgesDir, cartridgeInput()));
    const instance = unwrap(
      await createInstance(instancesDir, manifest, "Offline run", new Date("2026-09-26T01:00:00Z")),
    );

    const transitioned = unwrap(
      await transitionInstance(
        cartridgesDir,
        instancesDir,
        instance.meta.instanceId,
        "vault",
        new Date("2026-09-26T01:05:00Z"),
      ),
    );
    expect(transitioned.instance.save.currentSceneId).toBe("vault");
    expect(transitioned.instance.save.flags.entrance_done).toBe(true);
    expect(transitioned.instance.save.completedSceneIds).toEqual(["entrance"]);

    const reloaded = unwrap(
      await resolveInstance(cartridgesDir, instancesDir, instance.meta.instanceId),
    );
    expect(reloaded.instance.save).toEqual(transitioned.instance.save);
  });

  it("ends the cartridge from its terminal scene and refuses everywhere else", async () => {
    const manifest = unwrap(await publishCartridgeRevision(cartridgesDir, cartridgeInput()));
    const instance = unwrap(
      await createInstance(instancesDir, manifest, "Finale run", new Date("2026-09-26T03:00:00Z")),
    );
    const id = instance.meta.instanceId;

    const early = await completeInstance(cartridgesDir, instancesDir, id);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.error.code).toBe("scene-not-terminal");

    unwrap(await transitionInstance(cartridgesDir, instancesDir, id, "vault"));
    unwrap(await transitionInstance(cartridgesDir, instancesDir, id, "ending"));
    const done = unwrap(
      await completeInstance(cartridgesDir, instancesDir, id, new Date("2026-09-26T03:30:00Z")),
    );
    expect(done.instance.save.currentSceneId).toBe("ending");
    expect(done.instance.save.completedSceneIds).toEqual(["entrance", "vault", "ending"]);
    expect(done.instance.save.flags.ending_done).toBe(true);
    expect(done.instance.meta.updatedAt).toBe("2026-09-26T03:30:00.000Z");

    const reloaded = unwrap(await resolveInstance(cartridgesDir, instancesDir, id));
    expect(reloaded.instance.save).toEqual(done.instance.save);
    const original = await readFile(
      join(cartridgesDir, "salt-marsh", "1.0.0", "scenes", "ending.oui"),
      "utf8",
    );
    expect(original).toBe(cartridgeInput().scenes.ending);
  });

  it("persists player progress without modifying the cartridge", async () => {
    const manifest = unwrap(await publishCartridgeRevision(cartridgesDir, cartridgeInput()));
    const instance = unwrap(
      await createInstance(
        instancesDir,
        manifest,
        "Progress run",
        new Date("2026-09-26T02:00:00Z"),
      ),
    );
    unwrap(
      await checkpointInstance(
        instancesDir,
        {
          instanceId: instance.meta.instanceId,
          expectedUpdatedAt: instance.meta.updatedAt,
          flags: { chest_open: true },
          inventory: { items: [], materials: ["brass"] },
          mutation: null,
          karma: [
            {
              at: "2026-09-26T02:01:00.000Z",
              floor: 1,
              npcId: null,
              choice: "opened chest",
              action: "trade",
              effect: "brass",
            },
          ],
        },
        new Date("2026-09-26T02:02:00Z"),
      ),
    );

    const reloaded = unwrap(
      await resolveInstance(cartridgesDir, instancesDir, instance.meta.instanceId),
    );
    expect(reloaded.instance.save.flags.chest_open).toBe(true);
    expect(reloaded.instance.save.inventory.materials).toEqual(["brass"]);
    expect(reloaded.instance.karma).toHaveLength(1);
    expect(reloaded.cartridge.manifest.contentHash).toBe(manifest.contentHash);
  });

  it("snapshots the save before explicitly re-pinning to a compatible revision", async () => {
    const first = unwrap(await publishCartridgeRevision(cartridgesDir, cartridgeInput()));
    const instance = unwrap(await createInstance(instancesDir, first, "Upgrade run"));
    const secondInput = cartridgeInput(undefined, undefined, "1.1.0");
    secondInput.manifest.description = "Compatible update";
    const second = unwrap(await publishCartridgeRevision(cartridgesDir, secondInput));

    const upgraded = unwrap(
      await upgradeInstance(
        cartridgesDir,
        instancesDir,
        instance.meta.instanceId,
        "1.1.0",
        new Date("2026-09-26T10:00:00Z"),
      ),
    );
    expect(upgraded.instance.meta.cartridge.contentHash).toBe(second.contentHash);
    expect(upgraded.instance.save.cartridge.version).toBe("1.1.0");
    expect(await readdir(join(instancesDir, instance.meta.instanceId, "backups"))).toEqual([
      "1.0.0-2026-09-26T10-00-00-000Z",
    ]);
  });

  it("rejects an explicit downgrade before changing the pinned revision", async () => {
    const older = unwrap(await publishCartridgeRevision(cartridgesDir, cartridgeInput()));
    const newerInput = cartridgeInput(undefined, undefined, "2.0.0");
    newerInput.manifest.description = "Newer revision";
    const newer = unwrap(await publishCartridgeRevision(cartridgesDir, newerInput));
    const instance = unwrap(await createInstance(instancesDir, newer, "Newer run"));

    const downgrade = await upgradeInstance(
      cartridgesDir,
      instancesDir,
      instance.meta.instanceId,
      older.version,
    );
    expect(downgrade.ok).toBe(false);
    if (!downgrade.ok) expect(downgrade.error.code).toBe("upgrade-version-not-newer");

    const reloaded = unwrap(
      await resolveInstance(cartridgesDir, instancesDir, instance.meta.instanceId),
    );
    expect(reloaded.instance.meta.cartridge.contentHash).toBe(newer.contentHash);
  });
});
