// Bible program → the two fixed anchor files of a cartridge. Rendering is deterministic, so the
// content hash of a world depends only on what the model wrote.

import type { WorldBible } from "@shared/cartridge";
import { ok, type Result } from "@shared/result";
import { bibleLibrary } from "../libraries";
import { clampText, truncate } from "../limits";
import { BIBLE_PROPS } from "../schemas/bible";
import type { DslError } from "../types";
import { createDialect, dslError, failWith, parseRoot, propError } from "./program";

const dialect = createDialect(bibleLibrary);

const lines = (values: readonly string[], max: number): string[] =>
  truncate(
    values.map((value) => clampText(value, 160)).filter((value) => value !== ""),
    max,
  );

export function parseBible(source: string): Result<WorldBible, DslError> {
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
  const rules = lines(p.rules, 6);
  const taboos = lines(p.taboos, 5);
  const issues = [];
  if (rules.length < 3)
    issues.push(propError("Bible", "Fewer than 3 rules.", "Write 3 to 6 rules."));
  if (taboos.length < 2)
    issues.push(propError("Bible", "Fewer than 2 taboos.", "Write 2 to 5 taboos."));
  for (const [name, value] of [
    ["premise", p.premise],
    ["tone", p.tone],
    ["naming", p.naming],
    ["voice", p.voice],
  ] as const) {
    if (value.trim() === "")
      issues.push(propError("Bible", `${name} is empty.`, `Write the ${name}.`));
  }
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
  return ok({
    core: [
      `Premise: ${clampText(p.premise, 600)}`,
      `Tone: ${clampText(p.tone, 200)}`,
      "Rules:",
      ...rules.map((rule) => `- ${rule}`),
      "Never:",
      ...taboos.map((taboo) => `- ${taboo}`),
    ].join("\n"),
    style: [`Naming: ${clampText(p.naming, 300)}`, `Voice: ${clampText(p.voice, 300)}`].join("\n"),
  });
}
