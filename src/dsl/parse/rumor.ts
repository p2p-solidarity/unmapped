// Rumors program → one line per slot (rev 6 phase 3, D14). With a context, every rumor is also put
// to the history's own validator (`validateRumor`: the slot exists, the line names its fact and no
// other name the world knows), and each refusal becomes an issue the repair round quotes — so a
// validator refusal counts as one of Rule 7's two repairs. Without one, only the structure is read
// (`validateEventBody` round-trips a stored rumor's text this way).

import type { OpenUIError } from "@openuidev/lang-core";
import { HISTORY_LIMITS, isOneLine } from "@shared/history/bodies";
import { validateRumor } from "@shared/history/rumor";
import type { WorldNow } from "@shared/history/types";
import { ok, type Result } from "@shared/result";
import { RUMOR_PROPS, rumorLibrary } from "../schemas/rumor";
import type { DslError } from "../types";
import {
  childrenOf,
  createDialect,
  dslError,
  failWith,
  parseRoot,
  propError,
  readProps,
} from "./program";

const dialect = createDialect(rumorLibrary);

export interface RumorDraft {
  slot: number;
  text: string;
}

export interface RumorContext {
  /** The slots this batch writes (the beat's open ones); any other slot is sent back. */
  slots: readonly number[];
  /** The fold the batch is written against, the beat's event id and the writer's key. */
  now: WorldNow;
  beat: string;
  author: string;
}

/** Whitespace runs (line breaks included) become one space; ends are trimmed. */
export function normalRumorText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function textIssue(text: string): string | null {
  if (text === "") return "says nothing";
  if (text.length > HISTORY_LIMITS.rumorChars) {
    return `is ${text.length} characters long; the most is ${HISTORY_LIMITS.rumorChars}`;
  }
  return isOneLine(text) ? null : "contains control characters";
}

/** Parse one Rumors program; `ctx` null reads only its structure. */
export function parseRumors(
  source: string,
  ctx: RumorContext | null,
): Result<RumorDraft[], DslError> {
  const root = parseRoot(dialect, source);
  if (!root.ok) return root;
  const issues: OpenUIError[] = [];
  const drafts: RumorDraft[] = [];
  for (const child of childrenOf(root.value)) {
    if (child.typeName !== "Rumor") continue;
    const p = readProps(RUMOR_PROPS.Rumor, child, issues);
    if (p === null) continue;
    const at = child.statementId;
    const text = normalRumorText(p.text);
    const listed = ctx === null ? [] : ctx.slots.map(String);
    if (!Number.isInteger(p.slot) || p.slot < 0 || (ctx !== null && !ctx.slots.includes(p.slot))) {
      issues.push(
        propError(
          "Rumor",
          `Rumor names slot ${String(p.slot)}, which is not one of the listed slots.`,
          ctx === null ? "Use a listed slot number." : `Use one of: ${listed.join(", ")}.`,
          at,
        ),
      );
      continue;
    }
    if (drafts.some((draft) => draft.slot === p.slot)) {
      issues.push(
        propError("Rumor", `Slot ${p.slot} has two rumors.`, "Write one rumor per slot.", at),
      );
      continue;
    }
    const problem = textIssue(text);
    if (problem !== null) {
      issues.push(
        propError(
          "Rumor",
          `Rumor ${p.slot} ${problem}.`,
          `Write one line of 1 to ${HISTORY_LIMITS.rumorChars} characters.`,
          at,
        ),
      );
      continue;
    }
    if (ctx !== null) {
      const body = { beat: ctx.beat, slot: p.slot, text };
      const valid = validateRumor(ctx.now, { author: ctx.author, body });
      if (!valid.ok) {
        issues.push(propError("Rumor", valid.error.message, valid.error.hint ?? "", at));
        continue;
      }
    }
    drafts.push({ slot: p.slot, text });
  }
  if (ctx !== null && drafts.length === 0 && issues.length === 0) {
    issues.push(
      propError("Rumors", "No rumor was written.", "Write a Rumor for at least one listed slot."),
    );
  }
  if (issues.length > 0) {
    return failWith(
      dslError({
        code: "dsl-invalid-rumors",
        message: `${issues.length} problem(s) with this Rumors program.`,
        hint: "Resend the whole Rumors program with every listed problem fixed.",
        errors: issues,
      }),
    );
  }
  return ok(drafts);
}

/** Drafts → a Rumors program; `parseRumors(serializeRumors(d), null)` deep-equals `d`. */
export function serializeRumors(drafts: readonly RumorDraft[]): string {
  const names = drafts.map((_draft, index) => `r${index}`);
  const lines = [
    `root = Rumors([${names.join(", ")}])`,
    ...drafts.map(
      (draft, index) => `${names[index]} = Rumor(${draft.slot}, ${JSON.stringify(draft.text)})`,
    ),
  ];
  return `${lines.join("\n")}\n`;
}
