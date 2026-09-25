// Baking voices at author time: one written conversation per NPC of every selected scene, kept on
// the candidate and carried into the published cartridge. A failure is reported, never papered
// over with a line nobody wrote.

import { compileCapabilities } from "@shared/capabilities";
import { BUILTIN_MODULES } from "@shared/capability-modules";
import { emptyDraft } from "@shared/game-definition";
import { requirementsFor } from "@shared/mode-catalog";
import { rollBases } from "@shared/scene-bases";
import type { AuthoringSnapshot, SceneCandidate, SceneGallerySlot } from "@shared/scene-gallery";
import { beforeEach, describe, expect, it, vi } from "vitest";

const chat = vi.fn();
vi.mock("@renderer/llm/client", () => ({ chat: (...args: unknown[]) => chat(...args) }));
vi.mock("@renderer/llm", () => ({ chat: (...args: unknown[]) => chat(...args) }));

const { bakeVoices } = await import("@renderer/narrative/voices");
const { buildCartridge } = await import("@renderer/narrative/forge");

const base = rollBases(1)[0];
const selection = { genres: ["adventure_rpg"], timings: [], structures: [], settings: [] };
const resolution = compileCapabilities({
  requirements: requirementsFor(selection as never),
  modules: BUILTIN_MODULES,
  overrides: {},
  accepted: {},
});

const DIALOGUE = [
  'root = Dialogue("keeper", "The gate sticks after rain.", [c1])',
  'c1 = Choice("Thank her", "leave", "She goes back to the fence.", [])',
].join("\n");

function sceneSource(slotId: string, withNpc: boolean): string {
  const ids = ["ground", "sky1", "sun1", withNpc ? "keeper" : null, "task", "way"].filter(
    (one) => one !== null,
  );
  return [
    `root = Scene("${slotId}", "meadow", [${ids.join(", ")}])`,
    'ground = Floor(12, 12, "grass")',
    'sky1 = Sky("#9fc7ff", "#cfe3ff", 0.03)',
    'sun1 = Light("sun", "#fff3d0", 1.4)',
    withNpc ? 'keeper = NPC("keeper", "Keeper", 3, 4, "elder", "calm", "#d8c9a3")' : null,
    'task = Quest("open_the_gate", "Open the gate before dusk.")',
    'way = Exit(10, 10, "Onward")',
    "",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function candidate(slotId: string, contextId: string, withNpc = true): SceneCandidate {
  return {
    candidateId: `${slotId}-candidate`,
    slotId,
    contextId,
    baseId: base?.id ?? "reactor_deck",
    title: slotId,
    sceneSource: sceneSource(slotId, withNpc),
    contentHash: `sha256:${slotId}`,
    status: "ready",
    staleReason: null,
    dialogues: {},
    receipt: {
      operation: "initial",
      generationSeed: 1,
      requestHash: `sha256:${slotId}-request`,
      parentCandidateHash: null,
      modelId: "test-model",
      createdAt: "2026-09-26T00:00:00.000Z",
    },
  };
}

function slot(slotId: string, withNpc = true): SceneGallerySlot {
  const contextId = resolution.contexts[0]?.contextId ?? "main";
  return {
    slotId,
    role: "ending",
    title: slotId,
    contextId,
    baseId: base?.id ?? "reactor_deck",
    selectedCandidateId: `${slotId}-candidate`,
    candidates: [candidate(slotId, contextId, withNpc)],
  };
}

function snapshotOf(slots: SceneGallerySlot[]): AuthoringSnapshot {
  return {
    formatVersion: 1,
    workspaceId: "create-voices",
    draft: {
      ...emptyDraft("2026-09-26T00:00:00.000Z"),
      name: "Voices",
      brief: "A quiet errand.",
      cartridgeId: "voices-cartridge",
      author: "tester",
      selection: selection as never,
      sceneBases: { baseIds: [base?.id ?? ""], rerollSeed: 1 },
    },
    gallery: {
      formatVersion: 1,
      slots,
      entrySlotId: slots[0]?.slotId ?? null,
      endingSlotIds: slots.length > 0 ? [slots[slots.length - 1]?.slotId ?? ""] : [],
    },
    narrative: null,
    updatedAt: "2026-09-26T00:00:00.000Z",
  };
}

beforeEach(() => {
  chat.mockReset();
});

describe("bakeVoices", () => {
  it("writes one conversation per NPC of every selected scene", async () => {
    chat.mockResolvedValue({ ok: true, value: { text: DIALOGUE, usage: null, toolCalls: [] } });
    const result = await bakeVoices([slot("scene-1")], { language: "en-US", intent: "errand" });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value["scene-1"]?.keeper).toContain('Dialogue("keeper"');
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it("reports the person and scene when the model cannot write one", async () => {
    chat.mockResolvedValue({ ok: false, error: { code: "chat-failed", message: "no model" } });
    const result = await bakeVoices([slot("scene-1")], { language: "en-US", intent: "errand" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("Keeper");
  });

  it("refuses when no selected scene has anyone in it, instead of baking nothing quietly", async () => {
    const result = await bakeVoices([slot("scene-1", false)], {
      language: "en-US",
      intent: "errand",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("voices-no-npcs");
    expect(chat).not.toHaveBeenCalled();
  });

  it("keeps voices already written and only asks for the missing ones", async () => {
    chat.mockResolvedValue({ ok: true, value: { text: DIALOGUE, usage: null, toolCalls: [] } });
    const first = slot("scene-1");
    const done = {
      ...first,
      candidates: first.candidates.map((one) => ({ ...one, dialogues: { keeper: DIALOGUE } })),
    };
    const result = await bakeVoices([done, slot("scene-2")], {
      language: "en-US",
      intent: "errand",
    });
    expect(result.ok).toBe(true);
    expect(chat).toHaveBeenCalledTimes(1);
  });
});

describe("buildCartridge with baked voices", () => {
  it("carries them into the publish input keyed by scene and npc", async () => {
    const one = slot("scene-1");
    const voiced: SceneGallerySlot = {
      ...one,
      candidates: one.candidates.map((candidate) => ({
        ...candidate,
        dialogues: { keeper: DIALOGUE },
      })),
    };
    const built = await buildCartridge(snapshotOf([voiced]), resolution);
    if (!built.ok) throw new Error(`${built.error.code}: ${built.error.message}`);
    expect(built.value.dialogues?.["scene-1/keeper"]).toBe(DIALOGUE);
  });

  it("leaves out a voice whose NPC is no longer in the scene", async () => {
    const one = slot("scene-1");
    const stale: SceneGallerySlot = {
      ...one,
      candidates: one.candidates.map((candidate) => ({
        ...candidate,
        dialogues: { someone_who_left: DIALOGUE },
      })),
    };
    const built = await buildCartridge(snapshotOf([stale]), resolution);
    if (!built.ok) throw new Error(`${built.error.code}: ${built.error.message}`);
    expect(built.value.dialogues).toEqual({});
  });
});
