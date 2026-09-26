// A beat's rumor batch (rev 6 phase 3, WP7: D14) — what the model is asked, how its answer is read
// and when it ends — run through the real generate → parse → repair loop with a scripted model, since
// no E2E run can make a model misbehave on demand (Rule 0: malformed model output). What this file
// guards, written before the code:
//   1. A reply that is not a Rumors program (prose, a cut-off statement) is kept, or ends the batch
//      without a repair round.
//   2. A reply naming an uncited place, resident or member — another chunk's name, another chunk's
//      resident, a member the fact is not about — is accepted instead of going back as a repair.
//   3. The reverse label check is lost: a known, uncited label that begins with an allowed one
//      ("Ben" is the deed's author, "Benton Hollow" is another place) slips through.
//   4. Case folding reaches past ASCII: the cited name in other ASCII case is refused, or the cited
//      name in other non-ASCII case (É / é) is taken as the name itself.
//   5. A repair that is still invalid ends in anything but an error — a fallback line, or the part
//      of the batch that did parse — or more than two repairs are spent.
//   6. The model is asked for, or a rumor is accepted for, a slot it may not write: one already
//      written, or one whose fact or teller the owner hid (silence, never filler); a beat with
//      nothing left to tell still costs a call.

import { normalizeOutput, repairPrompt, serializeRumors } from "@dsl";
import { runProgram } from "@renderer/narrative/program";
import { rumorBatchSpec } from "@renderer/narrative/rumor";
import { ok } from "@shared/result";
import { describe, expect, it } from "vitest";
import { ANN, BEN, chapter, day, key, OWNER, World, witness } from "../fixtures/history";

/**
 * Ann and Ben are members; Ben cleared "The Lantern" (gate e1 at 6,0). Heron Ford (5,0) is the
 * only place near enough to tell of it; Benton Hollow (-3,0) is known, but too far to.
 */
function town(title = "The Lantern") {
  const world = new World();
  const ann = world.join(ANN, "Ann", day(0, 1));
  const ben = world.join(BEN, "Ben", day(0, 2));
  const ford = world.write("witness", witness(5, 0, "Heron Ford", ["bo"]), ANN, day(0, 3));
  world.write("witness", witness(-3, 0, "Benton Hollow", ["cy"]), OWNER, day(0, 4));
  const lantern = world.write("chapter", chapter("e1", title), BEN, day(0, 5));
  const deed = world.write("deed", { what: "chapter.cleared", ref: lantern.id }, BEN, day(0, 6));
  const beat = world.beat(day(1));
  const slotOf = (cite: string): number => {
    const found = beat.body.slots.find((one) => one.cite === cite);
    if (found === undefined) throw new Error(`${cite} did not become a slot`);
    return found.slot;
  };
  return {
    world,
    beat: beat.id,
    deed: slotOf(deed.id),
    chapter: slotOf(lantern.id),
    joins: [ann.id, ben.id],
    ford: ford.id,
  };
}

function specOf(world: World, beat: string) {
  return rumorBatchSpec({ now: world.now, beat, bible: null, author: key(ANN) });
}

/** Runs the batch against replies given in order; every call's messages are recorded. */
async function run(world: World, beat: string, replies: string[]) {
  const spec = specOf(world, beat);
  if (spec === null) throw new Error("nothing to write");
  const asked: string[][] = [];
  const result = await runProgram(
    async (request) => {
      asked.push(request.messages.map((message) => message.content));
      return ok({ text: replies[asked.length - 1] ?? "", usage: null });
    },
    { ...spec, normalize: normalizeOutput, repair: repairPrompt },
  );
  return { result, asked };
}

const one = (slot: number, text: string) => serializeRumors([{ slot, text }]);

/** The repair turn the model got after round `round` (0-based). */
const repairOf = (asked: string[][], round: number): string => asked[round + 1]?.at(-1) ?? "";

