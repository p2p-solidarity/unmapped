// Shared parse pipeline: normalize model output, alias the reserved names, run the lang-core
// parser and turn everything that went wrong into one DslError the repair prompt can quote. Every
// kind of mistake is collected in one pass (./complaints.ts), so one repair round hears about all
// of them: a small model with two rounds cannot fix three kinds learned one round at a time.

import {
  autoClose,
  createParser,
  type ElementNode,
  enrichErrors,
  type Library,
  type LibraryJSONSchema,
  type OpenUIError,
  type Parser,
  split,
  tokenize,
  type ValidationError,
} from "@openuidev/lang-core";
import { ok, type Result } from "@shared/result";
import { z } from "zod";
import { normalizeOutput } from "../normalize";
import type { DslError } from "../types";
import { aliasSchema, aliasSource, publicName, publicText } from "./alias";
import { mergeDslErrors } from "./complaints";

export interface Dialect {
  root: string;
  parser: Parser;
  schema: LibraryJSONSchema;
  /** Component names as the parser knows them (aliased). */
  names: string[];
}

export function createDialect(library: Library): Dialect {
  const root = library.root ?? "";
  const schema = aliasSchema(library.toJSONSchema());
  return {
    root,
    schema,
    parser: createParser(schema, root),
    names: Object.keys(schema.$defs ?? {}),
  };
}

export interface DslErrorInput {
  code: string;
  message: string;
  hint: string;
  errors?: OpenUIError[];
  unresolved?: string[];
  orphaned?: string[];
}

export function dslError(input: DslErrorInput): DslError {
  return {
    code: input.code,
    message: input.message,
    hint: input.hint,
    errors: input.errors ?? [],
    unresolved: input.unresolved ?? [],
    orphaned: input.orphaned ?? [],
  };
}

