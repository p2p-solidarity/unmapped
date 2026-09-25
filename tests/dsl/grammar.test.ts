import { SCENE_COMPONENT_NAMES, sceneGrammar } from "@dsl/index";
import { SCENE_EXAMPLES } from "@dsl/prompts/sceneExamples";
import { ARCHETYPES } from "@shared/world";
import { describe, expect, it } from "vitest";

const grammar = sceneGrammar();

const rules = ((): Map<string, string> => {
  const out = new Map<string, string>();
  for (const line of grammar.split("\n")) {
    if (line.trim() === "" || line.startsWith("#")) continue;
    const match = /^([a-z][a-z0-9_]*) ::= (.+)$/.exec(line);
    if (match === null) throw new Error(`not a GBNF rule: ${line}`);
    const [, name, body] = match;
    if (name === undefined || body === undefined) continue;
    out.set(name, body);
  }
  return out;
})();

/** Rule body with every literal and character class removed. */
const bare = (body: string): string =>
  body.replace(/"(?:[^"\\]|\\.)*"/g, " ").replace(/\[(?:[^\]\\]|\\.)*\]/g, " ");

describe("sceneGrammar", () => {
  it("names every scene component and nothing else", () => {
    const comp = rules.get("comp");
    expect(comp).toBeDefined();
    expect(comp).toBe(SCENE_COMPONENT_NAMES.map((name) => `"${name}"`).join(" | "));
    for (const name of SCENE_COMPONENT_NAMES) expect(grammar).toContain(`"${name}"`);
    for (const name of ["Patch", "Platform"]) expect(SCENE_COMPONENT_NAMES).toContain(name);
    for (const alien of ["Wizard", "Dialogue", "Item", "Choice"]) {
      expect(grammar).not.toContain(`"${alien}"`);
    }
  });

  it("is balanced", () => {
    const count = (needle: string): number => grammar.split(needle).length - 1;
    expect(count("{")).toBe(count("}"));
    expect(count("(")).toBe(count(")"));
    expect(count('"') % 2).toBe(0);
  });

  it("starts at root and defines every rule it references", () => {
    expect(rules.has("root")).toBe(true);
    for (const [, body] of rules) {
      for (const reference of bare(body).match(/[a-z][a-z0-9_]*/g) ?? []) {
        expect(rules.has(reference), `rule "${reference}" is referenced but never defined`).toBe(
          true,
        );
      }
    }
  });

  it("allows every literal the scene dialect uses, booleans included", () => {
    const arg = rules.get("arg") ?? "";
    for (const literal of ['"true"', '"false"', '"null"', "string", "number", "array", "call"]) {
      expect(arg).toContain(literal);
    }
  });

  it("covers every token of the example programs", () => {
    const ident = new RegExp(`^${rules.get("ident")?.replace(/ /g, "") ?? ""}$`);
    for (const archetype of ARCHETYPES) {
      for (const line of SCENE_EXAMPLES[archetype].split("\n")) {
        const name = line.split(" = ")[0] ?? "";
        const component = line.split(" = ")[1]?.split("(")[0] ?? "";
        expect(ident.test(name), `${name} must be a legal statement name`).toBe(true);
        expect(SCENE_COMPONENT_NAMES).toContain(component);
      }
    }
  });

  it("cannot match prose: every statement needs an identifier, '=' and a known call", () => {
    expect(rules.get("root")).toContain("stmt");
    expect(rules.get("stmt")).toBe('ident sp "=" sp call');
    expect(rules.get("call")).toContain("comp");
    expect(rules.get("ident")).toBe("[a-z_] [a-zA-Z0-9_]*");
  });
});
