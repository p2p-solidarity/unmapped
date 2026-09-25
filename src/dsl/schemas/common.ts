// Field factories shared by the three libraries. Numeric fields deliberately carry NO min/max:
// the parser drops a component whose prop fails schema validation, and a hallucinated number
// must be clamped (see limits.ts), not thrown away.

import { z } from "zod";

/** Accepts "#rrggbb", "#rgb" and the same without the hash; `toHex` normalises the match. */
export const HEX_COLOR = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const SHORT_HEX = /^#?([0-9a-fA-F]{3})$/;

export const hexColor = (what: string): z.ZodString =>
  z.string().regex(HEX_COLOR, `${what} must be a hex colour like "#8ab6ff"`).describe(what);

/** Normalise any value the `hexColor` schema accepts to lowercase `#rrggbb`. */
export function toHex(value: string): string {
  const short = SHORT_HEX.exec(value);
  if (short?.[1] !== undefined) {
    const [r, g, b] = [...short[1]];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return `#${value.replace("#", "")}`.toLowerCase();
}

/** Free-text identifier; snake_cased and de-duplicated by the converters, never by the parser. */
export const identifier = (what: string): z.ZodString =>
  z.string().describe(`${what} — ascii snake_case, unique in the program`);

export const text = (what: string): z.ZodString => z.string().describe(what);

export const tile = (what: string): z.ZodNumber => z.int().describe(`${what} (whole tiles)`);

export const amount = (what: string): z.ZodNumber => z.number().describe(what);

export const list = (what: string): z.ZodArray<z.ZodString> => z.array(z.string()).describe(what);
