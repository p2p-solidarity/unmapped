// Bible program → the six parts of a world bible (@shared/bible), bounded and checked. The player
// reviews and edits those parts in Create a game; `flattenBible` renders the cartridge's two anchor
// files from them at publish, deterministically, so a world's content hash depends only on its
// words.

import {
  BIBLE_LIMITS,
  type BibleFields,
  bibleProblems,
  clampLine,
  cleanItems,
} from "@shared/bible";
import { ok, type Result } from "@shared/result";
import { bibleLibrary } from "../libraries";
import { BIBLE_PROPS } from "../schemas/bible";
import type { DslError } from "../types";
import { createDialect, dslError, failWith, parseRoot, propError } from "./program";

const dialect = createDialect(bibleLibrary);

export function parseBible(source: string): Result<BibleFields, DslError> {
  const root = parseRoot(dialect, source);
  if (!root.ok) return root;
  const parsed = BIBLE_PROPS.Bible.safeParse(root.value.props);
  if (!parsed.success) {
    return failWith(
      dslError({
        code: "dsl-invalid-props",
        message: `Bible(...) has invalid arguments — ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
        hint: 'Write root = Bible("<premise>", "<tone>", ["<rule>", …], ["<taboo>", …], "<naming>", "<voice>").',
      }),
    );
  }
  const p = parsed.data;
  const fields: BibleFields = {
    premise: clampLine(p.premise, BIBLE_LIMITS.premise),
    tone: clampLine(p.tone, BIBLE_LIMITS.tone),
    rules: cleanItems("rules", p.rules),
    taboos: cleanItems("taboos", p.taboos),
    naming: clampLine(p.naming, BIBLE_LIMITS.naming),
    voice: clampLine(p.voice, BIBLE_LIMITS.voice),
  };
  const issues = bibleProblems(fields).map((problem) => {
    if (problem.part === "rules")
      return propError("Bible", "Fewer than 3 rules.", "Write 3 to 6 rules.");
    if (problem.part === "taboos")
      return propError("Bible", "Fewer than 2 taboos.", "Write 2 to 5 taboos.");
    return propError("Bible", `${problem.part} is empty.`, `Write the ${problem.part}.`);
  });
  if (issues.length > 0) {
    return failWith(
      dslError({
        code: "dsl-invalid-bible",
        message: `${issues.length} problem(s) with this Bible.`,
        hint: "Resend the whole Bible program with every part written.",
        errors: issues,
      }),
    );
  }
  return ok(fields);
}
