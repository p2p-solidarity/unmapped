import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishCartridgeRevision, readCartridgeRevision } from "@main/cartridges/store";
import {
  checkpointInstance,
  completeInstance,
  createInstance,
  resolveInstance,
  transitionInstance,
} from "@main/instances/store";
import type { PublishCartridgeInput } from "@shared/cartridge";
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
): PublishCartridgeInput {
  return {
    manifest: {
      formatVersion: 1,
      cartridgeId: "salt-marsh",
      version: "1.0.0",
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
});