describe("a beat's rumor batch", () => {
  it("sends a reply that is not a Rumors program back for repair (1)", async () => {
    const { world, beat, deed } = town();
    const good = one(deed, "They say Ben saw The Lantern through at last.");
    const cut = `root = Rumors([r0])\nr0 = Rumor(${deed}, "Ben`;
    for (const bad of ["Ben cleared The Lantern, they say.", cut]) {
      const { result, asked } = await run(world, beat, [bad, good]);
      expect(asked).toHaveLength(2);
      expect(result.ok && result.value.graph).toEqual([
        { slot: deed, text: "They say Ben saw The Lantern through at last." },
      ]);
    }
  });

  it("repairs a rumor naming an uncited place, resident or member (2)", async () => {
    const { world, beat, deed } = town();
    const good = one(deed, "Ben finished The Lantern, bo_kin of Heron Ford says.");
    const cases: [string, string][] = [
      [one(deed, "Ben finished The Lantern, then walked on to Benton Hollow."), "Benton Hollow"],
      [one(deed, "Ben finished The Lantern, or so cy_kin heard."), "cy_kin"],
      [one(deed, "Ann swears Ben finished The Lantern."), "Ann"],
    ];
    for (const [bad, named] of cases) {
      const { result, asked } = await run(world, beat, [bad, good]);
      expect(repairOf(asked, 0)).toContain(`names "${named}"`);
      expect(result.ok && result.value.graph[0]?.text).toBe(
        "Ben finished The Lantern, bo_kin of Heron Ford says.",
      );
    }
  });

  it("refuses an uncited label that begins with an allowed one (3)", async () => {
    const { world, beat, deed } = town();
    const text = one(deed, "Ben finished The Lantern, and Benton Hollow heard of it.");
    const { result, asked } = await run(world, beat, [text, text, text]);
    expect(repairOf(asked, 0)).toContain('names "Benton Hollow"');
    expect(result.ok).toBe(false);
  });

  it("folds ASCII case only (4)", async () => {
    const plain = town();
    const shouted = await run(plain.world, plain.beat, [
      one(plain.deed, "BEN finished THE LANTERN, they say."),
    ]);
    expect(shouted.asked).toHaveLength(1);
    expect(shouted.result.ok).toBe(true);

    const accented = town("Élan Gate");
    const lower = one(accented.deed, "Ben saw élan gate through, they say.");
    const right = one(accented.deed, "Ben saw Élan Gate through, they say.");
    const { result, asked } = await run(accented.world, accented.beat, [lower, right]);
    expect(repairOf(asked, 0)).toContain('does not name "Élan Gate"');
    expect(result.ok && result.value.graph[0]?.text).toBe("Ben saw Élan Gate through, they say.");
  });

  it("ends in an error, keeping nothing, when the repairs are still invalid (5)", async () => {
    const { world, beat, deed, chapter: first } = town();
    // One rumor names a place it may not; the other is fine and must not survive on its own.
    const reply = serializeRumors([
      { slot: deed, text: "Ben finished The Lantern at Benton Hollow." },
      { slot: first, text: "Ben was the first to reach The Lantern." },
    ]);
    const { result, asked } = await run(world, beat, [reply, reply, reply, reply]);
    expect(asked).toHaveLength(3);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("dsl-invalid-rumors");
      expect(result.error.message).toContain("still invalid after 2 repair rounds");
    }
  });

  it("lists only the slots it may write, and asks nothing when none is left (6)", async () => {
    const { world, beat, deed, chapter: first, joins, ford } = town();
    expect(specOf(world, beat)?.slots).toEqual(expect.arrayContaining([deed, first]));
    // Someone wrote the deed's slot already: it is not asked for again, and a rumor for it is sent back.
    world.write("rumor", { beat, slot: deed, text: "Ben finished The Lantern." }, ANN, day(1, 5));
    const rest = specOf(world, beat);
    expect(rest?.slots).not.toContain(deed);
    expect(rest?.parse(one(deed, "Ben finished The Lantern again.")).ok).toBe(false);
    // The owner hides the chapter's teller (Heron Ford): that slot falls silent too.
    world.write("hide", { id: ford, hidden: true }, OWNER, day(1, 10));
    expect(specOf(world, beat)?.slots).not.toContain(first);
    // …and the joins the beat retells: nothing is left, so nothing is asked.
    for (const id of joins) world.write("hide", { id, hidden: true }, OWNER, day(1, 11));
    expect(specOf(world, beat)).toBeNull();
  });
});
