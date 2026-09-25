// "design-review-invalid: expected one of timing|network|…": one question with a category outside
// the list used to discard the whole interview. Valid questions must survive a bad neighbour, and
// the tool schema handed to the model must build at all (z.custom used to throw on import).

import { compileCapabilities } from "@shared/capabilities";
import { BUILTIN_MODULES } from "@shared/capability-modules";
import { beforeEach, describe, expect, it, vi } from "vitest";

const chat = vi.fn();
vi.mock("@renderer/llm", () => ({ chat: (...args: unknown[]) => chat(...args) }));

const { generateDesignReview } = await import("@renderer/narrative/designInterview");

const resolution = compileCapabilities({
  requirements: [],
  modules: BUILTIN_MODULES,
  overrides: {},
  accepted: {},
});

const option = (id: string) => ({ id, label: id, description: id, patches: [] });
const question = (id: string, category: string) => ({
  id,
  category,
  question: "?",
  required: false,
  affects: [],
  multiSelect: false,
  options: [option("a"), option("b")],
});

function answer(body: unknown): void {
  chat.mockResolvedValueOnce({
    ok: true,
    value: {
      text: "",
      usage: null,
      toolCalls: [{ name: "propose_design_review", arguments: JSON.stringify(body) }],
    },
  });
}

beforeEach(() => chat.mockReset());

describe("design interview", () => {
  it("sends the model a real schema, including the allowed categories", async () => {
    answer({ questions: [question("q1", "physics")], suggestions: [] });
    await generateDesignReview(resolution, [], "en");
    const tool = chat.mock.calls[0]?.[0].tools[0];
    expect(JSON.stringify(tool.parameters)).toContain('"physics"');
  });

  it("keeps the valid questions when one has an unknown category", async () => {
    answer({
      questions: [question("good", "camera"), question("bad", "aim_feel")],
      suggestions: [],
    });
    const result = await generateDesignReview(resolution, [], "en");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.questions.map((one) => one.id)).toEqual(["good"]);
  });

  it("drops a suggestion that pins a capability no installed module provides", async () => {
    const suggestion = (id: string, value: string) => ({
      id,
      title: id,
      rationale: id,
      patches: [{ type: "set_capability", key: "ui", value }],
    });
    answer({
      questions: [],
      suggestions: [
        suggestion("real", "inspect_hotspot"),
        suggestion("invented", "target_preview"),
      ],
    });
    const result = await generateDesignReview(resolution, [], "en");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.suggestions.map((one) => one.id)).toEqual(["real"]);
  });

  it("is an error only when nothing in the answer is usable", async () => {
    answer({ questions: [question("bad", "aim_feel")], suggestions: [] });
    const result = await generateDesignReview(resolution, [], "en");
    expect(result.ok).toBe(false);
  });
});
