import {
  addSlot,
  duplicateCandidate,
  markGalleryStale,
  moveSlot,
  removeSlot,
  type SceneCandidate,
  type SceneGalleryState,
  selectCandidate,
  setSlotContext,
} from "@shared/scene-gallery";
import { describe, expect, it } from "vitest";

function candidate(candidateId: string, slotId: string): SceneCandidate {
  return {
    candidateId,
    slotId,
    contextId: "ctx-fps",
    baseId: "reactor_deck",
    title: candidateId,
    sceneSource: "root = Scene()",
    contentHash: "sha256:candidate",
    status: "ready",
    staleReason: null,
    dialogues: {},
    receipt: {
      operation: "initial",
      generationSeed: 1,
      requestHash: "sha256:request",
      parentCandidateHash: null,
      modelId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

function gallery(): SceneGalleryState {
  return {
    formatVersion: 1,
    slots: [
      {
        slotId: "opening",
        role: "opening",
        title: "Opening",
        contextId: "ctx-fps",
        baseId: "reactor_deck",
        selectedCandidateId: "a",
        candidates: [candidate("a", "opening")],
      },
      {
        slotId: "ending",
        role: "ending",
        title: "Ending",
        contextId: "ctx-fps",
        baseId: "reactor_deck",
        selectedCandidateId: "b",
        candidates: [candidate("b", "ending")],
      },
    ],
    entrySlotId: "opening",
    endingSlotIds: ["ending"],
  };
}

describe("scene gallery operations", () => {
  it("keeps entry and ending references valid while slots move and disappear", () => {
    const moved = moveSlot(gallery(), "ending", 0);
    expect(moved.slots.map((slot) => slot.slotId)).toEqual(["ending", "opening"]);
    expect(moved.entrySlotId).toBe("opening");

    const removed = removeSlot(moved, "opening");
    expect(removed.entrySlotId).toBe("ending");
    expect(removed.endingSlotIds).toEqual(["ending"]);
  });

  it("duplicates only the requested candidate and selects explicitly", () => {
    const copied = duplicateCandidate(gallery(), "opening", "a", "copy");
    expect(copied.slots[0]?.candidates.map((one) => one.candidateId)).toEqual(["a", "copy"]);
    expect(copied.slots[1]?.candidates).toHaveLength(1);
    expect(selectCandidate(copied, "opening", "copy").slots[0]?.selectedCandidateId).toBe("copy");
  });

  it("marks candidates stale without deleting authored work", () => {
    const stale = markGalleryStale(gallery(), ["opening"], "modes_changed");
    expect(stale.slots[0]?.candidates[0]).toMatchObject({
      status: "stale",
      staleReason: "modes_changed",
    });
    expect(stale.slots[1]?.candidates[0]?.status).toBe("ready");
  });

  it("creates a slot with an explicit capability context", () => {
    const next = addSlot(gallery(), {
      slotId: "boss",
      role: "boss",
      title: "Boss",
      contextId: "ctx-side",
      baseId: "reactor_deck",
    });
    expect(next.slots[2]).toMatchObject({ contextId: "ctx-side", candidates: [] });
  });

  it("clears candidates when a slot switches capability context", () => {
    const next = setSlotContext(gallery(), "opening", "ctx-side");
    expect(next.slots[0]).toMatchObject({
      contextId: "ctx-side",
      selectedCandidateId: null,
      candidates: [],
    });
    expect(next.slots[1]).toEqual(gallery().slots[1]);
  });
});
