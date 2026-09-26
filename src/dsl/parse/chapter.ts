// Chapter program → the people, finds and foes of one story chapter, plus each person's words.
// Nothing here has a position yet (the host sets everything around the gate: x and z are 0), and
// a person's look follows from their role. Structural problems a repair round can fix become
// issues; the prose checks are the witnessing's own (../hygiene.ts), and so is the one that sends
// back a person who takes a name already in use nearby or in the story.

import type { ElementNode, OpenUIError } from "@openuidev/lang-core";
import { ok, type Result } from "@shared/result";
import type { DialogueGraph, MonsterSpec, NpcSpec, TreasureSpec } from "@shared/world";
import { hygieneIssues } from "../hygiene";
import { chapterLibrary } from "../libraries";
import { clampInt, clampText, LIMITS, truncate } from "../limits";
import { CHAPTER_PROPS } from "../schemas/chapter";
import { CHUNK_PROPS } from "../schemas/chunk";
import { toHex } from "../schemas/common";
import { accentFor, ROLE_LOOK } from "../schemas/looks";
import type { DslError } from "../types";
import { WITNESS_ACTIONS } from "./chunk";
import { readChoices } from "./dialogue";
import { createIdScope, slugId } from "./ids";
import {
  type ChildNode,
  childrenOf,
  createDialect,
  dslError,
  failWith,
  parseRoot,
  propError,
  readProps,
} from "./program";

const dialect = createDialect(chapterLibrary);
const TALK_HEAD = CHUNK_PROPS.Talk.pick({ npcId: true, line: true });

export const CHAPTER_PARTS = {
  npcs: { min: 1, max: 3 },
  treasures: { min: 1, max: 3 },
  monsters: { min: 2, max: 5 },
} as const;

export interface ChapterContext {
  /** False when the cartridge declares no combat: then no Monster may appear. */
  combat: boolean;
  language: string;
  /** Names already in use on the land and in the story; a person of this chapter may not take one. */
  names?: readonly string[];
}

export interface ChapterDraft {
  name: string;
  goal: string;
  npcs: NpcSpec[];
  monsters: MonsterSpec[];
  treasures: TreasureSpec[];
  dialogues: DialogueGraph[];
}

const asElement = (child: ChildNode): ElementNode => ({ props: child.props }) as ElementNode;

function countIssue(what: string, have: number, range: { min: number; max: number }) {
  return propError(
    what,
    `The chapter has ${have} ${what} statements.`,
    `Write ${range.min} to ${range.max} ${what} statements.`,
  );
}

/**
 * `ctx` null reads a stored program, checked in full when it was written: only its structure is
 * checked again, so a chapter stays playable after the game's rules change (a mod adds combat).
 */
