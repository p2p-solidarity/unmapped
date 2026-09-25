// Shared parse pipeline: normalize model output, alias the reserved names, run the lang-core
// parser and turn everything that went wrong into one DslError the repair prompt can quote.

import {
  createParser,
  type ElementNode,
  enrichErrors,
  type Library,
  type LibraryJSONSchema,
  type OpenUIError,
  type Parser,
  type ValidationError,
} from "@openuidev/lang-core";
import { ok, type Result } from "@shared/result";
import type { z } from "zod";
import { normalizeOutput } from "../normalize";
import type { DslError } from "../types";
import { aliasSchema, aliasSource, publicName, publicText } from "./alias";

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

/**
 * Normalize + parse one program and return its root element. Anything that would silently drop
 * content (parser errors, unresolved references, orphaned statements) fails instead.
 */
export function parseRoot(dialect: Dialect, source: string): Result<ElementNode, DslError> {
  const program = aliasSource(normalizeOutput(source));
  // The parser skips a statement named in another script (`阿潮 = NPC(...)`) and every reference
  // to it without a word, so the program "parses" short of its people. Refuse it by name instead.
  const foreign = foreignNames(program);
  if (foreign.length > 0) {
    return failWith(
      dslError({
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
      }),
    );
  }
  const result = dialect.parser.parse(program);
  const { meta } = result;

  if (meta.errors.length > 0) {
    return failWith(
      dslError({
        code: codeFor(meta.errors),
        message: `${meta.errors.length} statement(s) of the ${dialect.root} program are invalid.`,
        hint: `Fix the listed statements and resend the whole program. Every call must match its signature, e.g. root = ${dialect.root}(...).`,
        errors: enrich(meta.errors, dialect),
        unresolved: meta.unresolved,
        orphaned: meta.orphaned,
      }),
    );
  }
  if (result.root === null || meta.statementCount === 0) {
    return failWith(
      dslError({
        code: "dsl-parse",
        message: `No ${dialect.root} program was found in the answer.`,
        hint: `Answer with openui-lang statements only — one \`name = Component(...)\` per line, ending with root = ${dialect.root}(...). No prose, no code fences.`,
        unresolved: meta.unresolved,
        orphaned: meta.orphaned,
      }),
    );
  }
  if (publicName(result.root.typeName) !== dialect.root) {
    return failWith(
      dslError({
        code: "dsl-wrong-root",
        message: `The root statement is ${publicName(result.root.typeName)}, not ${dialect.root}.`,
        hint: `The last statement must be root = ${dialect.root}(...).`,
      }),
    );
  }
  if (result.root.partial || meta.incomplete) {
    return failWith(
      dslError({
        code: "dsl-incomplete",
        message: "The program stopped in the middle of a statement.",
        hint: "Resend the complete program; close every parenthesis, bracket and quote.",
        unresolved: meta.unresolved,
        orphaned: meta.orphaned,
      }),
    );
  }
  if (meta.unresolved.length > 0) {
    return failWith(
      dslError({
        code: "dsl-unresolved-reference",
        message: `Referenced but never defined: ${meta.unresolved.join(", ")}.`,
        hint: "Every name used inside an array must be defined by its own `name = Component(...)` statement.",
        unresolved: meta.unresolved,
        orphaned: meta.orphaned,
      }),
    );
  }
  if (meta.orphaned.length > 0) {
    return failWith(
      dslError({
        code: "dsl-orphaned-statement",
        message: `Defined but never used: ${meta.orphaned.join(", ")}.`,
        hint: `Add every defined name to the children array of root = ${dialect.root}(...), or delete it.`,
        orphaned: meta.orphaned,
      }),
    );
  }
  return ok(result.root);
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

/** Re-validate parsed props with the component's own zod schema; collect model-facing errors. */
export function readProps<T>(
  schema: z.ZodType<T>,
  child: ChildNode,
  issues: OpenUIError[],
): T | null {
  const parsed = schema.safeParse(child.props);
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
