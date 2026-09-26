// One repair round carries every kind of mistake a program has — its structure, its names, its
// arguments and the dialect's own checks — because a small model given two rounds cannot fix three
// kinds of mistake learned one round at a time. The round must still fit a small context: the same
// complaint about several statements becomes one line naming them all, and at most MAX_COMPLAINTS
// lines go back at once.

import type { OpenUIError } from "@openuidev/lang-core";
import type { DslError } from "../types";

/** At most this many complaint lines go back in one repair round. */
export const MAX_COMPLAINTS = 12;
/** A grouped line names its statements up to about this many characters. */
const MAX_NAMES_CHARS = 400;

const unique = (values: readonly string[]): string[] => [...new Set(values)];

function namesOf(ids: readonly string[]): string | undefined {
  if (ids.length === 0) return undefined;
  const kept: string[] = [];
  let length = 0;
  for (const id of ids) {
    if (length + id.length > MAX_NAMES_CHARS) break;
    kept.push(id);
    length += id.length + 2;
  }
  const more = ids.length - kept.length;
  return more > 0 ? `${kept.join(", ")} and ${more} more` : kept.join(", ");
}

/** Complaints that say the same thing (same component, message and fix) become one line. */
function grouped(errors: readonly OpenUIError[]): OpenUIError[] {
  const groups = new Map<string, { first: OpenUIError; ids: string[] }>();
  for (const error of errors) {
    const key = `${error.component ?? ""}\u0000${error.message}\u0000${error.hint ?? ""}`;
    const group = groups.get(key) ?? { first: error, ids: [] };
    if (error.statementId !== undefined && !group.ids.includes(error.statementId)) {
      group.ids.push(error.statementId);
    }
    groups.set(key, group);
  }
  return [...groups.values()].map(({ first, ids }) => {
    const { statementId: _one, ...rest } = first;
    const names = namesOf(ids);
    return names === undefined ? rest : { ...rest, statementId: names };
  });
}

/** Bound one error's complaint lines (grouped first), saying how many were left out. */
export function bounded(error: DslError): DslError {
  const lines = grouped(error.errors);
  const unresolved = unique(error.unresolved);
  const orphaned = unique(error.orphaned);
  if (lines.length <= MAX_COMPLAINTS) return { ...error, errors: lines, unresolved, orphaned };
  const more = lines.length - MAX_COMPLAINTS;
  return {
    ...error,
    message: `${error.message} (${more} more complaint(s) are not listed: fix these first.)`,
    errors: lines.slice(0, MAX_COMPLAINTS),
    unresolved,
    orphaned,
  };
}

/**
 * Every part that went wrong, as one DslError: the first part's code (the most basic kind: the
 * structure comes before the arguments, the arguments before the dialect's checks), every message
 * and hint, and every complaint, unresolved name and unused statement once. Null when none did.
 */
export function mergeDslErrors(parts: readonly (DslError | null)[]): DslError | null {
  const found = parts.filter((part): part is DslError => part !== null);
  const first = found[0];
  if (first === undefined) return null;
  if (found.length === 1) return bounded(first);
  const seen = new Set<string>();
  const errors: OpenUIError[] = [];
  for (const error of found.flatMap((part) => part.errors)) {
    const key = `${error.statementId ?? ""}\u0000${error.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    errors.push(error);
  }
  const hints = unique(found.map((part) => part.hint ?? "").filter((hint) => hint !== ""));
  return bounded({
    code: first.code,
    message: found.map((part) => part.message).join(" "),
    hint: hints.join(" "),
    errors,
    unresolved: found.flatMap((part) => part.unresolved),
    orphaned: found.flatMap((part) => part.orphaned),
  });
}
