// The user turn sent after a failed parse. It quotes the program back with every complaint the
// parser and the converters made, and asks for one complete corrected program — never a patch,
// because a partial answer cannot be validated on its own.

import { normalizeOutput } from "./normalize";
import type { DslError } from "./types";

function failingStatements(error: DslError): string[] {
  return error.errors.map((item) => {
    const where = item.statementId ?? "(root statement)";
    const what = item.component === undefined ? "" : ` [${item.component}]`;
    const fix = item.hint === undefined ? "" : `\n  fix: ${item.hint}`;
    return `- ${where}${what}: ${item.message}${fix}`;
  });
}

/** User-turn repair message for a program the DSL rejected. */
export function repairPrompt(source: string, error: DslError): string {
  const parts: string[] = [
    "Your program was rejected. Fix it and send the whole program again.",
    `## Why\n${error.code}: ${error.message}${error.hint === undefined ? "" : `\n${error.hint}`}`,
  ];

  const statements = failingStatements(error);
  if (statements.length > 0) parts.push(`## Failing statements\n${statements.join("\n")}`);
  if (error.unresolved.length > 0) {
    parts.push(
      `## Referenced but never defined\n${error.unresolved
        .map((name) => `- ${name}`)
        .join("\n")}\nDefine each of them with its own statement, or remove the reference.`,
    );
  }
  if (error.orphaned.length > 0) {
    parts.push(
      `## Defined but never used\n${error.orphaned
        .map((name) => `- ${name}`)
        .join("\n")}\nAdd each of them to the root statement's array, or delete the statement.`,
    );
  }

  parts.push(`## The program you sent\n${normalizeOutput(source)}`);
  parts.push(
    "## What to answer\nSend the COMPLETE corrected program: every statement, root first, nothing else. No prose, no explanation, no code fences, no comments, no partial patch.",
  );
  return parts.join("\n\n");
}
