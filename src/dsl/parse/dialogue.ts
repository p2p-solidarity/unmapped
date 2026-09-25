// Dialogue program → DialogueGraph: at most three distinct choices and a mutation only when it
// actually changes something.

import type { ElementNode, OpenUIError } from "@openuidev/lang-core";
import { ok, type Result } from "@shared/result";
import type { DialogueChoice, DialogueGraph, WorldMutation } from "@shared/world";
import { dialogueLibrary } from "../libraries";
import { clampFloat, clampText, LIMITS, truncate } from "../limits";
import { toHex } from "../schemas/common";
import { DIALOGUE_PROPS } from "../schemas/dialogue";
import type { DslError } from "../types";
import { slugId } from "./ids";
import {
  childOf,
  childrenOf,
  createDialect,
  dslError,
  failWith,
  parseRoot,
  readProps,
} from "./program";

const dialect = createDialect(dialogueLibrary);

const HEAD = DIALOGUE_PROPS.Dialogue.pick({ npcId: true, line: true });

function readChoices(root: ElementNode, issues: OpenUIError[]): DialogueChoice[] {
  const seen = new Set<string>();
  const choices: DialogueChoice[] = [];
  for (const child of childrenOf(root, "choices")) {
    if (child.typeName !== "Choice") continue;
    const p = readProps(DIALOGUE_PROPS.Choice, child, issues);
    if (p === null) continue;
    const label = clampText(p.label, LIMITS.text.label);
    const key = label.toLowerCase();
    if (label === "" || seen.has(key)) continue;
    seen.add(key);
    choices.push({
      label,
      action: p.action,
      effect: clampText(p.effect, LIMITS.text.effect),
      gives: truncate(
        p.gives.map((item) => clampText(item, LIMITS.text.loot)).filter((item) => item !== ""),
        LIMITS.maxGives,
      ),
    });
  }
  return truncate(choices, LIMITS.maxChoices);
}

function readMutation(root: ElementNode, issues: OpenUIError[]): WorldMutation | null {
  const child = childOf(root, "mutation");
  if (child === null || child.typeName !== "Mutation") return null;
  const p = readProps(DIALOGUE_PROPS.Mutation, child, issues);
  if (p === null) return null;
  const mutation: WorldMutation = {
    skyColor: p.skyColor === null || p.skyColor === undefined ? null : toHex(p.skyColor),
    fogDensity:
      p.fogDensity === null || p.fogDensity === undefined
        ? null
        : clampFloat(p.fogDensity, LIMITS.fogDensity),
    biome: p.biome ?? null,
  };
  const changes =
    mutation.skyColor !== null || mutation.fogDensity !== null || mutation.biome !== null;
  return changes ? mutation : null;
}

/** Walk a parsed `Dialogue` root into the narrative layer's DialogueGraph. */
export function toDialogue(root: ElementNode): Result<DialogueGraph, DslError> {
  const issues: OpenUIError[] = [];
  const head = HEAD.safeParse(root.props);
  if (!head.success) {
    return failWith(
      dslError({
        code: "dsl-invalid-props",
        message: `Dialogue(npcId, line, choices, mutation) is wrong: ${head.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("; ")}`,
        hint: 'Write root = Dialogue("<npc id>", "<what the NPC says>", [c1, c2]).',
      }),
    );
  }

  const choices = readChoices(root, issues);
  const mutation = readMutation(root, issues);
  if (issues.length > 0) {
    return failWith(
      dslError({
        code: "dsl-invalid-props",
        message: `${issues.length} statement(s) have arguments the engine cannot use.`,
        hint: "Resend the whole dialogue with those statements corrected.",
        errors: issues,
      }),
    );
  }
  if (choices.length === 0) {
    return failWith(
      dslError({
        code: "dsl-no-choices",
        message: "The dialogue offers the player nothing to answer.",
        hint: `Add 1 to ${LIMITS.maxChoices} Choice(label, action, effect, gives) statements with different labels and list them in the Dialogue choices array.`,
      }),
    );
  }

  const line = clampText(head.data.line, LIMITS.text.line);
  return ok({
    npcId: slugId(head.data.npcId, "npc"),
    line,
    choices,
    mutation,
  });
}

/** Parse one `Dialogue` program. */
export function parseDialogue(source: string): Result<DialogueGraph, DslError> {
  const root = parseRoot(dialect, source);
  return root.ok ? toDialogue(root.value) : root;
}
