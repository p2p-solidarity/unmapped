// `ctx.systemPrompt` — the ordered registry of prompt sections and `{{variables}}`.
//
// Every contributor (built-in plugin or mod) registers a named section with an `order`; one
// assembly sorts them, resolves dynamic text, interpolates variables and joins the non-empty
// results with a blank line. Registration goes through `ctx.effect`, so unmounting a mod takes
// its sections with it.

import { type Context, Service } from "@deepseek-ai/cordis";
import type { AssembleContext, AssembledPrompt, PromptSection, VariableProvider } from "./types";

/** Valid variable names: how they are written between the braces. */
const VARIABLE_NAME = /^[a-z][a-z0-9_]*$/;

/** A complete `{{...}}` group at the scan position; the name inside is validated after. */
const GROUP_AT = /^\{\{([^{}]*)\}\}/;

/** Locale-independent comparison so two machines assemble byte-identical prompts. */
function compareNames(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareSections(a: PromptSection, b: PromptSection): number {
  return a.order - b.order || compareNames(a.name, b.name);
}

/**
 * Replace every `{{name}}` reference in `text`.
 *
 * A lone `{{` with no later `}}` is literal prose; anything else malformed, unregistered or
 * undefined throws a descriptive Error naming the section, which `runTurn` turns into a
 * `Result` error instead of a half-rendered prompt.
 */
export function interpolate(
  text: string,
  variables: Record<string, string | undefined>,
  section: string,
): string {
  let result = "";
  let last = 0;
  for (let open = text.indexOf("{{"); open >= 0; open = text.indexOf("{{", last)) {
    const group = GROUP_AT.exec(text.slice(open));
    if (group === null) {
      if (text.indexOf("}}", open + 2) >= 0) {
        throw new Error(
          `malformed prompt variable reference at "${text.slice(open, open + 16)}…" in section "${section}" (references are complete {{name}} groups)`,
        );
      }
      result += text.slice(last, open + 2);
      last = open + 2;
      continue;
    }
    const name = group[0].slice(2, -2);
    if (!VARIABLE_NAME.test(name)) {
      throw new Error(
        `malformed prompt variable reference "{{${name}}}" in section "${section}" (names match ${String(VARIABLE_NAME)})`,
      );
    }
    if (!Object.hasOwn(variables, name)) {
      const known = Object.keys(variables).sort();
      throw new Error(
        `unknown prompt variable "{{${name}}}" in section "${section}"; registered variables: ${known.length > 0 ? known.join(", ") : "(none)"}`,
      );
    }
    const value = variables[name];
    if (value === undefined) {
      throw new Error(
        `prompt variable "{{${name}}}" has no value for this assembly (section "${section}")`,
      );
    }
    result += text.slice(last, open) + value;
    last = open + group[0].length;
  }
  return result + text.slice(last);
}

export class SystemPromptService extends Service {
  private readonly sections = new Map<string, PromptSection>();
  private readonly variables = new Map<string, VariableProvider>();

  constructor(ctx: Context) {
    super(ctx, "systemPrompt");
  }

  /**
   * Register an ordered section. A duplicate name throws; the returned disposer is the exact
   * Cordis effect disposer, so unloading the owning fiber removes the section too.
   */
  section(section: PromptSection): () => void {
    if (!Number.isFinite(section.order)) {
      throw new TypeError(`prompt section "${section.name}" order must be a finite number`);
    }
    return this.ctx.effect(() => {
      if (this.sections.has(section.name)) {
        throw new Error(`prompt section "${section.name}" is already registered`);
      }
      this.sections.set(section.name, section);
      return () => {
        this.sections.delete(section.name);
      };
    }, "systemPrompt.section()");
  }

  /** Register a `{{name}}` provider, evaluated once per assembly. */
  variable(name: string, provider: VariableProvider): () => void {
    if (!VARIABLE_NAME.test(name)) {
      throw new Error(
        `invalid prompt variable name "${name}" (must match ${String(VARIABLE_NAME)})`,
      );
    }
    return this.ctx.effect(() => {
      if (this.variables.has(name)) {
        throw new Error(`prompt variable "${name}" is already registered`);
      }
      this.variables.set(name, provider);
      return () => {
        this.variables.delete(name);
      };
    }, "systemPrompt.variable()");
  }

  /** Names of the registered sections in assembly order (diagnostics; ignores empty text). */
  registered(): string[] {
    return [...this.sections.values()].sort(compareSections).map((section) => section.name);
  }

  /**
   * Resolve every section for one assembly. `turn` holds sections of this one turn (a DSL spec, a
   * world bible): they are sorted in with the registered ones but never registered, so two turns
   * running at once on one world harness never see each other's.
   *
   * @throws when a section references an unknown or valueless variable, or a turn section reuses
   * a registered name.
   */
  assemble(assemble: AssembleContext, turn: readonly PromptSection[] = []): AssembledPrompt {
    const variables: Record<string, string | undefined> = {};
    for (const [name, provider] of this.variables) variables[name] = provider(assemble);
    for (const section of turn) {
      if (this.sections.has(section.name)) {
        throw new Error(`prompt section "${section.name}" is already registered`);
      }
    }

    const parts: string[] = [];
    const names: string[] = [];
    for (const section of [...this.sections.values(), ...turn].sort(compareSections)) {
      const raw = typeof section.text === "function" ? section.text(assemble) : section.text;
      const text = section.interpolate === false ? raw : interpolate(raw, variables, section.name);
      if (text.trim().length === 0) continue;
      parts.push(text);
      names.push(section.name);
    }
    return { text: parts.join("\n\n"), sections: names };
  }
}
