// "forge-scenes-incomplete": rerolling a scene cleared its selection, and Forge refused. Forge now
// fills in what was left undecided — a selection, an entry, an ending — and must then build.
//
// `readyForForge` never calls the model: a slot with no candidate at all stays empty, and Forge
// reports that instead of inventing a scene (Rule 2).

import { compileCapabilities } from "@shared/capabilities";
import { BUILTIN_MODULES } from "@shared/capability-modules";
import { emptyDraft } from "@shared/game-definition";
import { requirementsFor } from "@shared/mode-catalog";
import { rollBases } from "@shared/scene-bases";
import {
  type AuthoringSnapshot,
  emptyGallery,
  replaceCandidates,
  type SceneCandidate,
} from "@shared/scene-gallery";
import { describe, expect, it, vi } from "vitest";

vi.mock("@renderer/llm", () => ({ chat: vi.fn() }));

const { buildCartridge } = await import("@renderer/narrative/forge");
const { defaultSlots, readyForForge } = await import("@renderer/narrative/ui/createModel");

const base = rollBases(1)[0];
const selection = { genres: ["first_person_shooter"], timings: [], structures: [], settings: [] };
const resolution = compileCapabilities({
  requirements: requirementsFor(selection as never),
  modules: BUILTIN_MODULES,
  overrides: {},
  accepted: {},
});

/** A scene the model could plausibly have written for this slot, without asking one. */
function sceneSource(slotId: string): string {
  return [
    `root = Scene("${slotId}", "meadow", [ground, sky1, sun1, keeper, chest, task, way])`,
    'ground = Floor(12, 12, "grass")',
    'sky1 = Sky("#9fc7ff", "#cfe3ff", 0.03)',
    'sun1 = Light("sun", "#fff3d0", 1.4)',
    'keeper = NPC("keeper", "Keeper", 3, 4, "elder", "calm", "#d8c9a3")',
    'chest = Treasure("crate_a", 8, 3, ["rope"])',
    'task = Quest("open_the_gate", "The keeper wants the gate open before dusk.")',
    'way = Exit(10, 10, "Onward")',
    "",
  ].join("\n");
}

function candidate(slotId: string, contextId: string, index: number): SceneCandidate {
  return {
    candidateId: `candidate-${index}`,
    slotId,
    contextId,
    baseId: base?.id ?? "reactor_deck",
    title: `Scene ${index}`,
    sceneSource: sceneSource(slotId),
    contentHash: `sha256:candidate-${index}`,
    status: "ready",
    staleReason: null,
    dialogues: {},
    receipt: {
      operation: "reroll_slot",
      generationSeed: index,
      requestHash: `sha256:request-${index}`,
      parentCandidateHash: null,
      modelId: "test-model",
      createdAt: "2026-09-26T00:00:00.000Z",
    },
  };
}

function freshSnapshot(): AuthoringSnapshot {
  const draft = emptyDraft("2026-09-26T00:00:00.000Z");
  if (base === undefined) throw new Error("no scene base");
  return {
    formatVersion: 1,
    workspaceId: "create-test",
    draft: {
      ...draft,
      name: "Test",
      brief: "A quiet errand in a field.",
      cartridgeId: "test-cartridge",
      author: "tester",
      selection: selection as never,
      sceneBases: { baseIds: [base.id], rerollSeed: 1 },
    },
    gallery: emptyGallery(),
    narrative: null,
    updatedAt: "2026-09-26T00:00:00.000Z",
  };
}

describe("readyForForge", () => {
  it("turns a rerolled, unselected scene with no ending into a cartridge that builds", async () => {
    if (base === undefined) throw new Error("no scene base");
    const seeded = defaultSlots(freshSnapshot(), resolution, base);
    const slot = seeded.gallery.slots[0];
    if (slot === undefined) throw new Error("no default slot");
    const candidates = [
      candidate(slot.slotId, slot.contextId, 1),
      candidate(slot.slotId, slot.contextId, 2),
    ];
    // Exactly the state a reroll left behind: candidates, no selection. Also drop the ending.
    const broken: AuthoringSnapshot = {
      ...seeded,
      gallery: { ...replaceCandidates(seeded.gallery, slot.slotId, candidates), endingSlotIds: [] },
    };
    expect((await buildCartridge(broken, resolution)).ok).toBe(false);

    const ready = readyForForge(broken, resolution, base);
    const built = await buildCartridge(ready, resolution);
    if (!built.ok) throw new Error(`${built.error.code}: ${built.error.message}`);
    expect(ready.gallery.slots[0]?.selectedCandidateId).toBe(candidates[0]?.candidateId);
  });

  it("leaves a slot with no candidate alone, and Forge says the scenes are incomplete", async () => {
    if (base === undefined) throw new Error("no scene base");
    const seeded = defaultSlots(freshSnapshot(), resolution, base);
    const ready = readyForForge(seeded, resolution, base);
    expect(ready.gallery.slots).toHaveLength(1);
    expect(ready.gallery.slots[0]?.selectedCandidateId).toBeNull();
    const built = await buildCartridge(ready, resolution);
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error.code).toBe("forge-scenes-incomplete");
  });
});
