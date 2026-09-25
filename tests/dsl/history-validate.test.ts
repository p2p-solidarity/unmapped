// The DSL half of an event's verdict (rev 6 phase 3, WP2: D4, D5 step 4). Untrusted input —
// another member's event, a service, a renderer draft — that E2E cannot reach (Rule 0). What this
// file guards, written before the code:
//   1. A witness whose `index` says something its programs do not (a renamed resident, an errand
//      moved to another place, a keepsake dropped, a resident added) is admitted, so rumors and
//      deeds would name what the chunk never had.
//   2. A stored program that does not parse, or words that belong to nobody (or to someone else),
//      pass because nothing parses them before the fold.
//   3. A gifted item the Item dialect could not have written (unclamped power, invented mesh
//      parts, none at all) reaches another player's inventory.
//   4. A place or chapter whose program or residents' words do not read back is admitted.
//   5. A rumor whose text is not the one form the Rumors dialect writes (a line break, doubled
//      spaces) is stored and shown.
//   6. A verdict that lets a forged or tampered event through, or loses the DSL refusal's code on
//      the way to the fold.

import { validateEventBody, witnessIndexOf } from "@dsl/history/validate";
import { entryVerdict } from "@dsl/history/verdict";
import {
  CHAPTER_EXAMPLE,
  PLACE_EXAMPLE,
  parseItem,
  parsePlace,
  serializeDialogue,
  serializeScene,
} from "@dsl/index";
import { signEvent } from "@shared/history/sign";
import type { WitnessBody } from "@shared/history/types";
import type { ItemSpec } from "@shared/world";
import { describe, expect, it } from "vitest";
import { OWNER, OWNER_SECRET, witnessed } from "./historyLand";

function witnessBody(cx = 3, cz = -2): WitnessBody {
  const { chunk, lore } = witnessed(cx, cz);
  const index = witnessIndexOf(chunk);
  if (!index.ok) throw new Error(index.error.message);
  return { ...chunk, lore, index: index.value };
}

const code = (result: { ok: true } | { ok: false; error: { code: string } }) =>
  result.ok ? "ok" : result.error.code;