export function toChapter(
  root: ElementNode,
  ctx: ChapterContext | null,
): Result<ChapterDraft, DslError> {
  const issues: OpenUIError[] = [];
  const head = CHAPTER_PROPS.Chapter.pick({ name: true, goal: true }).safeParse(root.props);
  const name = head.success ? clampText(head.data.name, LIMITS.text.name) : "";
  const goal = head.success ? clampText(head.data.goal, LIMITS.text.line) : "";
  if (name === "" || goal === "") {
    issues.push(
      propError(
        "Chapter",
        "The chapter needs a place name and a goal.",
        'Write root = Chapter("<place>", "<what the player does here>", [...]).',
      ),
    );
  }
  const ids = createIdScope();
  let n = 0;
  const take = (raw: string, prefix: string): string => {
    n += 1;
    return ids.take(raw, `${prefix}_${n}`);
  };
  const npcs: NpcSpec[] = [];
  const monsters: MonsterSpec[] = [];
  const treasures: TreasureSpec[] = [];
  const talks: { npcId: string; line: string; node: ChildNode }[] = [];
  for (const child of childrenOf(root)) {
    if (child.typeName === "NPC") {
      const p = readProps(CHAPTER_PROPS.NPC, child, issues);
      if (p === null) continue;
      const look = ROLE_LOOK[p.role];
      const color = toHex(p.color);
      npcs.push({
        id: take(p.id, "npc"),
        name: clampText(p.name, LIMITS.text.name),
        x: 0,
        z: 0,
        role: p.role,
        mood: p.mood,
        color,
        ...look,
        accent: accentFor(color),
      });
    } else if (child.typeName === "Monster") {
      const p = readProps(CHAPTER_PROPS.Monster, child, issues);
      if (p === null) continue;
      monsters.push({
        id: take(p.id, "monster"),
        kind: p.kind,
        x: 0,
        z: 0,
        level: clampInt(p.level, LIMITS.level),
        weakness: clampText(p.weakness, LIMITS.text.weakness),
        size: 1,
        color: null,
      });
    } else if (child.typeName === "Treasure") {
      const p = readProps(CHAPTER_PROPS.Treasure, child, issues);
      if (p === null) continue;
      const loot = p.loot.map((item) => clampText(item, LIMITS.text.loot)).filter(Boolean);
      treasures.push({
        id: take(p.id, "treasure"),
        x: 0,
        z: 0,
        loot: truncate(loot, LIMITS.maxLoot),
      });
    } else if (child.typeName === "Talk") {
      const p = readProps(TALK_HEAD, child, issues);
      if (p !== null) talks.push({ npcId: slugId(p.npcId, ""), line: p.line, node: child });
    }
  }

  const { npcs: people, treasures: finds, monsters: foes } = CHAPTER_PARTS;
  if (ctx !== null && (npcs.length < people.min || npcs.length > people.max)) {
    issues.push(countIssue("NPC", npcs.length, people));
  }
  if (ctx !== null && (treasures.length < finds.min || treasures.length > finds.max)) {
    issues.push(countIssue("Treasure", treasures.length, finds));
  }
  if (ctx !== null && !ctx.combat && monsters.length > 0) {
    issues.push(
      propError("Monster", "This game declares no combat.", "Remove every Monster statement."),
    );
  }
  if (ctx?.combat && (monsters.length < foes.min || monsters.length > foes.max)) {
    issues.push(countIssue("Monster", monsters.length, foes));
  }
  for (const duplicate of ids.duplicates()) {
    issues.push(
      propError(
        "Chapter",
        `The id ${duplicate} is used twice.`,
        "Give every statement its own id.",
      ),
    );
  }

  const dialogues: DialogueGraph[] = [];
  for (const npc of npcs) {
    const own = talks.filter((talk) => talk.npcId === npc.id);
    const talk = own[0];
    if (own.length !== 1 || talk === undefined) {
      issues.push(
        propError(
          "Talk",
          `NPC ${npc.id} has ${own.length} Talk statements.`,
          `Write exactly one Talk("${npc.id}", "<line>", [...]) for every NPC.`,
        ),
      );
      continue;
    }
    const choices = readChoices(asElement(talk.node), issues);
    const allowed = (action: string) => (WITNESS_ACTIONS as readonly string[]).includes(action);
    if (choices.length === 0 || choices.some((choice) => !allowed(choice.action))) {
      issues.push(
        propError(
          "Choice",
          `Talk for ${npc.id} needs 1 to ${LIMITS.maxChoices} answers using only ${WITNESS_ACTIONS.join(", ")}.`,
          "Rewrite its Choice statements with those actions.",
          talk.node.statementId,
        ),
      );
      continue;
    }
    dialogues.push({
      npcId: npc.id,
      line: clampText(talk.line, LIMITS.text.line),
      choices,
      mutation: null,
    });
  }
  for (const talk of talks.filter((one) => !npcs.some((npc) => npc.id === one.npcId))) {
    issues.push(
      propError(
        "Talk",
        `Talk names ${talk.npcId || "(no id)"}, which is not an NPC here.`,
        "Use the id of an NPC in this program.",
        talk.node.statementId,
      ),
    );
  }
  if (issues.length === 0 && ctx !== null) {
    issues.push(...hygieneIssues({ name, npcs, dialogues, lore: [] }, { lore: [], ...ctx }));
  }
  if (issues.length > 0) {
    return failWith(
      dslError({
        code: "dsl-invalid-chapter",
        message: `${issues.length} problem(s) with this Chapter program.`,
        hint: "Resend the whole Chapter program with every listed problem fixed.",
        errors: issues,
      }),
    );
  }
  return ok({ name, goal, npcs, monsters, treasures, dialogues });
}

export function parseChapter(
  source: string,
  ctx: ChapterContext | null,
): Result<ChapterDraft, DslError> {
  const root = parseRoot(dialect, source);
  return root.ok ? toChapter(root.value, ctx) : root;
}
