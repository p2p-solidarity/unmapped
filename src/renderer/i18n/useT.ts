// `t("key", { name: value })` — the only way UI chrome gets its words.

import { useLanguageStore } from "./store";
import { STRINGS, type StringKey } from "./strings";

export type Translate = (key: StringKey, vars?: Record<string, string | number>) => string;

function fill(text: string, vars?: Record<string, string | number>): string {
  if (vars === undefined) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/** The same lookup outside React, for text built while loading a floor. */
export const translate: Translate = (key, vars) =>
  fill(STRINGS[key][useLanguageStore.getState().language], vars);

export function useT(): Translate {
  const language = useLanguageStore((state) => state.language);
  return (key, vars) => fill(STRINGS[key][language], vars);
}