describe("validateEventBody", () => {
  it("refuses a witness whose index is not what its programs say (1)", () => {
    const body = witnessBody();
    expect(code(validateEventBody({ kind: "witness", body }))).toBe("ok");
    const { index } = body;
    const [first, ...rest] = index.npcs;
    const [errand] = index.errands;
    const lies = [
      { ...index, name: "Somewhere Else" },
      { ...index, npcs: [{ ...first, name: "Mallory" }, ...rest] },
      { ...index, npcs: [...index.npcs, { id: "ghost", name: "Ghost", role: "farmer" }] },
      { ...index, errands: [{ ...errand, place: "far_away@9,9" }] },
      { ...index, keepsakes: [] },
    ];
    for (const lie of lies) {
      const refused = validateEventBody({
        kind: "witness",
        body: { ...body, index: lie } as WitnessBody,
      });
      expect(code(refused)).toBe("witness-index-mismatch");
    }
  });

  it("refuses programs that do not parse and words that belong to nobody (2)", () => {
    const body = witnessBody();
    const [npc = "", words = ""] = Object.entries(body.dialogues)[0] ?? [];
    const cases: [Partial<WitnessBody>, string][] = [
      [{ scene: "root = Scene(" }, "witness-scene-invalid"],
      [{ dialogues: { ...body.dialogues, nobody: words } }, "witness-dialogue-mismatch"],
      [
        { dialogues: { ...body.dialogues, [npc]: words.replace(`"${npc}"`, '"other"') } },
        "witness-dialogue-invalid",
      ],
      [{ errands: "root = Errands([nope])" }, "witness-errands-invalid"],
      [
        { lore: body.lore.map((node) => ({ ...node, coord: { cx: 9, cz: 9 } })) },
        "witness-lore-invalid",
      ],
    ];
    for (const [change, expected] of cases) {
      expect(code(validateEventBody({ kind: "witness", body: { ...body, ...change } }))).toBe(
        expected,
      );
    }
  });

  it("keeps only gifted items the Item dialect writes back unchanged (3)", () => {
    const forged = parseItem(
      'root = Item("ladle", "Steam Ladle", "tool", 38, "Draws hot water.", null, ["shaft_bamboo"], ["water"], "Bent.")',
    );
    if (!forged.ok) throw new Error(forged.error.message);
    const item: ItemSpec = forged.value;
    const gift = (changed: Partial<ItemSpec>) => ({
      kind: "gift" as const,
      body: {
        coord: { cx: 0, cz: 0, x: 1, z: 1 },
        item: { ...item, ...changed },
        for: null,
        words: "",
      },
    });
    expect(code(validateEventBody(gift({})))).toBe("ok");
    for (const bad of [
      { power: 38.5 },
      { power: 100.5 },
      { meshDna: [] },
      { meshDna: ["blade_of_infinite_sorrow"] },
      { name: "Steam  Ladle" },
      { id: "Not An Id" },
    ]) {
      expect(code(validateEventBody(gift(bad)))).toBe("gift-item-invalid");
    }
  });

  it("refuses places and chapters whose programs or words do not read back (4)", () => {
    const place = parsePlace(PLACE_EXAMPLE, { language: "en" });
    if (!place.ok) throw new Error(place.error.message);
    const source = serializeScene(place.value.graph);
    const dialogues = Object.fromEntries(
      place.value.dialogues.map((d) => [d.npcId, serializeDialogue(d)]),
    );
    const course = {
      kind: "side" as const,
      title: "Cellar",
      at: { cx: 1, cz: 1 },
      seed: 1,
      source,
      dialogues,
    };
    expect(code(validateEventBody({ kind: "place", body: course }))).toBe("ok");
    expect(
      code(validateEventBody({ kind: "place", body: { ...course, dialogues: undefined } })),
    ).toBe("ok");
    expect(
      code(validateEventBody({ kind: "place", body: { ...course, source: "nonsense" } })),
    ).toBe("place-source-invalid");
    expect(code(validateEventBody({ kind: "place", body: { ...course, dialogues: {} } }))).toBe(
      "place-dialogue-mismatch",
    );

    const head = { episodeId: "e1", title: "Steps", more: null };
    const land = { ...head, kind: "land" as const, source: CHAPTER_EXAMPLE, seed: 2 };
    expect(code(validateEventBody({ kind: "chapter", body: land }))).toBe("ok");
    expect(code(validateEventBody({ kind: "chapter", body: { ...land, source: source } }))).toBe(
      "chapter-source-invalid",
    );
    expect(code(validateEventBody({ kind: "chapter", body: { ...land, dialogues } }))).toBe(
      "chapter-dialogue-mismatch",
    );
    const maze = { ...head, kind: "dungeon" as const, source, dialogues, seed: 2 };
    expect(code(validateEventBody({ kind: "chapter", body: maze }))).toBe("ok");
  });

  it("stores a rumor only in the form the Rumors dialect writes (5)", () => {
    const rumor = (text: string) => ({
      kind: "rumor" as const,
      body: { beat: `h${"a".repeat(52)}`, slot: 0, text },
    });
    expect(code(validateEventBody(rumor("They say Ben cleared The Lantern.")))).toBe("ok");
    for (const text of ["They say\nBen", "They  say Ben", " They say Ben"]) {
      expect(code(validateEventBody(rumor(text)))).toBe("rumor-text-invalid");
    }
  });
});

describe("entryVerdict (6)", () => {
  const signed = (body: WitnessBody) =>
    signEvent(
      {
        v: 1,
        world: `h${"b".repeat(52)}`,
        kind: "witness",
        author: OWNER,
        at: "2026-09-26T10:00:00.000Z",
        seen: 0,
        body,
      },
      OWNER_SECRET,
    );

  it("passes a signed event with sound programs and keeps each refusal's own code", () => {
    const body = witnessBody();
    const event = signed(body);
    expect(entryVerdict(event)).toEqual({ ok: true });
    expect(entryVerdict({ ...event, body: { ...body, cx: 4 } })).toEqual({
      ok: false,
      code: "event-id-mismatch",
    });
    expect(entryVerdict({ ...event, sig: signed(witnessBody(0, 5)).sig })).toEqual({
      ok: false,
      code: "event-sig-invalid",
    });
    expect(entryVerdict(signed({ ...body, index: { ...body.index, name: "Elsewhere" } }))).toEqual({
      ok: false,
      code: "witness-index-mismatch",
    });
    expect(entryVerdict({ ...event, kind: "future.kind" })).toEqual({
      ok: false,
      code: "event-kind-unknown",
    });
  });
});
