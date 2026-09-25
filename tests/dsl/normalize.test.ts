import { normalizeOutput, parseScene } from "@dsl/index";
import { describe, expect, it } from "vitest";
import { fixture } from "./fixtures";

describe("normalizeOutput", () => {
  it("strips a fenced block with a language tag", () => {
    const raw = ["Here you go:", "```openui", 'root = Scene("A", "meadow", [f])', "```"].join("\n");
    expect(normalizeOutput(raw)).toBe('root = Scene("A", "meadow", [f])');
  });

  it("strips a fenced block without a language tag", () => {
    const raw = [
      "```",
      'root = Item("a", "A", "tool", 1, "p", null, ["shaft_long"], ["x"], "f")',
      "```",
      "",
      "Enjoy.",
    ].join("\n");
    expect(normalizeOutput(raw)).toContain('root = Item("a"');
    expect(normalizeOutput(raw)).not.toContain("```");
    expect(normalizeOutput(raw)).not.toContain("Enjoy.");
  });

  it("drops <think> blocks, including a dangling one", () => {
    const closed = '<think>let me plan the floor</think>\nroot = Scene("A", "meadow", [f])';
    expect(normalizeOutput(closed)).toBe('root = Scene("A", "meadow", [f])');

    const bare = 'planning...\n</think>\nroot = Scene("B", "meadow", [f])';
    expect(normalizeOutput(bare)).toBe('root = Scene("B", "meadow", [f])');

    const dangling = 'root = Scene("C", "meadow", [f])\n<think>wait, maybe';
    expect(normalizeOutput(dangling)).toBe('root = Scene("C", "meadow", [f])');
  });

  it("keeps a bare program untouched", () => {
    const program = 'root = Scene("A", "meadow", [f])\nf = Floor(8, 8, "grass")';
    expect(normalizeOutput(program)).toBe(program);
  });

  it("is applied by parseScene, so fences and thinking still parse", () => {
    const result = parseScene(fixture("fenced-scene.oui"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("Quiet Field");
    expect(result.value.floor).toEqual({ width: 12, depth: 12, tile: "grass" });
    expect(result.value.exits[0]?.to).toBe("Stair of Soft Rain");
  });
});
