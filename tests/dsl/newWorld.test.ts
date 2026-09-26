import { ORIGIN_EXAMPLE, originIssues, parseBible, parseScene } from "@dsl/index";
import { describe, expect, it } from "vitest";

describe("new world", () => {
  // A prompt example that does not parse, or is itself unfit, teaches the model to fail.
  it("shows the model an origin example that parses and is fit to start in", () => {
    const example = parseScene(ORIGIN_EXAMPLE);
    if (!example.ok) throw new Error(example.error.message);
    expect(originIssues(example.value)).toEqual([]);
  });

  // Apple's bridge writes the bible's literals with JSON escapes (ChatProgram.swift). A quote or a
  // backslash in the model's words must neither break the program nor change the words.
  it("reads a bible written with JSON escapes back as the model's own words", () => {
    const written = String.raw`root = Bible("他說\"風\"來了\\路", "靜", ["a \"b\"", "c\\d", "e/f"], ["x", "y"], "n", "v", "l")`;
    const bible = parseBible(written);
    if (!bible.ok) throw new Error(bible.error.message);
    expect(bible.value.premise).toBe('他說"風"來了\\路');
    expect(bible.value.rules).toEqual(['a "b"', "c\\d", "e/f"]);
  });

  it("sends back an origin that walls in its edges or brings monsters", () => {
    const walled = parseScene(`root = Scene("Edge", "countryside", [ground, sun1, wall1, ren, boar])
ground = Floor(14, 14, "grass")
sun1 = Light("sun", "#fff3d6", 1.2)
wall1 = Wall(0, 0, 14, 2, "wood")
ren = NPC("ren", "Ren", 5, 5, "farmer", "calm", "#aa8866")
boar = Monster("boar", "slime", 9, 9, 1, "bells")`);
    if (!walled.ok) throw new Error(walled.error.message);
    const complaints = originIssues(walled.value)
      .map((issue) => issue.message)
      .join(" ");
    expect(complaints).toContain("touch the floor's edge");
    expect(complaints).toContain("monsters");
  });
});
