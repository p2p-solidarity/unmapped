// GBNF grammar for llama.cpp's `grammar` field. It constrains the shape of a Scene program —
// statements, calls, literals and the closed set of component names — so a local model cannot
// answer with prose or invent a component. Types, ranges and composition stay the parser's job.
//
// The component list is derived from the library, so Patch and Platform arrive here the moment
// they are defined; `arg` must keep `true`/`false` (Platform bounce), `null` (an omitted-in-the-
// middle optional) and decimals (Platform y/height, Monster size).

import { SCENE_COMPONENT_NAMES } from "./libraries";

const RULES = (components: string): string[] => [
  "# Aether Spire — Scene dialect of OpenUI Lang. Structural only; the parser checks types.",
  "root ::= ws stmt (nl stmt)* ws",
  'stmt ::= ident sp "=" sp call',
  'call ::= comp sp "(" ws args? ws ")"',
  `comp ::= ${components}`,
  'args ::= arg (ws "," ws arg)*',
  'arg ::= string | number | "true" | "false" | "null" | array | call | ident',
  'array ::= "[" ws items? ws "]"',
  'items ::= item (ws "," ws item)*',
  "item ::= ident | string | number | call",
  "ident ::= [a-z_] [a-zA-Z0-9_]*",
  'string ::= ["] schar* ["]',
  'schar ::= [^"\\\\] | [\\\\] ["\\\\nrtbfu/]',
  'number ::= "-"? [0-9]+ ("." [0-9]+)?',
  "sp ::= [ \\t]*",
  'nl ::= sp "\\n" (sp "\\n")*',
  "ws ::= [ \\t\\n]*",
];

/** The Scene dialect as a GBNF grammar (llama.cpp `grammar` field). */
export function sceneGrammar(): string {
  const components = SCENE_COMPONENT_NAMES.map((name) => `"${name}"`).join(" | ");
  return `${RULES(components).join("\n")}\n`;
}
