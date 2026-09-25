// The Rumors dialect (rev 6 phase 3, WP2: D14): malformed model output, which E2E cannot reach
// on demand (Rule 0). What this file guards, written before the code:
//   1. Output that is not a Rumors program (prose, a fence, another root, a cut-off statement)
//      is taken as "no rumors" instead of going back to the model as a repair.
//   2. A rumor for a slot the beat did not open, a second rumor for one slot, a slot that is not
//      a whole number, or a blank / over-long / multi-line text is stored.
//   3. A rumor the history's validator would refuse (it does not name its fact, or names a place
//      or person outside it) is accepted by the parser, so the refusal never becomes one of Rule
//      7's two repairs and the batch fails only later, in main or the service.
//   4. A batch that leaves a slot out is refused (silence is allowed; filler is not required), or
//      whitespace the model wrapped a line with survives into the stored text.

import { parseRumors, serializeRumors } from "@dsl/parse/rumor";
import { RUMOR_EXAMPLE, rumorFacts } from "@dsl/prompts/rumor";
import { describe, expect, it } from "vitest";
import { ANN, BEN, chapter, day, ITEM, key, TILE, World, witness } from "../fixtures/history";

function town() {
  const world = new World();
  world.join(ANN, "Ann", day(0, 1));
  world.join(BEN, "Ben", day(0, 2));
  world.write("witness", witness(5, 0, "Ford", ["bo"]), ANN, day(0, 3));
  world.write("witness", witness(4, 1, "Ann's Mill", ["cy"]), BEN, day(0, 4));
  const lantern = world.write("chapter", chapter("e1", "The Lantern"), BEN, day(0, 5));
  world.write("deed", { what: "chapter.cleared", ref: lantern.id }, BEN, day(0, 6));
  world.write("gift", { coord: TILE(5, 0), item: ITEM, for: null, words: "hi" }, BEN, day(0, 7));
  const beat = world.beat(day(1));
  const slots = beat.body.slots.map((slot) => slot.slot);
  return { world, beat, ctx: { slots, now: world.now, beat: beat.id, author: key(ANN) } };
}

const messages = (result: ReturnType<typeof parseRumors>): string[] =>
  result.ok ? [] : result.error.errors.map((error) => `${error.message} ${error.hint ?? ""}`);

describe("parseRumors", () => {
  it("sends back output that is not a Rumors program (1)", () => {
    const { ctx } = town();
    for (const reply of [
      "Here are the rumors: Ben cleared The Lantern.",
      'root = Rumor(0, "Ben cleared The Lantern")',
      'root = Rumors([r0])\nr0 = Rumor(0, "Ben cleared',
      "root = Rumors([r0])",
    ]) {
      const result = parseRumors(reply, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.hint ?? "").not.toBe("");
    }
    expect(parseRumors(RUMOR_EXAMPLE, null).ok).toBe(true);
  });

  it("sends back unknown, doubled and fractional slots and unusable text (2)", () => {
    const { ctx } = town();
    const text = "They say Ben cleared The Lantern.";
    const cases: [string, string][] = [
      [serializeRumors([{ slot: 9, text }]), "slot 9, which is not one of the listed slots"],
      [
        serializeRumors([
          { slot: 0, text },
          { slot: 0, text },
        ]),
        "two rumors",
      ],
      [serializeRumors([{ slot: 0.5, text }]), "slot 0.5, which is not one of the listed slots"],
      [serializeRumors([{ slot: 0, text: "   " }]), "says nothing"],
      [serializeRumors([{ slot: 0, text: `${text} ${"x".repeat(200)}` }]), "characters long"],
      [serializeRumors([{ slot: 0, text: `${text}\u0007` }]), "control characters"],
    ];
    for (const [reply, expected] of cases) {
      const found = messages(parseRumors(reply, ctx)).join(" | ");
      expect(found).toContain(expected);
    }
  });

  it("turns the history validator's refusals into repair issues (3)", () => {
    const { ctx } = town();
    const uncited = messages(
      parseRumors(serializeRumors([{ slot: 0, text: "Someone did something." }]), ctx),
    );
    expect(uncited.join(" ")).toContain("The Lantern");
    const other = messages(
      parseRumors(
        serializeRumors([{ slot: 0, text: "Ben cleared The Lantern, or so Ann tells it." }]),
        ctx,
      ),
    );
    expect(other.join(" ")).toContain('names "Ann"');
    const [first] = rumorFacts(ctx.now, town().beat.body.slots);
    expect(first?.must).toBe("The Lantern");
  });

  it("allows silence for a slot and stores one plain line (4)", () => {
    const { ctx } = town();
    const reply = 'root = Rumors([r0])\nr0 = Rumor(0, "  They say\n Ben   cleared The Lantern.  ")';
    const read = parseRumors(reply, ctx);
    expect(read).toEqual({
      ok: true,
      value: [{ slot: 0, text: "They say Ben cleared The Lantern." }],
    });
    expect(parseRumors(serializeRumors([]), ctx).ok).toBe(false);
  });
});
