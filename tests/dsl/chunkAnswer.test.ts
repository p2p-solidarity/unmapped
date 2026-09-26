// A guided witness answer (Apple's on-device model) is JSON the bridge hands back; the writer turns
// it into a Chunk program. The answer is model output, so it is untrusted. The ways the writer
// could fail, each guarded below (E2E sees only the few answers one run happens to get):
//   1. A word with a quote, a backslash, a newline or CJK text breaks the written program, or
//      comes back changed (beyond the whitespace every parsed line has folded), so a valid answer
//      is refused or saved altered.
//   2. Malformed JSON, a missing field or a value outside the vocabulary (a prop kind the world
//      lacks, an action a witness may not offer) is written anyway instead of being refused as a
//      repairable DslError.
//   3. Residents who share a name, or whose names have no ascii (so no id of their own), or one who
//      shares an id with an authored villager, get clashing ids: a Talk lands on the wrong person
//      or the parser refuses the whole chunk every time.
//   4. A part of the place maps a thing into the authored village at the origin, which the parser
//      refuses every time.
//   5. A neighbour keeps a custom but the written custom does not link it, which the parser
//      refuses every time.

import { PLACE_PARTS } from "@dsl/chunkAnswer";
import type { ChunkAnswerContext, ChunkContext } from "@dsl/index";
import { parseChunk, writeChunkProgram } from "@dsl/index";
import type { LoreNode } from "@shared/lore";
import type { NpcSpec } from "@shared/world";
import { describe, expect, it } from "vitest";

const neighbourCustom: LoreNode = {
  id: "first_bucket@0,0",
  kind: "custom",
  label: "First bucket for the road",
  text: "The first bucket of the morning is poured on the road.",
  coord: { cx: 0, cz: 0 },
  links: [],
  tone: 0.3,
};

const land = (extra: Partial<ChunkContext> = {}): ChunkContext => ({
  coord: { cx: 1, cz: 0 },
  biome: "countryside",
  ground: "grass",
  hole: null,
  lore: [neighbourCustom],
  language: "en",
  props: ["tree", "well", "house", "chimney"],
  ...extra,
});

const answerCtx = (extra: Partial<ChunkAnswerContext> = {}): ChunkAnswerContext => ({
  language: "en",
  props: ["tree", "well", "house", "chimney"],
  hole: null,
  authored: [],
  customs: ["first_bucket@0,0"],
  ...extra,
});

const talk = (line: string) => ({
  line,
  answers: [{ label: "Wave", action: "talk", effect: "They wave back." }],
});

const resident = (name: string, part: string = "middle") => ({
  name,
  role: "farmer",
  mood: "calm",
  hue: 30,
  part,
  ...talk(`${name} says hello.`),
});

function answer(extra: Record<string, unknown> = {}) {
  return {
    name: "Well Bend",
    place: "A well where the road bends.",
    tone: 0.2,
    props: [
      { kind: "chimney", part: "north" },
      { kind: "well", part: "middle" },
      { kind: "tree", part: "south-east" },
    ],
    residents: [resident("Aki", "west"), resident("Bo", "east")],
    custom: {
      label: "Second bucket",
      text: "The second bucket goes to the tree.",
      grows_from: "first_bucket@0,0",
    },
    errand: {
      ask: "I lost my pail somewhere here.",
      part: "south",
      thanks: "That's the one.",
      keepsake: "Tin cup",
      kind: "tool",
      power: 2,
      perk: "holds water",
      look: "vial_round",
      flavor: "Dented on one side.",
    },
    ...extra,
  };
}

function written(json: unknown, ctx = answerCtx()): string {
  const program = writeChunkProgram(JSON.stringify(json), ctx);
  if (!program.ok) throw new Error(program.error.message);
  return program.value;
}

