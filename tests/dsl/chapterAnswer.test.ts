// A guided chapter answer (Apple's on-device model) is JSON the bridge hands back; the writer turns
// it into a Chapter program. The answer is model output, so it is untrusted. The ways the writer
// could fail, each guarded below (E2E sees only the few answers one run happens to get):
//   1. A word with a quote, a backslash, a newline, a line or paragraph separator, a control
//      character, a lone surrogate, CJK text or text that looks like program syntax breaks the
//      written program, or comes back changed (beyond the whitespace every parsed line folds), so a
//      valid answer is refused or saved altered.
//   2. Malformed JSON, a missing field or a value outside the shared vocabulary — the actions
//      "look" and "pass", the role "農夫", a monster kind or level the dialect lacks, too many or
//      too few people, finds or foes — is written anyway instead of refused as a repairable
//      DslError, so the model is never told what to fix.
//   3. People who share a name, whose names have no ascii (so no id of their own), whose long
//      names differ only past the id length, or whose name is a find's or a foe's id get clashing
//      ids: a Talk lands on the wrong person or the parser refuses the whole chapter every time.
//   4. A game without combat gets a Monster from an answer that carried foes anyway (the parser
//      refuses it every time), or a game with combat loses the foes it was given.
//   5. An empty or blank word the parser needs (the place, the goal, a person's name or line, an
//      answer's label) is written, so the chapter can never parse however often it is repaired.
//   6. Over many malformed and adversarial answers, the writer ever returns a program that does not
//      parse as a Chapter (the structure main checks before storing it) or breaks a count or
//      Talk rule the parser enforces — instead of either a sound program or a repairable refusal.

import { CHAPTER_ANSWER_LIMITS } from "@dsl/chapterAnswer";
import type { ChapterAnswerContext } from "@dsl/index";
import { clampText, LIMITS, parseChapter, writeChapterProgram } from "@dsl/index";
import { MONSTER_KINDS, MOODS, NPC_ROLES } from "@shared/world";
import { describe, expect, it } from "vitest";

const peaceful: ChapterAnswerContext = { language: "en", combat: false };
const fighting: ChapterAnswerContext = { language: "en", combat: true };

const person = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  role: "farmer",
  mood: "calm",
  hue: 30,
  line: `${name} says the bus is late again.`,
  answers: [{ label: "Ask about the bus", action: "talk", effect: "They shrug." }],
  ...extra,
});

function answer(extra: Record<string, unknown> = {}) {
  return {
    name: "Last Stop",
    goal: "Hear everyone out while the bus is late.",
    people: [person("Aki"), person("Bo")],
    finds: [{ loot: ["bus timetable"] }],
    ...extra,
  };
}

function written(json: unknown, ctx: ChapterAnswerContext = peaceful): string {
  const program = writeChapterProgram(JSON.stringify(json), ctx);
  if (!program.ok) throw new Error(program.error.message);
  return program.value;
}

function refused(raw: string, ctx: ChapterAnswerContext = peaceful): string | null {
  const result = writeChapterProgram(raw, ctx);
  return result.ok ? null : result.error.code;
}

