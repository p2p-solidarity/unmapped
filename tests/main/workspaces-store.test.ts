import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishCartridgeRevision, readCartridgeRevision } from "@main/cartridges/store";
import {
  createWorkspaceFromRevision,
  publishWorkspace,
  writeWorkspaceRules,
  writeWorkspaceScene,
} from "@main/workspaces/store";
import type { PublishCartridgeInput } from "@shared/cartridge";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { testGenesis } from "./fixtures";

let root = "";
let cartridgesDir = "";
let workspacesDir = "";

const rules = [
  'root = Rules("tps_exploration@1", "grounded", [kit, forward, back, left, right, interact])',
  'kit = Kit("tps_exploration@1", 4, 7, 6.4, 15, 2, 55, 0.0022, 9)',
  'forward = Bind("move_forward", ["KeyW"])',
  'back = Bind("move_backward", ["KeyS"])',
  'left = Bind("move_left", ["KeyA"])',
  'right = Bind("move_right", ["KeyD"])',
  'interact = Bind("interact", ["KeyE"])',
].join("\n");

const originalScene = [
  'root = Scene("Original", "meadow", [contract, ground, gate])',
  'contract = Contract("ending", "tps_exploration@1", [], [], "carry", [], true)',
  'ground = Floor(8, 8, "grass")',
  // A terminal scene needs an ending gate: an Exit with no targetSceneId.
  'gate = Exit(7, 7, "The light")',
].join("\n");

function input(): PublishCartridgeInput {
  return {
    manifest: {
      formatVersion: 1,
      cartridgeId: "original",
      version: "1.0.0",
      name: "Original",
      description: "Source cartridge",
      author: "source-author",
      createdAt: "2026-09-26T00:00:00.000Z",
      engineApiVersion: 1,
      saveSchemaVersion: 1,
      entrySceneId: "ending",
      story: {
        premise: "A one-scene source used to test remixing.",
        finale: "The source remains unchanged.",
        scenes: [
          {
            id: "ending",
            title: "Ending",
            summary: "Stand in the source scene.",
            objective: "Finish.",
            kit: "tps_exploration@1",
          },
        ],
      },
      scenes: [{ id: "ending", title: "Ending" }],
      requiredKits: ["tps_exploration@1"],
      genesis: testGenesis,
      lineage: null,
    },
    rules,
    scenes: { ending: originalScene },
  };
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.value;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aether-workspaces-"));
  cartridgesDir = join(root, "cartridges");
  workspacesDir = join(root, "workspaces");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("Remix workspaces", () => {
  it("edits mutable copies and publishes a new immutable cartridge with exact lineage", async () => {
    const sourceManifest = unwrap(await publishCartridgeRevision(cartridgesDir, input()));
    const source = unwrap(
      await readCartridgeRevision(
        cartridgesDir,
        sourceManifest.cartridgeId,
        sourceManifest.version,
      ),
    );
    const workspace = unwrap(
      await createWorkspaceFromRevision(workspacesDir, source, {
        mode: "remix",
        targetCartridgeId: "my-remix",
        name: "My Remix",
        author: "new-author",
        now: new Date("2026-09-26T01:00:00Z"),
      }),
    );

    const changedScene = originalScene.replace("Original", "Remixed");
    unwrap(
      await writeWorkspaceScene(workspacesDir, workspace.meta.workspaceId, "ending", changedScene),
    );
    const changedRules = rules.replace(", 4, 7,", ", 5, 7,");
    unwrap(await writeWorkspaceRules(workspacesDir, workspace.meta.workspaceId, changedRules));
    const published = unwrap(
      await publishWorkspace(workspacesDir, cartridgesDir, workspace.meta.workspaceId, "1.0.0"),
    );
    const retried = unwrap(
      await publishWorkspace(workspacesDir, cartridgesDir, workspace.meta.workspaceId, "1.0.0"),
    );

    expect(published.cartridgeId).toBe("my-remix");
    expect(published.lineage).toEqual({
      kind: "remix",
      parent: {
        cartridgeId: "original",
        version: "1.0.0",
        contentHash: sourceManifest.contentHash,
      },
    });
    expect(published.contentHash).not.toBe(sourceManifest.contentHash);
    expect(retried).toEqual(published);
    const remix = unwrap(await readCartridgeRevision(cartridgesDir, "my-remix", "1.0.0"));
    expect(remix.rules).toContain(", 5, 7,");

    const sourceAgain = unwrap(await readCartridgeRevision(cartridgesDir, "original", "1.0.0"));
    expect(sourceAgain.scenes.ending).toBe(`${originalScene}\n`);
  });
});
