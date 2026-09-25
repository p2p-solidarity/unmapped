// Place program → the life of a course or a dungeon (a SceneGraph the host sets on its own ground)
// plus each resident's words, written once with the place so talking inside never asks the model
// (plan.md §1.4). The Scene half is read by the Scene dialect's own walker; Talk statements are
// checked here the way the Chunk and Chapter dialects check theirs, and every structural problem a
// repair round can fix becomes an issue.

import type { ElementNode, OpenUIError } from "@openuidev/lang-core";
import { ok, type Result } from "@shared/result";
import type { DialogueGraph, SceneGraph } from "@shared/world";
import { hygieneIssues } from "../hygiene";
import { placeLibrary } from "../libraries";
import { clampText, LIMITS } from "../limits";
import { CHUNK_PROPS } from "../schemas/chunk";
import type { DslError } from "../types";
import { WITNESS_ACTIONS } from "./chunk";
import { readChoices } from "./dialogue";
import { slugId } from "./ids";
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
import { toSceneGraph } from "./scene";

const dialect = createDialect(placeLibrary);
/** Choices are element nodes; they are read by `readChoices`, not by the Talk schema. */
const TALK_HEAD = CHUNK_PROPS.Talk.pick({ npcId: true, line: true });

export interface PlaceContext {
  /** The world's language: prose in any other script is sent back (../hygiene.ts). */
  language: string;
}

export interface PlaceDraft {
  /** What lives in the place, before the host moves it onto the built ground. */
  graph: SceneGraph;
  /** One Dialogue per resident, keyed by `npcId`. */
  dialogues: DialogueGraph[];
}

const asElement = (child: ChildNode): ElementNode => ({ props: child.props }) as ElementNode;

/** Every resident's one Talk, as a Dialogue; a missing, doubled or stray Talk is an issue. */
function residentsWords(
  graph: SceneGraph,
  children: readonly ChildNode[],
  issues: OpenUIError[],
): DialogueGraph[] {
  const talks: { npcId: string; line: string; node: ChildNode }[] = [];
  for (const child of children) {
    if (child.typeName !== "Talk") continue;
    const p = readProps(TALK_HEAD, child, issues);
    if (p !== null) talks.push({ npcId: slugId(p.npcId, ""), line: p.line, node: child });
  }
  const allowed = (action: string) => (WITNESS_ACTIONS as readonly string[]).includes(action);
  const dialogues: DialogueGraph[] = [];
  for (const npc of graph.npcs) {
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
    const line = clampText(talk.line, LIMITS.text.line);
    if (line === "") {
      issues.push(
        propError(
          "Talk",
          `Talk for ${npc.id} says nothing.`,
          "Write what they say when approached.",
          talk.node.statementId,
        ),
      );
      continue;
    }
    dialogues.push({ npcId: npc.id, line, choices, mutation: null });
  }
  for (const talk of talks.filter((one) => !graph.npcs.some((npc) => npc.id === one.npcId))) {
    issues.push(
      propError(
        "Talk",
        `Talk names ${talk.npcId || "(no id)"}, which is not an NPC here.`,
        "Use the id of an NPC in this program.",
        talk.node.statementId,
      ),
    );
  }
  return dialogues;
}

/** Walk a parsed `Place` root: its life as a Scene, and what each resident says. */
export function toPlace(root: ElementNode, ctx: PlaceContext): Result<PlaceDraft, DslError> {
  // The Scene walker only reads the root's name, biome and children, which a Place shares.
  const scene = toSceneGraph(root);
  if (!scene.ok) return scene;
  const issues: OpenUIError[] = [];
  const dialogues = residentsWords(scene.value, childrenOf(root), issues);
  if (issues.length === 0) {
    const prose = { name: scene.value.name, npcs: scene.value.npcs, dialogues, lore: [] };
    issues.push(...hygieneIssues(prose, { lore: [], language: ctx.language }));
  }
  if (issues.length > 0) {
    return failWith(
      dslError({
        code: "dsl-invalid-place",
        message: `${issues.length} problem(s) with this Place program.`,
        hint: "Resend the whole Place program with every listed problem fixed.",
        errors: issues,
      }),
    );
  }
  return ok({ graph: scene.value, dialogues });
}

/** Parse and check one Place program the model wrote. */
export function parsePlace(source: string, ctx: PlaceContext): Result<PlaceDraft, DslError> {
  const root = parseRoot(dialect, source);
  return root.ok ? toPlace(root.value, ctx) : root;
}