const ASCII_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** `name = ` at the start of a line, where the name is anything but spaces and punctuation. */
const STATEMENT_HEAD = /^\s*([^\s=(),"'[\]]+)\s*=(?!=)/;

/** Statement names the parser would skip silently; empty when every name is ascii. */
export function foreignNames(program: string): string[] {
  const names: string[] = [];
  for (const line of program.split("\n")) {
    const name = STATEMENT_HEAD.exec(line)?.[1];
    if (name !== undefined && !ASCII_NAME.test(name) && !names.includes(name)) names.push(name);
  }
  return names;
}

export function failWith(error: DslError): Result<never, DslError> {
  return { ok: false, error };
}

/** Build a model-facing error for one statement the zod schemas rejected. */
export function propError(
  component: string,
  message: string,
  hint: string,
  statementId?: string,
): OpenUIError {
  const base: OpenUIError = { source: "parser", code: "type-mismatch", component, message, hint };
  return statementId === undefined ? base : { ...base, statementId };
}

function enrich(errors: ValidationError[], dialect: Dialect): OpenUIError[] {
  return enrichErrors(errors, dialect.schema, dialect.names).map((error) => ({
    ...error,
    component: error.component === undefined ? undefined : publicName(error.component),
    message: publicText(error.message),
    hint: error.hint === undefined ? undefined : publicText(error.hint),
  }));
}

const codeFor = (errors: readonly ValidationError[]): string =>
  errors.some((error) => error.code === "unknown-component")
    ? "dsl-unknown-component"
    : "dsl-invalid-props";

// ── Statements as the parser splits them ─────────────────────────────────────────────────────

/** lang-core's own comment rule (`//` and `#` outside a string), so statements split the same. */
function stripComments(program: string): string {
  let quote: string | null = null;
  return program
    .split("\n")
    .map((line) => {
      for (let i = 0; i < line.length; i++) {
        const c = line.charAt(i);
        if (quote !== null) {
          if (c === "\\") i += 1;
          else if (c === quote) quote = null;
          continue;
        }
        if (c === '"' || c === "'") quote = c;
        else if ((c === "/" && line.charAt(i + 1) === "/") || c === "#") {
          return line.slice(0, i).trimEnd();
        }
      }
      return line;
    })
    .join("\n");
}

interface StatementHead {
  id: string;
  /** The component it calls (public name), or null when it is not a call. */
  component: string | null;
}

/** Every statement in order, duplicates included (the parser keeps only the last of a name). */
function statementHeads(program: string): StatementHead[] {
  const { text } = autoClose(stripComments(program).trim());
  return split(tokenize(text)).map((statement) => {
    const [head, open] = statement.tokens;
    const called = typeof head?.v === "string" && open !== undefined && Number(open.t) === 1;
    return { id: statement.id, component: called ? publicName(String(head.v)) : null };
  });
}

/** Statement names the program defines more than once. */
export function redefinedNames(source: string): string[] {
  const seen = new Set<string>();
  const twice: string[] = [];
  for (const { id } of statementHeads(aliasSource(normalizeOutput(source)))) {
    if (seen.has(id) && !twice.includes(id)) twice.push(id);
    seen.add(id);
  }
  return twice;
}

/**
 * Model output only (the write path): a statement defined twice goes back to the model with
 * whatever else was wrong, instead of the parser keeping the last one without a word. Stored
 * content keeps being read as it always was (the last definition wins), so nothing accepted
 * before this rule stops opening.
 */
export function refuseRedefined<T>(
  source: string,
  parsed: Result<T, DslError>,
): Result<T, DslError> {
  const twice = redefinedNames(source);
  if (twice.length === 0) return parsed;
  const redefined = dslError({
    code: "dsl-duplicate-id",
    message: `Defined more than once: ${twice.join(", ")}.`,
    hint: "Give every statement a name of its own: rename the later one (and list it where it belongs), or delete it.",
    errors: twice.map((name) =>
      propError(
        "statement",
        `${name} is defined more than once, so only its last definition would be kept.`,
        "Rename one of them, or delete the one you do not mean.",
        name,
      ),
    ),
  });
  const merged = mergeDslErrors([redefined, parsed.ok ? null : parsed.error]);
  return failWith(merged ?? redefined);
}

// ── One program, every mistake ───────────────────────────────────────────────────────────────

/** A program read as far as it goes, and everything wrong with it as a program. */
export interface ProgramReading {
  /** The root element to convert; null when there is none (no program, wrong root, cut short). */
  root: ElementNode | null;
  /** Every structural mistake at once; null when there is none. */
  error: DslError | null;
  /** Components (public names) with a statement that was refused or never used. */
  refused: ReadonlySet<string>;
}

/**
 * Statements the root never reaches are never checked, so a round that only listed them would
 * learn of their own mistakes a round later. Parsed once more with a last `root` naming them (the
 * parser keeps the last definition of a name), each of them is checked too.
 */
function unusedStatementErrors(dialect: Dialect, program: string, unused: string[]): OpenUIError[] {
  const probe = dialect.parser.parse(`${program}\nroot = [${unused.join(", ")}]`);
  return enrich(probe.meta.errors, dialect);
}

function foreignError(foreign: string[]): DslError {
  return dslError({
    code: "dsl-invalid-name",
    message: `Statement names must be ascii: ${foreign.join(", ")}.`,
    hint: "Name every statement in ascii snake_case (a_chao = NPC(...)) and use that name in the arrays; only the quoted strings may use other scripts.",
    errors: foreign.map((name) =>
      propError(
        "statement",
        `"${name}" is not an ascii name, so the statement was lost.`,
        "Rename it in ascii snake_case, where it is defined and where it is used.",
      ),
    ),
  });
}

/**
 * Normalize + parse one program. Anything that would silently drop content — parser errors,
 * statements named in another script, unresolved references, statements never used — is
 * reported, all of it in one error. The root is still returned when there is one, so a dialect
 * can add its own checks to the same round.
 */
export function readProgram(dialect: Dialect, source: string): ProgramReading {
  const program = aliasSource(normalizeOutput(source));
  const parts: DslError[] = [];
  const refused = new Set<string>();
  // The parser skips a statement named in another script (`阿潮 = NPC(...)`) and every reference
  // to it without a word, so the program "parses" short of its people. Refuse it by name instead.
  const foreign = foreignNames(program);
  if (foreign.length > 0) parts.push(foreignError(foreign));
  const result = dialect.parser.parse(program);
  const { meta } = result;
  const done = (root: ElementNode | null): ProgramReading => ({
    root,
    error: mergeDslErrors(parts),
    refused,
  });

  if (meta.errors.length > 0) {
    const errors = enrich(meta.errors, dialect);
    for (const error of errors) if (error.component !== undefined) refused.add(error.component);
    parts.push(
      dslError({
        code: codeFor(meta.errors),
        message: `${meta.errors.length} statement(s) of the ${dialect.root} program are invalid.`,
        hint: `Fix the listed statements and resend the whole program. Every call must match its signature, e.g. root = ${dialect.root}(...).`,
        errors,
      }),
    );
  }
  if (result.root === null || meta.statementCount === 0) {
    // A root refused for its own arguments is already in the parser's errors.
    if (meta.errors.length === 0) {
      parts.push(
        dslError({
          code: "dsl-parse",
          message: `No ${dialect.root} program was found in the answer.`,
          hint: `Answer with openui-lang statements only — one \`name = Component(...)\` per line, ending with root = ${dialect.root}(...). No prose, no code fences.`,
        }),
      );
    }
    return done(null);
  }
  if (publicName(result.root.typeName) !== dialect.root) {
    parts.push(
      dslError({
        code: "dsl-wrong-root",
        message: `The root statement is ${publicName(result.root.typeName)}, not ${dialect.root}.`,
        hint: `The last statement must be root = ${dialect.root}(...).`,
      }),
    );
    return done(null);
  }
  if (result.root.partial || meta.incomplete) {
    parts.push(
      dslError({
        code: "dsl-incomplete",
        message: "The program stopped in the middle of a statement.",
        hint: "Resend the complete program; close every parenthesis, bracket and quote.",
      }),
    );
    return done(null);
  }
  if (meta.unresolved.length > 0) {
    const names = [...new Set(meta.unresolved)];
    parts.push(
      dslError({
        code: "dsl-unresolved-reference",
        message: `Referenced but never defined: ${names.join(", ")}.`,
        hint: "Every name used inside an array must be defined by its own `name = Component(...)` statement. A value is written as a quoted string or a number, never a bare word, and an optional argument you do not need is left out.",
        unresolved: names,
      }),
    );
  }
  if (meta.orphaned.length > 0) {
    // The parser keeps the last definition of a name, so the last one says what it calls.
    const calls = new Map(statementHeads(program).map((head) => [head.id, head.component]));
    for (const name of meta.orphaned) {
      const component = calls.get(name);
      if (component !== undefined && component !== null) refused.add(component);
    }
    const errors = unusedStatementErrors(dialect, program, meta.orphaned);
    for (const error of errors) if (error.component !== undefined) refused.add(error.component);
    parts.push(
      dslError({
        code: "dsl-orphaned-statement",
        message: `Defined but never used: ${meta.orphaned.join(", ")}.`,
        hint: `Add every defined name to the children array of root = ${dialect.root}(...), or delete it.`,
        orphaned: meta.orphaned,
        errors,
      }),
    );
  }
  return done(result.root);
}

/**
 * Normalize + parse one program and return its root element. Anything that would silently drop
 * content (parser errors, unresolved references, orphaned statements) fails instead.
 */
export function parseRoot(dialect: Dialect, source: string): Result<ElementNode, DslError> {
  const reading = readProgram(dialect, source);
  if (reading.error !== null) return failWith(reading.error);
  if (reading.root === null) {
    return failWith(
      dslError({
        code: "dsl-parse",
        message: `No ${dialect.root} program was found in the answer.`,
        hint: `End with root = ${dialect.root}(...).`,
      }),
    );
  }
  return ok(reading.root);
}

export interface ChildNode {
  typeName: string;
  props: Record<string, unknown>;
  statementId: string | undefined;
}

const isElement = (value: unknown): value is ElementNode =>
  typeof value === "object" &&
  value !== null &&
  (value as { type?: unknown }).type === "element" &&
  typeof (value as { typeName?: unknown }).typeName === "string";

/** Complete element children of `node`, with reserved names mapped back to the public dialect. */
export function childrenOf(node: ElementNode, key = "children"): ChildNode[] {
  const raw = node.props[key];
  const values = Array.isArray(raw) ? raw : [];
  const out: ChildNode[] = [];
  for (const value of values) {
    if (!isElement(value) || value.partial) continue;
    out.push({
      typeName: publicName(value.typeName),
      props: value.props,
      statementId: value.statementId,
    });
  }
  return out;
}

/** A single optional element prop (e.g. `Dialogue.mutation`). */
export function childOf(node: ElementNode, key: string): ChildNode | null {
  const value = node.props[key];
  if (!isElement(value) || value.partial) return null;
  return {
    typeName: publicName(value.typeName),
    props: value.props,
    statementId: value.statementId,
  };
}

// ── Arguments ────────────────────────────────────────────────────────────────────────────────

/** What a model writes in an argument it means to leave out. */
const PLACEHOLDERS = new Set(["", "none", "null", "nil", "n/a", "undefined"]);

export const isPlaceholder = (value: unknown): boolean =>
  typeof value === "string" && PLACEHOLDERS.has(value.trim().toLowerCase());

/**
 * A placeholder in an optional argument that the field cannot hold reads as the argument left
 * out. A required argument is never guessed, a placeholder the field accepts is the model's own
 * answer ("none" is a hat), and anything else wrong stays wrong.
 */
function withoutPlaceholders(
  schema: z.ZodType,
  props: Record<string, unknown>,
): Record<string, unknown> {
  if (!(schema instanceof z.ZodObject)) return props;
  let out: Record<string, unknown> | null = null;
  for (const [key, field] of Object.entries(schema.shape as Record<string, z.ZodType>)) {
    const value = props[key];
    if (!isPlaceholder(value)) continue;
    if (!field.safeParse(undefined).success || field.safeParse(value).success) continue;
    out ??= { ...props };
    delete out[key];
  }
  return out ?? props;
}

/** Re-validate parsed props with the component's own zod schema; collect model-facing errors. */
export function readProps<T>(
  schema: z.ZodType<T>,
  child: ChildNode,
  issues: OpenUIError[],
): T | null {
  const parsed = schema.safeParse(withoutPlaceholders(schema, child.props));
  if (parsed.success) return parsed.data;
  const detail = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
  issues.push(
    propError(
      child.typeName,
      `${child.typeName}(...) has invalid arguments — ${detail}`,
      `Check the signature of ${child.typeName} and the allowed values for every argument.`,
      child.statementId,
    ),
  );
  return null;
}
