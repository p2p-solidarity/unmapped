// What a small local model gets wrong in one program, and what the parser must do about it. The
// programs are shaped like Qwen 3.5 4B's origin answers on llama.cpp
// (docs/e2e/milestone-rev6-p4-no-servers, q-model-outputs.txt), where 7 of 7 Create builds failed.
//
// How this can fail (written before the code; each test names the failure it guards):
//  F1  A placeholder ("none", "", "null") in an optional argument the field cannot hold fails the
//      whole statement instead of reading as the argument left out.
//  F2  A placeholder that is a real value of the field (hat "none") is thrown away, so the role's
//      default hat appears where the model asked for none.
//  F3  A placeholder in a required argument is guessed (a colour, a role) instead of sent back.
//  F4  A wrong type or a word in an optional argument (accent "salt", dynamic "true") is accepted
//      silently as if it had been left out.
//  F5  A program with several kinds of mistake reports one kind per round, so two repairs cannot
//      fix it: names never defined, statements never used (whose own arguments are also wrong),
//      invalid arguments and a place unfit to start in must all come back in the first round.
//  F6  An origin complaint counts only what survived: "0 residents" for residents that were only
//      sent back for their arguments, so the model writes new people instead of fixing them — or
//      no "too many" for five residents when three of them were sent back (Qwen's build 2).
//  F7  The complaint list grows with the program, and the repair prompt no longer fits a small
//      context.
//  F8  A statement defined twice in model output silently replaces the first (a chapter lost its
//      first choice) instead of going back to the model with the other complaints.
//  F9  Stored content accepted before F8 (a name defined twice) stops parsing on read.

import { parseOrigin, parseScene, refuseRedefined } from "@dsl/index";
import { describe, expect, it } from "vitest";

const program = (...lines: string[]): string => lines.join("\n");

const HOME = [
  'ground = Floor(16, 16, "sand")',
  'sky = Sky("#e3dcba", "#d4d2c5", 0.02)',
  'sun = Light("sun", "#fef5cf", 4)',
  'well = Prop("well", 6, 7, 1)',
];

const complaints = (error: { errors: { message: string; statementId?: string }[] }): string =>
  error.errors.map((item) => `${item.statementId ?? ""}: ${item.message}`).join("\n");