describe("a guided chapter answer written as a Chapter program", () => {
  it("keeps odd and CJK words exactly, and syntax in a word stays a word (1)", () => {
    const odd = 'She said "wait"\\ then\nleft 風が「強い」  ]), root = Chapter("x"';
    const source = written(
      answer({
        name: '終點"站"\\',
        goal: odd,
        people: [
          person("阿明", {
            line: odd,
            answers: [{ label: "問\u0007公車", action: "trade", effect: odd }],
          }),
        ],
        finds: [{ loot: ['a "ticket"', " "] }],
      }),
    );
    const parsed = parseChapter(source, null);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.error.errors));
    const fold = (text: string, max: number) => clampText(text, max);
    expect(parsed.value.name).toBe('終點"站"\\');
    expect(parsed.value.goal).toBe(fold(odd, LIMITS.text.line));
    expect(parsed.value.npcs[0]?.name).toBe("阿明");
    const words = parsed.value.dialogues[0];
    expect(words?.line).toBe(fold(odd, LIMITS.text.line));
    expect(words?.choices[0]?.label).toBe("問\u0007公車");
    expect(words?.choices[0]?.effect).toBe(fold(odd, LIMITS.text.effect));
    expect(words?.choices[0]?.gives).toEqual([]);
    expect(parsed.value.treasures[0]?.loot).toEqual(['a "ticket"']);
  });

  it("refuses malformed JSON, missing fields and words outside the vocabulary (2)", () => {
    expect(refused('{"name": "Last Stop", "people": [')).toBe("dsl-invalid-answer");
    expect(refused("null")).toBe("dsl-invalid-answer");
    expect(refused(JSON.stringify([answer()]))).toBe("dsl-invalid-answer");
    const { finds: _, ...noFinds } = answer();
    expect(refused(JSON.stringify(noFinds))).toBe("dsl-invalid-answer");
    const off = (who: Record<string, unknown>) =>
      refused(JSON.stringify(answer({ people: [person("Aki", who)] })));
    expect(off({ role: "農夫" })).toBe("dsl-invalid-answer");
    expect(off({ mood: "angry" })).toBe("dsl-invalid-answer");
    expect(off({ hue: 12.5 })).toBe("dsl-invalid-answer");
    for (const action of ["look", "pass", "open_exit", "craft"]) {
      expect(off({ answers: [{ label: "Go", action, effect: "" }] })).toBe("dsl-invalid-answer");
    }
    expect(off({ answers: [] })).toBe("dsl-invalid-answer");
    const crowd = Array.from({ length: CHAPTER_ANSWER_LIMITS.people.max + 1 }, (_, n) =>
      person(`P${n}`),
    );
    expect(refused(JSON.stringify(answer({ people: crowd })))).toBe("dsl-invalid-answer");
    expect(refused(JSON.stringify(answer({ people: [] })))).toBe("dsl-invalid-answer");
    expect(refused(JSON.stringify(answer({ finds: [] })))).toBe("dsl-invalid-answer");
    const foe = (kind: string, level: number) => ({ kind, level, weakness: "noise" });
    const fight = (foes: unknown[]) => refused(JSON.stringify(answer({ foes })), fighting);
    expect(fight([foe("dragon", 3), foe("wisp", 3)])).toBe("dsl-invalid-answer");
    expect(fight([foe("wisp", 0), foe("wisp", 3)])).toBe("dsl-invalid-answer");
    expect(fight([foe("wisp", 9), foe("wisp", 3)])).toBe("dsl-invalid-answer");
    expect(fight([foe("wisp", 3)])).toBe("dsl-invalid-answer");
    expect(refused(JSON.stringify(answer()), fighting)).toBe("dsl-invalid-answer");
  });

  it("gives every person an id of their own that their Talk names (3)", () => {
    const long = "a".repeat(LIMITS.text.id + 8);
    const source = written(
      answer({
        people: [person("Aki"), person("Aki"), person("find_1")],
        finds: [{ loot: ["cup"] }, { loot: ["hat"] }],
      }),
    );
    const others = written(answer({ people: [person("阿明"), person("小芳"), person(long)] }));
    const clash = written(
      answer({ people: [person(long), person(`${long}b`), person("person_1")] }),
    );
    for (const program of [source, others, clash]) {
      const parsed = parseChapter(program, peaceful);
      if (!parsed.ok) throw new Error(JSON.stringify(parsed.error.errors));
      const ids = [
        ...parsed.value.npcs.map((npc) => npc.id),
        ...parsed.value.treasures.map((one) => one.id),
      ];
      expect(new Set(ids).size).toBe(ids.length);
      expect(parsed.value.dialogues.map((d) => d.npcId)).toEqual(
        parsed.value.npcs.map((npc) => npc.id),
      );
    }
  });

  it("writes foes only for a game with combat, and keeps them there (4)", () => {
    const foes = [
      { kind: MONSTER_KINDS[0], level: 2, weakness: "a loud clap" },
      { kind: MONSTER_KINDS[1], level: 8, weakness: "" },
    ];
    const calm = parseChapter(written(answer({ foes })), peaceful);
    if (!calm.ok) throw new Error(JSON.stringify(calm.error.errors));
    expect(calm.value.monsters).toEqual([]);
    const fight = parseChapter(written(answer({ foes }), fighting), fighting);
    if (!fight.ok) throw new Error(JSON.stringify(fight.error.errors));
    expect(fight.value.monsters.map((m) => [m.kind, m.level])).toEqual([
      [MONSTER_KINDS[0], 2],
      [MONSTER_KINDS[1], 8],
    ]);
  });

  it("refuses a blank word the parser needs instead of writing it (5)", () => {
    const blank = [" ", "\n\t", "　"];
    for (const nothing of blank) {
      expect(refused(JSON.stringify(answer({ name: nothing })))).toBe("dsl-invalid-answer");
      expect(refused(JSON.stringify(answer({ goal: nothing })))).toBe("dsl-invalid-answer");
      const who = (extra: Record<string, unknown>) =>
        refused(JSON.stringify(answer({ people: [person("Aki", extra)] })));
      expect(who({ name: nothing })).toBe("dsl-invalid-answer");
      expect(who({ line: nothing })).toBe("dsl-invalid-answer");
      expect(who({ answers: [{ label: nothing, action: "talk", effect: "" }] })).toBe(
        "dsl-invalid-answer",
      );
    }
  });

  it("writes a sound program or refuses, over many malformed answers (6)", () => {
    let state = 0x2f6b1d;
    const next = (): number => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = <T>(values: readonly T[]): T => values[Math.floor(next() * values.length)] as T;
    // Each value is off (blank, outside the vocabulary, out of range) now and then, so about half
    // the answers are written and half refused.
    const off = (): boolean => next() < 0.02;
    const count = (min: number, max: number): number =>
      off() ? pick([min - 1, max + 1]) : min + Math.floor(next() * (max - min + 1));
    const some = <T>(range: { min: number; max: number }, make: () => T): T[] =>
      Array.from({ length: Math.max(0, count(range.min, range.max)) }, make);
    const odd = [
      "Aki",
      "Aki",
      "阿明",
      "find_1",
      "foe_2",
      "person_2",
      "a".repeat(40),
      `${"a".repeat(40)}b`,
      'say "hi"',
      "x\\y",
      "a\u2028b",
      "\ud800",
      "😀 ok",
      "root = Chapter(",
      "]), npc1 = NPC(",
      "\u0000",
      "12, 3",
    ];
    const word = (): string => (off() ? pick(["", "  "]) : pick(odd));
    const one = <T>(values: readonly T[], wrong: T): T => (off() ? wrong : pick(values));
    const limits = CHAPTER_ANSWER_LIMITS;
    const structural =
      /statements\.|Talk statements|needs 1 to|is used twice|not an NPC here|declares no combat|needs a place name/;
    let writtenCount = 0;
    for (let n = 0; n < 400; n += 1) {
      const combat = next() < 0.5;
      const ctx = { language: "en", combat };
      const shape: Record<string, unknown> = {
        name: word(),
        goal: word(),
        people: some(limits.people, () => ({
          name: word(),
          role: one(NPC_ROLES, "農夫"),
          mood: one(MOODS, "angry"),
          hue: one([0, 1, 200, 359], pick([360, -1, 12.5])),
          line: word(),
          answers: some(limits.answers, () => ({
            label: word(),
            action: one(["talk", "trade", "leave"], pick(["look", "pass"])),
            effect: pick([...odd, ""]),
          })),
        })),
        finds: some(limits.finds, () => ({ loot: some(limits.loot, () => pick([...odd, ""])) })),
        foes: some(limits.foes, () => ({
          kind: one(MONSTER_KINDS, "dragon"),
          level: one([1, 4, 8], pick([0, 9, 3.5])),
          weakness: pick([...odd, ""]),
        })),
      };
      if (next() < 0.05) delete shape[pick(Object.keys(shape))];
      let raw = JSON.stringify(shape);
      if (next() < 0.05) raw = raw.slice(0, Math.floor(raw.length * next()));
      const result = writeChapterProgram(raw, ctx);
      if (!result.ok) {
        expect(result.error.code).toBe("dsl-invalid-answer");
        continue;
      }
      writtenCount += 1;
      const stored = parseChapter(result.value, null);
      if (!stored.ok) throw new Error(`${n}: ${JSON.stringify(stored.error.errors)}`);
      const people = shape.people as unknown[];
      expect(stored.value.npcs.length).toBe(people.length);
      expect(stored.value.dialogues.length).toBe(people.length);
      expect(stored.value.treasures.length).toBe((shape.finds as unknown[]).length);
      expect(stored.value.monsters.length).toBe(combat ? (shape.foes as unknown[]).length : 0);
      const checked = parseChapter(result.value, ctx);
      if (!checked.ok) {
        const broken = checked.error.errors.filter((e) => structural.test(e.message));
        expect(broken.map((e) => e.message)).toEqual([]);
      }
    }
    // Both sides of the writer were exercised, not only its refusals.
    expect(writtenCount).toBeGreaterThan(100);
    expect(writtenCount).toBeLessThan(380);
  });
});
