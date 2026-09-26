// A single-call dialect as a program shape (@shared/llm): its arguments in order, each words or a
// bounded list of words, with the descriptions the library spec already shows the model. Apple's
// on-device model decodes against it and writes the program itself; the parser still checks it.

import { BIBLE_LIMITS } from "@shared/bible";
import type { ProgramArg, ProgramShape } from "@shared/llm";
import { z } from "zod";
import { BIBLE_PROPS } from "./schemas/bible";

type Bounds = Readonly<Record<string, { min: number; max: number }>>;

export function programShape(root: string, props: z.ZodObject, bounds: Bounds = {}): ProgramShape {
  const args = Object.entries(props.shape).map(([name, schema]): ProgramArg => {
    const description = (schema as z.ZodType).description ?? name;
    if (!(schema instanceof z.ZodArray)) return { name, description, kind: "text" };
    const bound = bounds[name];
    return bound === undefined
      ? { name, description, kind: "list" }
      : { name, description, kind: "list", minItems: bound.min, maxItems: bound.max };
  });
  return { root, args };
}

/** The world bible: seven parts, its two lists bounded by what the draft keeps. */
export const BIBLE_SHAPE: ProgramShape = programShape("Bible", BIBLE_PROPS.Bible, {
  rules: BIBLE_LIMITS.rules,
  taboos: BIBLE_LIMITS.taboos,
});