describe("placeholders in optional arguments", () => {
  it("F1: reads a placeholder the field cannot hold as the argument left out", () => {
    const scene = parseScene(
      program(
        'root = Scene("Salt Marsh Edge", "meadow", [ground, sky, sun, well, house1, oryx, kite])',
        ...HOME,
        'house1 = Prop("house", 4, 9, 1, "none", "null", "none")',
        'oryx = NPC("oryx", "Oryx", 5, 5, "stranger", "calm", "#708090", "none", "none", "none", "none")',
        'kite = NPC("kite", "Kite", 10, 3, "child", "joyful", "#808080", "", "", "", "")',
      ),
    );
    if (!scene.ok) throw new Error(complaints(scene.error));
    expect(scene.value.props.find((p) => p.kind === "house")).toMatchObject({
      tint: null,
      dynamic: false,
    });
    expect(scene.value.props.find((p) => p.kind === "house")).not.toHaveProperty("assetId");
    // A stranger's own silhouette (ROLE_LOOK), and a trim colour derived from the body colour.
    expect(scene.value.npcs[0]).toMatchObject({ body: "tall", held: "none" });
    expect(scene.value.npcs[0]?.accent).toMatch(/^#[0-9a-f]{6}$/);
    expect(scene.value.npcs[1]).toMatchObject({ body: "child", hat: "ribbon", held: "none" });
  });

  it('F2: keeps "none" where it is a real value of the field', () => {
    const scene = parseScene(
      program(
        'root = Scene("Low Field", "meadow", [ground, sky, sun, well, ren])',
        ...HOME,
        'ren = NPC("ren", "Ren", 5, 5, "farmer", "calm", "#aa8866", "stout", "none", "none")',
      ),
    );
    if (!scene.ok) throw new Error(complaints(scene.error));
    // A farmer's default hat is straw and his default held item a basket; "none" means none.
    expect(scene.value.npcs[0]).toMatchObject({ body: "stout", hat: "none", held: "none" });
  });

  it("F3: never guesses a required argument", () => {
    const noColour = parseScene(
      program(
        'root = Scene("Low Field", "meadow", [ground, sky, sun, well, ren])',
        ...HOME,
        'ren = NPC("ren", "Ren", 5, 5, "farmer", "calm", "none")',
      ),
    );
    expect(noColour.ok).toBe(false);
    if (noColour.ok) return;
    expect(complaints(noColour.error)).toMatch(/color/);

    const noRole = parseScene(
      program(
        'root = Scene("Low Field", "meadow", [ground, sky, sun, well, ren])',
        ...HOME,
        'ren = NPC("ren", "Ren", 5, 5, "none", "calm", "#aa8866")',
      ),
    );
    expect(noRole.ok).toBe(false);
  });

  it("F4: still refuses a word or a wrong type in an optional argument", () => {
    const word = parseScene(
      program(
        'root = Scene("Low Field", "meadow", [ground, sky, sun, well, ren])',
        ...HOME,
        'ren = NPC("ren", "Ren", 5, 5, "farmer", "calm", "#aa8866", "stout", "none", "none", "salt")',
      ),
    );
    expect(word.ok).toBe(false);
    if (!word.ok) expect(complaints(word.error)).toMatch(/accent/);

    const flag = parseScene(
      program(
        'root = Scene("Low Field", "meadow", [ground, sky, sun, well, crate1])',
        ...HOME,
        'crate1 = Prop("crate", 4, 9, 1, "#aa8866", "true")',
      ),
    );
    expect(flag.ok).toBe(false);
    if (!flag.ok) expect(complaints(flag.error)).toMatch(/dynamic/);
  });
});

describe("one repair round hears about every mistake", () => {
  it("F5: names, unused statements and their arguments, invalid arguments and origin fit at once", () => {
    const result = parseOrigin(
      program(
        'root = Scene("Salt Marsh Edge", "meadow", [ground, sky, sun, well, house1, oryx, ghost])',
        'ground = Floor(30, 30, "sand")',
        'sky = Sky("#e3dcba", "#d4d2c5", 0.02)',
        'sun = Light("sun", "#fef5cf", 4)',
        'well = Prop("well", 6, 7, 1)',
        'house1 = Prop("house", 4, 9, 1, "salt")',
        'oryx = NPC("oryx", "Oryx", 5, 5, "stranger", "calm", "#708090")',
        'quest = Quest("The heron is waiting at the water\'s edge.")',
      ),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const { error } = result;
    expect(error.unresolved).toEqual(["ghost"]);
    expect(error.orphaned).toEqual(["quest"]);
    const said = complaints(error);
    expect(said).toMatch(/quest: .*text/); // the unused Quest's missing text, not a round later
    expect(said).toMatch(/house1: .*tint/);
    expect(said).toMatch(/30×30/); // the origin's own check
  });

  it("F6: does not count residents that were only sent back for their arguments", () => {
    const result = parseOrigin(
      program(
        'root = Scene("Salt Marsh Edge", "meadow", [ground, sky, sun, well, oryx])',
        ...HOME,
        'oryx = NPC("oryx", "Oryx", 5, 5, "stranger", "calm", "#708090", "tall", "hood", "lantern", "whisper")',
        'kite = NPC("kite", "Kite", 10, 3, "child", "joyful", "#808080")',
      ),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.orphaned).toEqual(["kite"]);
    expect(complaints(result.error)).toMatch(/accent/);
    expect(complaints(result.error)).not.toMatch(/residents/);

    const crowd = ["a", "b", "c", "d", "e"];
    const five = parseOrigin(
      program(
        `root = Scene("Salt Marsh Edge", "meadow", [ground, sky, sun, well, ${crowd.join(", ")}])`,
        ...HOME,
        ...crowd.map(
          (id, i) =>
            `${id} = NPC("${id}", "${id}", ${i + 2}, 3, "elder", "calm", "#708090"${i < 3 ? ', "hood"' : ""})`,
        ),
      ),
    );
    expect(five.ok).toBe(false);
    if (!five.ok) expect(complaints(five.error)).toMatch(/5 residents/);
  });

  it("F7: keeps the complaint list short however many statements share a mistake", () => {
    const rocks = Array.from({ length: 40 }, (_, i) => `rock${i}`);
    const result = parseScene(
      program(
        `root = Scene("Rocks", "meadow", [ground, sky, sun, ${rocks.join(", ")}])`,
        ...HOME.slice(0, 3),
        ...rocks.map((id, i) => `${id} = Prop("rock", ${i % 16}, ${i % 7}, 1, "grey")`),
        ...rocks.map((id, i) => `${id}_x = Prop("pebble", ${i % 16}, 1)`),
      ),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.errors.length).toBeLessThanOrEqual(12);
    expect(result.error.orphaned.length).toBe(40);
    // Every rock's tint is still named, so one round can fix them all.
    expect(complaints(result.error)).toContain("rock39");
  });
});

describe("a statement defined twice", () => {
  const twice = program(
    'root = Scene("Two Trees", "meadow", [ground, sky, sun, tree1, ren])',
    ...HOME.slice(0, 3),
    'tree1 = Prop("tree", 3, 3, 1)',
    'tree1 = Prop("rock", 9, 9, 1)',
    'ren = NPC("ren", "Ren", 5, 5, "farmer", "calm", "#aa8866")',
  );

  it("F8: goes back to the model when the model wrote it, beside everything else", () => {
    const alone = refuseRedefined(twice, parseScene(twice));
    expect(alone.ok).toBe(false);
    if (!alone.ok) expect(alone.error.message).toContain("tree1");

    const broken = twice.replace('"#aa8866")', '"#aa8866", "stout", "none", "none", "salt")');
    const both = refuseRedefined(broken, parseScene(broken));
    expect(both.ok).toBe(false);
    if (both.ok) return;
    expect(both.error.message).toContain("tree1");
    expect(complaints(both.error)).toMatch(/accent/);
  });

  it("F9: still reads stored content that defined it twice, as before (the last one wins)", () => {
    const stored = parseScene(twice);
    if (!stored.ok) throw new Error(complaints(stored.error));
    expect(stored.value.props.map((p) => p.kind)).toEqual(["rock"]);
  });
});
