import { applyWorkReply, parseWorkReply } from "@shared/workEdits";
import { repairWorkMessages, retryWorkMessages, WORK_ECHO_CHARS } from "@shared/workPrompt";
import type { WorkText } from "@shared/works";
import { describe, expect, it } from "vitest";

const BASE: WorkText = {
  main: "const RULES = { target: 21 };\nhost.root.textContent = 'hi';\n",
  style: "body { background: black; }\n",
  assets: '{"hero": {"src": "library/ninja_blue.png", "note": "player"}}',
};

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe("work reply protocol", () => {
  it("builds a new world from whole files, dropping stray fences", () => {
    const reply = unwrap(
      parseWorkReply(
        "@@summary\nA maze.\n@@file main.js\n```js\nhost.root.textContent = 'x';\n```\n@@file style.css\nbody{}\n@@file assets.json\n{}\n@@end\ntrailing chatter",
      ),
    );
    const applied = unwrap(applyWorkReply(null, reply));
    expect(applied.summary).toBe("A maze.");
    expect(applied.text.main).toBe("host.root.textContent = 'x';");
    expect(applied.changed).toEqual(["main.js", "style.css", "assets.json"]);
  });

  it("changes one rule with a SEARCH/REPLACE block and touches nothing else", () => {
    const reply = unwrap(
      parseWorkReply(
        "@@summary\nTarget is 20.\n@@edit main.js\n<<<<<<< SEARCH\nconst RULES = { target: 21 };\n=======\nconst RULES = { target: 20 };\n>>>>>>> REPLACE\n@@end",
      ),
    );
    const applied = unwrap(applyWorkReply(BASE, reply));
    expect(applied.changed).toEqual(["main.js"]);
    expect(applied.text.main).toContain("target: 20");
    expect(applied.text.style).toBe(BASE.style);
    expect(applied.text.assets).toBe(BASE.assets);
  });

  it("swaps an image by editing assets.json only", () => {
    const reply = unwrap(
      parseWorkReply(
        '@@summary\nGreen hero.\n@@edit assets.json\n<<<<<<< SEARCH\n"library/ninja_blue.png"\n=======\n"library/samurai_green.png"\n>>>>>>> REPLACE\n@@end',
      ),
    );
    const applied = unwrap(applyWorkReply(BASE, reply));
    expect(applied.changed).toEqual(["assets.json"]);
  });

  it("returns actionable errors the repair prompt can use", () => {
    const miss = unwrap(
      parseWorkReply(
        "@@edit main.js\n<<<<<<< SEARCH\nconst NOPE = 1;\n=======\nconst NOPE = 2;\n>>>>>>> REPLACE\n@@end",
      ),
    );
    const missing = applyWorkReply(BASE, miss);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.message).toContain("SEARCH text not found");

    const badAsset = unwrap(
      parseWorkReply(
        '@@file assets.json\n{"hero": {"src": "../../etc/passwd", "note": ""}}\n@@end',
      ),
    );
    expect(applyWorkReply(BASE, badAsset).ok).toBe(false);

    const moduleCode = unwrap(parseWorkReply("@@file main.js\nimport x from 'y';\n@@end"));
    expect(applyWorkReply(BASE, moduleCode).ok).toBe(false);

    expect(parseWorkReply("just prose, no sections").ok).toBe(false);
    expect(parseWorkReply("@@file ../main.js\nx\n@@end").ok).toBe(false);
  });

  it("a repair must patch with @@edit: a whole-file rewrite is refused, an edit applies", () => {
    const rewrite = unwrap(
      parseWorkReply("@@summary\nFixed.\n@@file main.js\nconst RULES = { target: 20 };\n@@end"),
    );
    const refused = applyWorkReply(BASE, rewrite, { mode: "repair" });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error.code).toBe("repair-whole-file");
      expect(refused.error.message).toContain("@@edit main.js");
    }
    // The same reply is fine outside a repair.
    expect(applyWorkReply(BASE, rewrite, { mode: "edit" }).ok).toBe(true);

    const patch = unwrap(
      parseWorkReply(
        "@@summary\nFixed.\n@@edit main.js\n<<<<<<< SEARCH\ntarget: 21\n=======\ntarget: 20\n>>>>>>> REPLACE\n@@end",
      ),
    );
    const applied = unwrap(applyWorkReply(BASE, patch, { mode: "repair" }));
    expect(applied.text.main).toContain("target: 20");
    expect(applied.changed).toEqual(["main.js"]);

    // An empty file has nothing to SEARCH, so a repair may still write it whole.
    const style = unwrap(parseWorkReply("@@file style.css\nbody { margin: 0; }\n@@end"));
    expect(applyWorkReply({ ...BASE, style: "" }, style, { mode: "repair" }).ok).toBe(true);
  });

  it("reports changed files against the stored parent, not a salvaged base", () => {
    const patch = unwrap(
      parseWorkReply(
        '@@edit assets.json\n<<<<<<< SEARCH\n"player"\n=======\n"hero"\n>>>>>>> REPLACE\n@@end',
      ),
    );
    const applied = unwrap(applyWorkReply(BASE, patch, { mode: "repair", parent: null }));
    expect(applied.changed).toEqual(["main.js", "style.css", "assets.json"]);
  });
});

describe("repair and retry turns", () => {
  it("lists each distinct problem once and forbids whole files", () => {
    const [system, user] = repairWorkMessages(BASE, [
      "main.js:3:1 TypeError: x is not iterable",
      "main.js:3:1 TypeError: x is not iterable",
    ]);
    expect(system?.content).toContain("@@file is rejected in a repair");
    expect(user?.content.match(/x is not iterable/g)?.length).toBe(1);
  });

  it("echoes a short failed reply but never re-sends a whole world", () => {
    const turn = repairWorkMessages(BASE, ["main.js:1 boom"]);
    const short = retryWorkMessages(turn, "@@edit main.js\n...", "SEARCH text not found", "repair");
    expect(short.length).toBe(turn.length + 2);
    expect(short.at(-2)?.role).toBe("assistant");

    const world = `@@file main.js\n${"x".repeat(WORK_ECHO_CHARS + 1)}`;
    const long = retryWorkMessages(turn, world, "A repair must not resend main.js", "repair");
    expect(long.length).toBe(turn.length + 1);
    expect(long.some((message) => message.content.includes("x".repeat(100)))).toBe(false);
    expect(long.at(-1)?.content).toContain("@@edit SEARCH/REPLACE blocks only");
  });
});
