import { applyWorkReply, parseWorkReply } from "@shared/workEdits";
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
});
