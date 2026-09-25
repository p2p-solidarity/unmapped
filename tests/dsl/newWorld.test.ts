import { originIssues, parseScene } from "@dsl/index";
import { describe, expect, it } from "vitest";

describe("new world", () => {
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