describe("a guided witness answer written as a Chunk program", () => {
  it("keeps quotes, backslashes, newlines and CJK words exactly (1)", () => {
    const odd = 'She said "wait"\\ then\nleft 風が「強い」';
    const source = written(
      answer({
        name: '井戸の"曲がり"角',
        residents: [{ ...resident("Aki"), line: odd }],
        custom: { label: "水\\桶", text: odd, grows_from: "first_bucket@0,0" },
      }),
    );
    const parsed = parseChunk(source, land({ language: "ja-JP" }));
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.error.errors));
    expect(parsed.value.scene.name).toBe('井戸の"曲がり"角');
    // The parser folds whitespace in every line, as it does for a program written as text.
    expect(parsed.value.dialogues[0]?.line).toBe(odd.replace(/\s+/g, " "));
    expect(parsed.value.lore.find((node) => node.kind === "custom")?.label).toBe("水\\桶");
  });

  it("refuses malformed JSON, missing fields and words outside the vocabulary (2)", () => {
    const refused = (raw: string) => {
      const result = writeChunkProgram(raw, answerCtx());
      return result.ok ? null : result.error.code;
    };
    expect(refused('{"name": "Well Bend", "props": [')).toBe("dsl-invalid-answer");
    const { errand: _, ...noErrand } = answer();
    expect(refused(JSON.stringify(noErrand))).toBe("dsl-invalid-answer");
    const reactor = answer({ props: [{ kind: "reactor", part: "north" }, ...answer().props] });
    expect(refused(JSON.stringify(reactor))).toBe("dsl-invalid-answer");
    const open = answer({
      residents: [
        { ...resident("Aki"), answers: [{ label: "Go", action: "open_exit", effect: "" }] },
      ],
    });
    expect(refused(JSON.stringify(open))).toBe("dsl-invalid-answer");
    expect(refused(JSON.stringify(answer({ custom: { label: "x", text: "y" } })))).toBe(
      "dsl-invalid-answer",
    );
  });

  it("gives every resident an id of their own, apart from the authored village (3)", () => {
    const authored: NpcSpec[] = [
      {
        id: "aki",
        name: "Aki",
        x: 2,
        z: 2,
        role: "elder",
        mood: "calm",
        color: "#8c8a7a",
        body: "elder",
        hat: "none",
        held: "staff",
        accent: "#aaaaaa",
      },
    ];
    const hole = { width: 16, depth: 16 };
    const source = written(
      answer({
        residents: [resident("Aki"), resident("Aki"), resident("ミナ")],
        village: { aki: talk("I was here first.") },
      }),
      answerCtx({ authored, hole, customs: [] }),
    );
    const parsed = parseChunk(source, land({ coord: { cx: 0, cz: 0 }, hole, authored, lore: [] }));
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.error.errors));
    const ids = parsed.value.scene.npcs.map((npc) => npc.id);
    expect(new Set([...ids, "aki"]).size).toBe(ids.length + 1);
    expect(parsed.value.dialogues.map((d) => d.npcId).sort()).toEqual([...ids, "aki"].sort());
  });

  it("never stands anything inside the authored village, from any part (4)", () => {
    for (const hole of [
      { width: 16, depth: 16 },
      { width: 24, depth: 12 },
      { width: 31, depth: 31 },
    ]) {
      const props = PLACE_PARTS.map((part) => ({ kind: "tree", part }));
      const source = written(
        answer({
          props: props.slice(0, 8),
          residents: PLACE_PARTS.slice(0, 3).map((part) => resident(`R${part}`, part)),
          custom: { label: "Second bucket", text: "Poured on the tree." },
        }),
        answerCtx({ hole, customs: [] }),
      );
      const parsed = parseChunk(source, land({ coord: { cx: 0, cz: 0 }, hole, lore: [] }));
      if (!parsed.ok)
        throw new Error(`${JSON.stringify(hole)}: ${parsed.error.errors[0]?.message}`);
    }
  });

  it("links the custom to the neighbour custom it grows from (5)", () => {
    const parsed = parseChunk(written(answer()), land());
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.error.errors));
    const custom = parsed.value.lore.find((node) => node.kind === "custom");
    expect(custom?.links).toContain("first_bucket@0,0");
  });
});
