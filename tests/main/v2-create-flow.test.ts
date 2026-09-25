// The whole v2 Create product flow, without Electron and without a model: an authoring draft with
// three scenes and baked voices becomes an immutable cartridge, that cartridge becomes an instance,
// the instance walks its scene plan to the ending, and reopening it comes back where it was.
//
// The scene sources here stand in for model output — they are exactly what `generateSceneCandidate`
// hands back once a real answer has parsed and passed the fit checks.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileCapabilities } from "@shared/capabilities";
import { BUILTIN_MODULES } from "@shared/capability-modules";
import type { SceneSlotRole } from "@shared/game-definition";
import { emptyDraft } from "@shared/game-definition";
import { requirementsFor } from "@shared/mode-catalog";
import { rollBases, type SceneBase } from "@shared/scene-bases";
import type { AuthoringSnapshot, SceneCandidate, SceneGallerySlot } from "@shared/scene-gallery";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@renderer/llm", () => ({ chat: vi.fn() }));
vi.mock("@renderer/llm/client", () => ({ chat: vi.fn() }));

const { buildCartridge } = await import("@renderer/narrative/forge");
const { publishCartridgeRevision, readCartridgeRevision } = await import("@main/cartridges/store");
const { createInstance, resolveInstance, transitionInstance, completeInstance } = await import(
  "@main/instances/store"
);

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.value;
}

const rolled = rollBases(1)[0];
if (rolled === undefined) throw new Error("no scene base");
const base: SceneBase = rolled;

const selection = { genres: ["adventure_rpg"], timings: [], structures: [], settings: [] };
const resolution = compileCapabilities({
  requirements: requirementsFor(selection as never),
  modules: BUILTIN_MODULES,
  overrides: {},
  accepted: {},
});
const contextId = resolution.contexts[0]?.contextId ?? "main";

/** A scene with everything a v2 scene is meant to carry: people, looks, loot, a point, a way out. */
function sceneSource(slotId: string, npcId: string): string {
  return [
    `root = Scene("${slotId}", "meadow", [ground, sky1, sun1, ${npcId}, crate, shed, path, task, way])`,
    'ground = Floor(14, 14, "grass")',
    'sky1 = Sky("#9fc7ff", "#cfe3ff", 0.03)',
    'sun1 = Light("sun", "#fff3d0", 1.4)',
    `${npcId} = NPC("${npcId}", "Keeper", 3, 4, "elder", "calm", "#d8c9a3", "stout", "straw", "basket")`,
    'crate = Treasure("crate_a", 9, 3, ["rope", "lantern"])',
    'shed = Wall(2, 9, 3, 2, "wood")',
    'path = Patch(6, 2, 2, 10, "sand")',
    'task = Quest("open_the_gate", "The keeper wants the gate open before dusk.")',
    'way = Exit(12, 12, "Onward")',
    "",
  ].join("\n");
}

function dialogueSource(npcId: string): string {
  return [
    `root = Dialogue("${npcId}", "The gate sticks after rain. Push it with your shoulder.", [c1, c2])`,
    'c1 = Choice("Ask about the well", "talk", "The keeper points past the shed.", [])',
    'c2 = Choice("Take the rope", "trade", "She hands over a coil of rope.", ["rope"])',
    "",
  ].join("\n");
}

/** A plausible content hash: the manifest schema only accepts algorithm-tagged SHA-256. */
function fakeHash(label: string): `sha256:${string}` {
  let value = "";
  for (let index = 0; value.length < 64; index += 1) {
    value += (label.charCodeAt(index % label.length) + index).toString(16).padStart(2, "0");
  }
  return `sha256:${value.slice(0, 64)}`;
}

function candidate(slotId: string, npcId: string): SceneCandidate {
  return {
    candidateId: `${slotId}-candidate`,
    slotId,
    contextId,
    baseId: base.id,
    title: slotId,
    sceneSource: sceneSource(slotId, npcId),
    contentHash: fakeHash(slotId),
    status: "ready",
    staleReason: null,
    dialogues: { [npcId]: dialogueSource(npcId) },
    receipt: {
      operation: "initial",
      generationSeed: 1,
      requestHash: fakeHash(`${slotId}-request`),
      parentCandidateHash: null,
      modelId: "test-model",
      createdAt: "2026-09-26T00:00:00.000Z",
    },
  };
}

function slot(slotId: string, role: SceneSlotRole, npcId: string): SceneGallerySlot {
  return {
    slotId,
    role,
    title: slotId,
    contextId,
    baseId: base.id,
    selectedCandidateId: `${slotId}-candidate`,
    candidates: [candidate(slotId, npcId)],
  };
}

