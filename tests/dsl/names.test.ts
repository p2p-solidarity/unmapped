// Malformed model output that the OpenUI parser drops without an error (Rule 7): a statement named
// in another script. Found in the rev 6 E2E run, where a zh-TW origin wrote `阿潮 = NPC(...)` three
// times and Build failed on "0 residents" because the repair round never said why.
//   1. A statement named in another script is skipped, so its entity silently disappears.
//   2. The refusal does not name the statement, so a repair round cannot fix it.
//   3. A line inside a quoted string that happens to contain "=" is mistaken for a statement.

import { parseScene } from "@dsl/index";
import { describe, expect, it } from "vitest";

const program = (name: string) => `root = Scene("A", "meadow", [floor, sun, ${name}, ok1])
floor = Floor(16, 16, "grass")
sun = Light("sun", "#fff3d6", 1.2)
${name} = NPC("a_chao", "阿潮", 6, 12, "merchant", "calm", "#6c7a7b")
ok1 = NPC("b", "B = C", 3, 3, "merchant", "calm", "#6c7a7b")`;

describe("statement names", () => {
  it("refuses a statement named in another script, by name (1, 2)", () => {
    const parsed = parseScene(program("阿潮"));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe("dsl-invalid-name");
    expect(parsed.error.message).toContain("阿潮");
    expect(parsed.error.errors[0]?.message).toContain("阿潮");
  });

  it("keeps an ascii program, even with = inside a string (3)", () => {
    const parsed = parseScene(program("a_chao"));
    expect(parsed.ok && parsed.value.npcs.map((npc) => npc.id)).toEqual(["a_chao", "b"]);
  });
});
