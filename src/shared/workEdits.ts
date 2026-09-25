// The model's reply format for worlds: a tiny line protocol instead of JSON, because escaping a
// whole program inside a JSON string is the most common way a first generation breaks.
//
//   @@summary            one or two sentences for the player
//   @@file main.js       the whole file
//   @@edit main.js       SEARCH/REPLACE blocks against the current file (all a repair may use)
//   @@end
//
// `applyWorkReply` turns a reply into the next WorkText. Every problem is returned as a sentence
// the model can act on, because the same messages become the repair prompt.

import { err, ok, type Result } from "./result";
import {
  assetMapSchema,
  textOf,
  WORK_CODE_FILES,
  WORK_LIMITS,
  type WorkCodeFile,
  type WorkText,
  withFile,
} from "./works";

export interface SearchReplace {
  search: string;
  replace: string;
}

export interface WorkReply {
  summary: string;
  files: Partial<Record<WorkCodeFile, string>>;
  edits: Partial<Record<WorkCodeFile, SearchReplace[]>>;
}

const HEADER = /^@@(summary|file|edit|end)\b[ \t]*(\S*)[ \t]*$/;
const SEARCH = /^<{5,}\s*SEARCH\s*$/;
const DIVIDER = /^={5,}\s*$/;
const REPLACE = /^>{5,}\s*REPLACE\s*$/;
const FENCE = /^```/;

function isCodeFile(value: string): value is WorkCodeFile {
  return (WORK_CODE_FILES as readonly string[]).includes(value);
}

/** Drops one surrounding Markdown fence, which models add even when told not to. */
function unfence(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]?.trim() === "") start += 1;
  while (end > start && lines[end - 1]?.trim() === "") end -= 1;
  if (end - start >= 2 && FENCE.test(lines[start] ?? "") && FENCE.test(lines[end - 1] ?? "")) {
    return lines.slice(start + 1, end - 1);
  }
  return lines.slice(start, end);
}

function parseBlocks(lines: string[], file: string): Result<SearchReplace[]> {
  const blocks: SearchReplace[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "" || FENCE.test(line)) {
      index += 1;
      continue;
    }
    if (!SEARCH.test(line)) {
      return err(
        "reply-format",
        `@@edit ${file}: expected "<<<<<<< SEARCH", got "${line.trim()}".`,
      );
    }
    const search: string[] = [];
    const replace: string[] = [];
    index += 1;
    while (index < lines.length && !DIVIDER.test(lines[index] ?? "")) {
      search.push(lines[index] ?? "");
      index += 1;
    }
    if (index >= lines.length) return err("reply-format", `@@edit ${file}: missing "=======".`);
    index += 1;
    while (index < lines.length && !REPLACE.test(lines[index] ?? "")) {
      replace.push(lines[index] ?? "");
      index += 1;
    }
    if (index >= lines.length) {
      return err("reply-format", `@@edit ${file}: missing ">>>>>>> REPLACE".`);
    }
    index += 1;
    if (search.join("").trim() === "") {
      return err("reply-format", `@@edit ${file}: a SEARCH block is empty; use @@file instead.`);
    }
    blocks.push({ search: search.join("\n"), replace: replace.join("\n") });
  }
  return ok(blocks);
}

export function parseWorkReply(text: string): Result<WorkReply> {
  const reply: WorkReply = { summary: "", files: {}, edits: {} };
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let section: { kind: string; path: string; lines: string[] } | null = null;
  let seen = false;

  const close = (): Result<void> => {
    if (section === null) return ok(undefined);
    const { kind, path } = section;
    const body = unfence(section.lines);
    if (kind === "summary") {
      reply.summary = body.join(" ").replace(/\s+/g, " ").trim().slice(0, WORK_LIMITS.summaryChars);
      return ok(undefined);
    }
    if (!isCodeFile(path)) {
      return err(
        "reply-format",
        `@@${kind} "${path}" is not one of ${WORK_CODE_FILES.join(", ")}.`,
      );
    }
    if (kind === "file") {
      reply.files[path] = body.join("\n");
      return ok(undefined);
    }
    const blocks = parseBlocks(body, path);
    if (!blocks.ok) return blocks;
    reply.edits[path] = [...(reply.edits[path] ?? []), ...blocks.value];
    return ok(undefined);
  };

  for (const line of lines) {
    const header = HEADER.exec(line);
    if (header === null) {
      section?.lines.push(line);
      continue;
    }
    const closed = close();
    if (!closed.ok) return closed;
    seen = true;
    const kind = header[1] ?? "";
    if (kind === "end") {
      section = null;
      break;
    }
    section = { kind, path: header[2] ?? "", lines: [] };
  }
  const closed = close();
  if (!closed.ok) return closed;
  if (!seen) {
    return err(
      "reply-format",
      "The reply has no @@summary / @@file / @@edit sections.",
      "Answer only in the @@ line format.",
    );
  }
  if (Object.keys(reply.files).length === 0 && Object.keys(reply.edits).length === 0) {
    return err("reply-format", "The reply changes no file.");
  }
  return ok(reply);
}

function occurrences(haystack: string, needle: string): number[] {
  const found: number[] = [];
  let from = 0;
  while (found.length < 2) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    found.push(at);
    from = at + 1;
  }
  return found;
}

/** Exact match first; then the same lines with trailing whitespace ignored. */
function applyBlock(source: string, block: SearchReplace, file: string): Result<string> {
  const exact = occurrences(source, block.search);
  if (exact.length === 1) {
    const at = exact[0] ?? 0;
    return ok(source.slice(0, at) + block.replace + source.slice(at + block.search.length));
  }
  if (exact.length > 1) {
    return err(
      "edit-ambiguous",
      `${file}: this SEARCH text appears more than once:\n${block.search}`,
    );
  }
  const trimEnd = (value: string): string =>
    value
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n");
  const loose = occurrences(trimEnd(source), trimEnd(block.search));
  if (loose.length !== 1) {
    return err(
      "edit-no-match",
      `${file}: SEARCH text not found exactly once. Copy it from the current file:\n${block.search}`,
    );
  }
  const lines = source.split("\n");
  const want = trimEnd(block.search).split("\n");
  for (let start = 0; start + want.length <= lines.length; start += 1) {
    if (want.every((line, offset) => (lines[start + offset] ?? "").trimEnd() === line)) {
      lines.splice(start, want.length, ...block.replace.split("\n"));
      return ok(lines.join("\n"));
    }
  }
  return err("edit-no-match", `${file}: SEARCH text not found.`);
}

export interface AppliedReply {
  text: WorkText;
  changed: WorkCodeFile[];
  summary: string;
}

/**
 * What a reply is answering. A first generation writes whole files; an edit may use either form;
 * a repair must patch with SEARCH/REPLACE, because a whole-file rewrite to fix one line is the most
 * expensive thing a model does here (docs/experiments/interactive-works-acceptance.md).
 */
export type WorkReplyMode = "generate" | "edit" | "repair";

/** Validates what every stored candidate must satisfy, whoever wrote it. */
export function checkWorkText(text: WorkText): string[] {
  const problems: string[] = [];
  for (const file of WORK_CODE_FILES) {
    const bytes = new TextEncoder().encode(textOf(text, file)).length;
    if (bytes > WORK_LIMITS.codeBytes)
      problems.push(`${file} is ${bytes} bytes; the limit is ${WORK_LIMITS.codeBytes}.`);
  }
  if (text.main.trim() === "") problems.push("main.js is empty.");
  if (/^\s*(import|export)\s/m.test(text.main)) {
    problems.push("main.js must be a classic script: remove import/export statements.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.assets);
  } catch (error) {
    problems.push(
      `assets.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
    return problems;
  }
  const assets = assetMapSchema.safeParse(parsed);
  if (!assets.success) {
    const issue = assets.error.issues[0];
    problems.push(
      `assets.json: ${issue?.path.join(".") || "root"} — ${issue?.message ?? "invalid"}`,
    );
  }
  return problems;
}

