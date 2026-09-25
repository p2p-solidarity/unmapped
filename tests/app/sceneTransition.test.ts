import type { SaveState } from "@shared/cartridge";
import type { SceneContract } from "@shared/gameplay";
import { completeScene, transitionScene } from "@shared/sceneTransition";
import type { SceneGraph } from "@shared/world";
import { describe, expect, it } from "vitest";
import { makeScene } from "../engine/fixtures";

const cartridge = {
  cartridgeId: "puzzle",
  version: "1.0.0",
  contentHash: `sha256:${"a".repeat(64)}` as const,
};

function save(): SaveState {
  return {
    formatVersion: 2,
    instanceId: "run-1",
    cartridge,
    runtimePin: {
      cartridge,
      moduleLock: { entries: [] },
      modLock: { entries: [], lockHash: `sha256:${"b".repeat(64)}` },
      profileHash: `sha256:${"c".repeat(64)}`,
      effectiveHash: `sha256:${"d".repeat(64)}`,
    },
    saveSchemaVersion: 1,
    currentSceneId: "entrance",
    flags: {},
    inventory: { items: [], materials: [] },
    mutation: null,
    player: null,
    party: null,
    completedSceneIds: [],
    updatedAt: "2026-09-26T00:00:00.000Z",
  };
}

function scene(id: string, overrides: Partial<SceneGraph> = {}): SceneGraph {
  return makeScene({
    name: id,
    contract: contract(id),
    ...overrides,
  });
}

function contract(sceneId: string): SceneContract {
  return {
    sceneId,
    kit: "tps_exploration@1",
    requiresFlags: [],
    requiresItems: [],
    inventoryPolicy: "carry",
    grantsFlags: [],
    terminal: false,
  };
}

describe("deterministic cartridge scene transitions", () => {
  it("applies completion flags before checking the target contract", () => {
    const from = scene("entrance", {
      contract: {
        ...contract("entrance"),
        grantsFlags: ["vault_open"],
      },
      exits: [{ x: 7, z: 7, to: "Vault", targetSceneId: "vault" }],
    });
    const target = scene("vault", {
      contract: {
        ...contract("vault"),
        kit: "fps_puzzle@1",
        requiresFlags: ["vault_open"],
      },
    });

    const result = transitionScene(save(), from, target, new Date("2026-09-26T01:00:00Z"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.currentSceneId).toBe("vault");
    expect(result.value.flags.vault_open).toBe(true);
    expect(result.value.completedSceneIds).toEqual(["entrance"]);
    expect(result.value.updatedAt).toBe("2026-09-26T01:00:00.000Z");
  });

  it("returns a value error when prerequisites are not satisfied", () => {
    const from = scene("entrance", {
      exits: [{ x: 7, z: 7, to: "Vault", targetSceneId: "vault" }],
    });
    const target = scene("vault", {
      contract: { ...contract("vault"), requiresItems: ["brass_key"] },
    });
    const result = transitionScene(save(), from, target);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("scene-prerequisite-missing");
  });
});

describe("cartridge endings", () => {
  it("completes a terminal scene in place: flags granted, scene recorded, checkpoint unmoved", () => {
    const finale = scene("ending", {
      contract: { ...contract("ending"), grantsFlags: ["relic_found"], terminal: true },
      exits: [{ x: 7, z: 7, to: "The light", targetSceneId: null }],
    });
    const before = { ...save(), currentSceneId: "ending", completedSceneIds: ["entrance"] };
    const result = completeScene(before, finale, new Date("2026-09-26T02:00:00Z"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.currentSceneId).toBe("ending");
    expect(result.value.flags.relic_found).toBe(true);
    expect(result.value.completedSceneIds).toEqual(["entrance", "ending"]);
    expect(result.value.updatedAt).toBe("2026-09-26T02:00:00.000Z");
  });

  it("refuses to end the cartridge from a scene that is not terminal", () => {
    const result = completeScene(save(), scene("entrance"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("scene-not-terminal");
  });

  it("refuses when the loaded scene is not the checkpoint scene", () => {
    const finale = scene("ending", { contract: { ...contract("ending"), terminal: true } });
    const result = completeScene(save(), finale);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("scene-save-mismatch");
  });
});
