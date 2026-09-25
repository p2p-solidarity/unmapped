// Every UI namespace. A key is `namespace.key` (`t("create.worldName")`), so each screen owns its
// own table file and two screens can never collide on a name.

import { COMMON } from "./common";
import { CONSOLE } from "./console";
import { CONTINENT } from "./continent";
import { CREATE } from "./create";
import { DEPTHS } from "./depths";
import { HUD } from "./hud";
import { IDENTITY } from "./identity";
import { INPUT } from "./input";
import { LAND } from "./land";
import { MODEL } from "./model";
import type { Phrase } from "./phrase";
import { TITLE } from "./title";
import { USAGE } from "./usage";
import { WORKS } from "./works";

export const STRINGS = {
  common: COMMON,
  console: CONSOLE,
  continent: CONTINENT,
  create: CREATE,
  depths: DEPTHS,
  hud: HUD,
  identity: IDENTITY,
  input: INPUT,
  land: LAND,
  model: MODEL,
  title: TITLE,
  usage: USAGE,
  works: WORKS,
} as const;

type Table = typeof STRINGS;

export type StringKey = {
  [N in keyof Table]: `${N}.${Extract<keyof Table[N], string>}`;
}[keyof Table];

export function phrase(key: StringKey): Phrase {
  const dot = key.indexOf(".");
  const table = STRINGS[key.slice(0, dot) as keyof Table] as Record<string, Phrase>;
  return table[key.slice(dot + 1)] as Phrase;
}

export { ERRORS, type ErrorText } from "./errors";
export type { Phrase } from "./phrase";