/**
 * Builds the next text from a reply without validating it: `base` (null for a first generation,
 * which must then supply main.js) plus whole files, then SEARCH/REPLACE blocks. In "repair" mode a
 * whole file is refused for any file that already has content.
 */
export function assembleWorkReply(
  base: WorkText | null,
  reply: WorkReply,
  mode: WorkReplyMode,
): Result<WorkText> {
  let next: WorkText;
  if (base === null) {
    const { files } = reply;
    if (files["main.js"] === undefined)
      return err("reply-incomplete", "A new world needs @@file main.js.");
    next = {
      main: files["main.js"],
      style: files["style.css"] ?? "",
      assets: files["assets.json"] ?? "{}",
    };
  } else {
    next = base;
    for (const file of WORK_CODE_FILES) {
      const whole = reply.files[file];
      if (whole === undefined) continue;
      if (mode === "repair" && textOf(base, file).trim() !== "") {
        return err(
          "repair-whole-file",
          `A repair must not resend ${file} with @@file. Answer with @@edit ${file} SEARCH/REPLACE blocks that change only the lines causing the problems.`,
        );
      }
      next = withFile(next, file, whole);
    }
  }
  for (const file of WORK_CODE_FILES) {
    for (const block of reply.edits[file] ?? []) {
      const applied = applyBlock(textOf(next, file), block, file);
      if (!applied.ok) return applied;
      next = withFile(next, file, applied.value);
    }
  }
  return ok(next);
}

/**
 * Applies a parsed reply on top of `base` and validates the result. `changed` lists the files that
 * differ from `parent` (the stored candidate this one will point at; defaults to `base`).
 */
export function applyWorkReply(
  base: WorkText | null,
  reply: WorkReply,
  options: { mode?: WorkReplyMode; parent?: WorkText | null } = {},
): Result<AppliedReply> {
  const assembled = assembleWorkReply(
    base,
    reply,
    options.mode ?? (base === null ? "generate" : "edit"),
  );
  if (!assembled.ok) return assembled;
  const next = assembled.value;
  const problems = checkWorkText(next);
  if (problems.length > 0) return err("work-invalid", problems.join("\n"));
  if (base !== null && WORK_CODE_FILES.every((file) => textOf(base, file) === textOf(next, file))) {
    return err("reply-noop", "The reply left every file unchanged.");
  }
  const parent = options.parent === undefined ? base : options.parent;
  const changed = WORK_CODE_FILES.filter(
    (file) => parent === null || textOf(parent, file) !== textOf(next, file),
  );
  return ok({ text: next, changed, summary: reply.summary });
}
