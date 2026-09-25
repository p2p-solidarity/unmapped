import { type AssembleContext, createHarness, type Harness } from "@harness";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ASSEMBLE: AssembleContext = { purpose: "free", language: "ja-JP" };

describe("ctx.systemPrompt", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  afterEach(async () => {
    await harness.dispose();
  });

  it("leaves literal text alone when interpolate is false", () => {
    harness.ctx.systemPrompt.section({
      name: "literal",
      order: 100,
      text: "an NPC called {{weird}}",
      interpolate: false,
    });
    expect(harness.ctx.systemPrompt.assemble(ASSEMBLE).text).toBe("an NPC called {{weird}}");
  });

  it("removes a section and a variable when their disposers run", () => {
    const { systemPrompt } = harness.ctx;
    const dropSection = systemPrompt.section({ name: "gone", order: 100, text: "{{tone}}" });
    const dropVariable = systemPrompt.variable("tone", () => "warm");
    expect(systemPrompt.assemble(ASSEMBLE).text).toBe("warm");

    dropSection();
    dropVariable();
    expect(systemPrompt.assemble(ASSEMBLE)).toEqual({ text: "", sections: [] });
    // Re-registering the same name is what a remount does.
    expect(() => systemPrompt.section({ name: "gone", order: 100, text: "again" })).not.toThrow();
  });
});
