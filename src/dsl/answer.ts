// What every guided answer's writer shares (./chunkAnswer.ts, ./chapterAnswer.ts): the answer is
// JSON from Apple's on-device model, so it is read with the same zod schema its JSON Schema was
// made from, and one that does not fit is a repairable DslError, never a guess. The writer owns
// only the program's bookkeeping — ids, statement names, quoting, a colour from a hue; every word
// in it is the model's.

import { ok, type Result } from "@shared/result";
import type { z } from "zod";
import { LIMITS } from "./limits";
import { slugId } from "./parse/ids";
import { dslError, failWith } from "./parse/program";
import type { DslError } from "./types";

/** A word as an OpenUI Lang string literal (JSON's quoting, which the parser reads back). */
export function quoted(value: string): string {
  return JSON.stringify(value.trim());
}

export function invalidAnswer(message: string, hint: string): Result<never, DslError> {
  return failWith(dslError({ code: "dsl-invalid-answer", message, hint }));
}

/** The answer's JSON, checked against `shape`; the first misfit is the repair round's complaint. */
export function readAnswer<S extends z.ZodType>(
  raw: string,
  shape: S,
): Result<z.infer<S>, DslError> {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return invalidAnswer(
      "The answer is not complete JSON.",
      "Answer again, shorter, and finish it.",
    );
  }
  const parsed = shape.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return invalidAnswer(
      `The answer does not fit its schema: ${first?.path.join(".") || "(root)"}: ${first?.message ?? "invalid"}.`,
      "Answer again with every field filled in.",
    );
  }
  return ok(parsed.data);
}

/**
 * An id from a name: ascii snake_case when the name has any, else `fallback`, unique among `taken`.
 * The result is one the parser keeps as it is (`slugId` of it is itself): a suffix never pushes it
 * past the id length, where the parser would cut two ids back into one.
 */
export function uniqueId(name: string, fallback: string, taken: Set<string>): string {
  const base = slugId(name, fallback);
  let id = base;
  for (let n = 2; taken.has(id); n += 1) {
    const suffix = `_${n}`;
    id = `${base.slice(0, LIMITS.text.id - suffix.length).replace(/_+$/, "")}${suffix}`;
  }
  taken.add(id);
  return id;
}

/** A clothes colour from its hue: always a fabric colour the land can show, never near-black. */
export function clothes(hue: number): string {
  const s = 0.45;
  const l = 0.5;
  const part = (n: number): string => {
    const k = (n + hue / 30) % 12;
    const value = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${part(0)}${part(8)}${part(4)}`;
}
