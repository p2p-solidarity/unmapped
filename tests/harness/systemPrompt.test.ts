import { type AssembleContext, createHarness, type Harness, ORDER } from "@harness";
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

  it("sorts by order, then by name, and joins with a blank line", () => {
    const { systemPrompt } = harness.ctx;
    systemPrompt.section({ name: "z-context", order: ORDER.CONTEXT, text: "context" });
    systemPrompt.section({ name: "persona", order: ORDER.PERSONA, text: "persona" });
    systemPrompt.section({ name: "b-mod", order: ORDER.MOD_MIN, text: "b" });
    systemPrompt.section({ name: "a-mod", order: ORDER.MOD_MIN, text: "a" });

    const assembled = systemPrompt.assemble(ASSEMBLE);
    expect(assembled.sections).toEqual(["persona", "a-mod", "b-mod", "z-context"]);
    expect(assembled.text).toBe("persona\n\na\n\nb\n\ncontext");
  });

  it("drops sections that render empty", () => {
    const { systemPrompt } = harness.ctx;
    systemPrompt.section({ name: "kept", order: 100, text: "kept" });
    systemPrompt.section({ name: "blank", order: 200, text: "   " });
    systemPrompt.section({ name: "dynamic", order: 300, text: () => "" });

    const assembled = systemPrompt.assemble(ASSEMBLE);
    expect(assembled.sections).toEqual(["kept"]);
    expect(assembled.text).toBe("kept");
  });

  it("passes the assemble context to dynamic text", () => {
    harness.ctx.systemPrompt.section({
      name: "purpose",
      order: 100,
      text: (assemble) => `purpose=${assemble.purpose}`,
    });
    expect(harness.ctx.systemPrompt.assemble({ purpose: "resolve", language: "en" }).text).toBe(
      "purpose=resolve",
    );
  });

  it("interpolates registered variables", () => {
    const { systemPrompt } = harness.ctx;
    systemPrompt.variable("language", (assemble) => assemble.language);
    systemPrompt.section({ name: "babel", order: 100, text: "answer in {{language}}." });

    expect(systemPrompt.assemble(ASSEMBLE).text).toBe("answer in ja-JP.");
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

  it("throws a descriptive error for an unknown variable", () => {
    const { systemPrompt } = harness.ctx;
    systemPrompt.variable("language", () => "ja-JP");
    systemPrompt.section({ name: "oops", order: 100, text: "the {{floor}} floor" });

    expect(() => systemPrompt.assemble(ASSEMBLE)).toThrowError(
      /unknown prompt variable "\{\{floor\}\}" in section "oops"; registered variables: language/,
    );
  });

  it("throws when a registered variable has no value for this assembly", () => {
    const { systemPrompt } = harness.ctx;
    systemPrompt.variable("floor", () => undefined);
    systemPrompt.section({ name: "oops", order: 100, text: "floor {{floor}}" });

    expect(() => systemPrompt.assemble(ASSEMBLE)).toThrowError(/has no value for this assembly/);
  });

  it("treats a lone {{ as prose but rejects a malformed reference", () => {
    const { systemPrompt } = harness.ctx;
    systemPrompt.section({ name: "prose", order: 100, text: "braces {{ are fine here" });
    expect(systemPrompt.assemble(ASSEMBLE).text).toBe("braces {{ are fine here");

    systemPrompt.section({ name: "bad", order: 200, text: "{{ not a name }} here" });
    expect(() => systemPrompt.assemble(ASSEMBLE)).toThrowError(/malformed prompt variable/);
  });

  it("rejects a duplicate section name and an invalid variable name", () => {
    const { systemPrompt } = harness.ctx;
    systemPrompt.section({ name: "once", order: 100, text: "a" });
    expect(() => systemPrompt.section({ name: "once", order: 200, text: "b" })).toThrowError(
      /"once" is already registered/,
    );
    expect(() => systemPrompt.variable("Language", () => "x")).toThrowError(
      /invalid prompt variable name/,
    );
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
