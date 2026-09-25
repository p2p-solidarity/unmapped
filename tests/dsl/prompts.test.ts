import { repairPrompt } from "@dsl/index";
import { parseScene } from "@dsl/parse/scene";
import { describe, expect, it } from "vitest";
import { fixture } from "./fixtures";

describe("repairPrompt", () => {
  it("lists every failing statement id, hint and the program itself", () => {
    const source = fixture("unknown-component.oui");
    const result = parseScene(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const prompt = repairPrompt(source, result.error);
    expect(prompt).toContain("wizard1");
    expect(prompt).toContain("Wizard");
    expect(prompt).toContain(result.error.code);
    expect(prompt).toContain("Available components");
    expect(prompt).toContain('ground = Floor(10, 10, "grass")');
    expect(prompt).toContain("COMPLETE corrected program");
  });

  it("lists unresolved and orphaned names", () => {
    const source = 'root = Scene("Gap", "meadow", [ground, ghost])\nground = Floor(8, 8, "grass")';
    const result = parseScene(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const prompt = repairPrompt(source, result.error);
    expect(prompt).toContain("Referenced but never defined");
    expect(prompt).toContain("- ghost");
  });
});
