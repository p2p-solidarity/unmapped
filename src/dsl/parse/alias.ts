// `Floor` is an openui-lang builtin (Math.floor) and `Mutation` is a reserved tool call, so the
// parser would never see either of them as a component. Both names are part of our dialect, so
// the source text and the JSON Schema are rewritten to internal names just before parsing and
// every name that comes back out — including the ones inside error messages — is rewritten back.

import type { LibraryJSONSchema } from "@openuidev/lang-core";

/** Public dialect name → name the parser is allowed to see. */
export const RESERVED_ALIASES: Readonly<Record<string, string>> = {
  Floor: "FloorPlate",
  Mutation: "WorldShift",
};

const PUBLIC_BY_INTERNAL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(RESERVED_ALIASES).map(([publicName, internal]) => [internal, publicName]),
);

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_]/;

/** Rewrite reserved component calls (`Floor(`) to their internal name, ignoring string literals. */
export function aliasSource(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const ch = source.charAt(i);
    if (ch === '"') {
      let j = i + 1;
      while (j < source.length) {
        const c = source.charAt(j);
        if (c === "\\") {
          j += 2;
          continue;
        }
        j += 1;
        if (c === '"') break;
      }
      out += source.slice(i, j);
      i = j;
      continue;
    }
    if (IDENT_START.test(ch)) {
      let j = i + 1;
      while (j < source.length && IDENT_PART.test(source.charAt(j))) j += 1;
      const word = source.slice(i, j);
      let k = j;
      while (source.charAt(k) === " " || source.charAt(k) === "\t") k += 1;
      const alias = RESERVED_ALIASES[word];
      out += alias !== undefined && source.charAt(k) === "(" ? alias : word;
      i = j;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Rename the reserved `$defs` entries (and every `$ref` to them) to their internal names. */
export function aliasSchema(schema: LibraryJSONSchema): LibraryJSONSchema {
  let text = JSON.stringify(schema);
  for (const [publicName, internal] of Object.entries(RESERVED_ALIASES)) {
    text = text.split(`"#/$defs/${publicName}"`).join(`"#/$defs/${internal}"`);
  }
  const next = JSON.parse(text) as LibraryJSONSchema;
  const defs = next.$defs;
  if (defs) {
    for (const [publicName, internal] of Object.entries(RESERVED_ALIASES)) {
      const def = defs[publicName];
      if (def !== undefined) {
        defs[internal] = def;
        delete defs[publicName];
      }
    }
  }
  return next;
}

/** Internal component name → the name the model and the engine use. */
export function publicName(name: string): string {
  return PUBLIC_BY_INTERNAL[name] ?? name;
}

/** Same, for anything human readable (parser messages, hints, available-component lists). */
export function publicText(text: string): string {
  let out = text;
  for (const [internal, name] of Object.entries(PUBLIC_BY_INTERNAL)) {
    out = out.split(internal).join(name);
  }
  return out;
}
