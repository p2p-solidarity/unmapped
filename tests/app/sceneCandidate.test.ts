// A Scene Gallery candidate is a model output that survived the DSL parser and the fit checks.
// There is no deterministic stand-in any more, so the two things worth proving are: a good answer
// becomes a candidate with a real receipt, and a bad one becomes an error after the repair rounds
// rather than a scene nobody asked for.

import { compileCapabilities } from "@shared/capabilities";
import { BUILTIN_MODULES } from "@shared/capability-modules";
import { emptyDraft } from "@shared/game-definition";
import { requirementsFor } from "@shared/mode-catalog";
import { rollBases, type SceneBase } from "@shared/scene-bases";
import type { SceneGallerySlot } from "@shared/scene-gallery";
import { beforeEach, describe, expect, it, vi } from "vitest";

const chat = vi.fn();
vi.mock("@renderer/llm/client", () => ({ chat: (...args: unknown[]) => chat(...args) }));
vi.mock("@renderer/llm", () => ({ chat: (...args: unknown[]) => chat(...args) }));

const { generateSceneCandidate } = await import("@renderer/narrative/sceneCandidate");
const { generateCandidateSet } = await import("@renderer/narrative/candidates");

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
const profile = resolution.contexts[0]?.profile ?? { entries: [] };

const slot: SceneGallerySlot = {
  slotId: "scene-1",
  role: "opening",
  title: "The first field",
  contextId: resolution.contexts[0]?.contextId ?? "main",
  baseId: base.id,
  selectedCandidateId: null,
  candidates: [],
};

function request(overrides: Record<string, unknown> = {}) {
  return {
    slot,
    base,
    profile,
    draft: {
      ...emptyDraft("2026-09-26T00:00:00.000Z"),
      name: "Low Well",
      brief: "A quiet errand between two farms.",
      selection: selection as never,
    },
    position: 1,
    total: 1,
    terminal: true,
    language: "en-US",
    seed: 7,
    operation: "initial" as const,
    ...overrides,
  };
}

/** What a cooperating model would answer for this space. */
function goodScene(): string {
  const props = Array.from(
    { length: 6 },
    (_, index) => `p${index} = Prop("rock", ${index + 1}, 1, 1)`,
  );
  const ids = props.map((_, index) => `p${index}`);
  return [
    `root = Scene("Low Field", "${base.biome}", [ground, sky1, sun1, keeper, crate, task, way, ${ids.join(", ")}])`,
    `ground = Floor(${base.width}, ${base.depth}, "${base.tile}")`,
    'sky1 = Sky("#9fc7ff", "#cfe3ff", 0.03)',
    'sun1 = Light("sun", "#fff3d0", 1.4)',
    'keeper = NPC("keeper", "Keeper", 2, 3, "elder", "calm", "#d8c9a3")',
    'crate = Treasure("crate_a", 4, 7, ["rope"])',
    'task = Quest("open_the_gate", "Open the gate before dusk.")',
    'way = Exit(6, 6, "Onward")',
    ...props,
  ].join("\n");
}

/** A scene that parses but ignores the space: wrong extent, nobody in it, no point to it. */
function unfitScene(): string {
  return [
    'root = Scene("Elsewhere", "meadow", [ground, sky1, way])',
    'ground = Floor(7, 7, "stone")',
    'sky1 = Sky("#9fc7ff", "#cfe3ff", 0.03)',
    'way = Exit(5, 5, "Onward")',
  ].join("\n");
}

function answers(text: string): void {
  chat.mockResolvedValue({ ok: true, value: { text, usage: null, toolCalls: [] } });
}

beforeEach(() => {
  chat.mockReset();
});

describe("generateSceneCandidate", () => {
  it("turns a fitting model answer into a candidate with a receipt", async () => {
    answers(goodScene());
    const result = await generateSceneCandidate(request());
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    expect(result.value.slotId).toBe("scene-1");
    expect(result.value.sceneSource).toContain('NPC("keeper"');
    expect(result.value.dialogues).toEqual({});
    expect(result.value.receipt.operation).toBe("initial");
    expect(result.value.receipt.generationSeed).toBe(7);
  });

  it("gives up with the fit complaints instead of inventing a scene", async () => {
    answers(unfitScene());
    const result = await generateSceneCandidate(request());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("dsl-candidate-unfit");
      expect(result.error.message).toContain("repair");
    }
    // One first attempt plus the two repair rounds; nothing beyond that.
    expect(chat).toHaveBeenCalledTimes(3);
  });

  it("passes the transport failure straight through when no model answers", async () => {
    chat.mockResolvedValue({
      ok: false,
      error: { code: "inference-unreachable", message: "no model" },
    });
    const result = await generateSceneCandidate(request());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("inference-unreachable");
  });
});

describe("generateCandidateSet", () => {
  it("returns every alternative that came back", async () => {
    answers(goodScene());
    const result = await generateCandidateSet(request(), 3);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value).toHaveLength(3);
    // Different seeds, so the receipts are distinguishable even when the text repeats.
    expect(new Set(result.value.map((one) => one.receipt.generationSeed)).size).toBe(3);
  });

  it("fails when nothing could be generated", async () => {
    chat.mockResolvedValue({ ok: false, error: { code: "inference-unreachable", message: "no" } });
    const result = await generateCandidateSet(request(), 2);
    expect(result.ok).toBe(false);
  });
});