function snapshot(): AuthoringSnapshot {
  const slots = [
    slot("opening", "opening", "keeper_a"),
    slot("middle", "hub", "keeper_b"),
    slot("finale", "ending", "keeper_c"),
  ];
  return {
    formatVersion: 1,
    workspaceId: "create-flow",
    draft: {
      ...emptyDraft("2026-09-26T00:00:00.000Z"),
      name: "Low Well",
      brief: "A quiet errand between two farms.",
      cartridgeId: "low-well",
      author: "tester",
      selection: selection as never,
      sceneBases: { baseIds: [base.id], rerollSeed: 1 },
    },
    gallery: {
      formatVersion: 1,
      slots,
      entrySlotId: "opening",
      endingSlotIds: ["finale"],
    },
    narrative: {
      required: false,
      premise: "Two farms and one errand between them.",
      finale: "The gate is open.",
      scenes: slots.map((one) => ({
        sceneId: one.slotId,
        title: one.title,
        summary: "",
        objective: "",
      })),
    },
    updatedAt: "2026-09-26T00:00:00.000Z",
  };
}

let root = "";
let cartridgesDir = "";
let instancesDir = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aether-create-flow-"));
  cartridgesDir = join(root, "cartridges");
  instancesDir = join(root, "instances");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("v2 Create → Forge → Play", () => {
  it("forges a three-scene cartridge, plays it to the ending and reopens where it was", async () => {
    const input = unwrap(await buildCartridge(snapshot(), resolution));
    expect(Object.keys(input.scenes).sort()).toEqual(["finale", "middle", "opening"]);
    expect(Object.keys(input.dialogues ?? {}).sort()).toEqual([
      "finale/keeper_c",
      "middle/keeper_b",
      "opening/keeper_a",
    ]);
    if (input.manifest.formatVersion !== 2) throw new Error("expected a v2 manifest");
    const plan = input.manifest.definition.scenePlan;
    expect(plan.orderedSceneIds).toEqual(["opening", "middle", "finale"]);
    expect(plan.entrySceneId).toBe("opening");
    expect(plan.endingSceneIds).toEqual(["finale"]);

    const published = await publishCartridgeRevision(cartridgesDir, input);
    if (!published.ok) throw new Error(`${published.error.code}: ${published.error.message}`);
    const manifest = published.value;
    const revision = unwrap(
      await readCartridgeRevision(cartridgesDir, manifest.cartridgeId, manifest.version),
    );
    // Every scene of the plan is on disk, with its people's words beside it.
    expect(Object.keys(revision.scenes).sort()).toEqual(["finale", "middle", "opening"]);
    expect(revision.dialogues["opening/keeper_a"]).toContain('Dialogue("keeper_a"');
    // Each scene really is its own content, not one scene written three times.
    expect(new Set(Object.values(revision.scenes)).size).toBe(3);

    const created = unwrap(await createInstance(instancesDir, manifest, "Low Well run"));
    expect(created.save.currentSceneId).toBe("opening");
    expect(created.meta.runtimePin.cartridge.contentHash).toBe(manifest.contentHash);

    const id = created.meta.instanceId;
    const middle = unwrap(await transitionInstance(cartridgesDir, instancesDir, id, "middle"));
    expect(middle.instance.save.currentSceneId).toBe("middle");
    const finale = unwrap(await transitionInstance(cartridgesDir, instancesDir, id, "finale"));
    expect(finale.instance.save.currentSceneId).toBe("finale");
    expect(finale.instance.save.completedSceneIds).toEqual(["opening", "middle"]);

    unwrap(await completeInstance(cartridgesDir, instancesDir, id));

    // Reopening (a fresh read from disk, as a relaunch does) comes back to the same place.
    const reopened = unwrap(await resolveInstance(cartridgesDir, instancesDir, id));
    expect(reopened.instance.save.currentSceneId).toBe("finale");
    expect(reopened.instance.save.completedSceneIds).toContain("finale");
    expect(reopened.cartridge.dialogues["finale/keeper_c"]).toContain('Dialogue("keeper_c"');
  });

  it("does not touch an already published cartridge when a second one is forged", async () => {
    const first = unwrap(
      await publishCartridgeRevision(
        cartridgesDir,
        unwrap(await buildCartridge(snapshot(), resolution)),
      ),
    );
    const other = snapshot();
    other.draft.cartridgeId = "high-well";
    other.draft.name = "High Well";
    unwrap(
      await publishCartridgeRevision(
        cartridgesDir,
        unwrap(await buildCartridge(other, resolution)),
      ),
    );
    const reread = unwrap(
      await readCartridgeRevision(cartridgesDir, first.cartridgeId, first.version),
    );
    expect(reread.manifest.contentHash).toBe(first.contentHash);
  });
});
