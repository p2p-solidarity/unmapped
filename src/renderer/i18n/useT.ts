// `t("namespace.key", { name: value })` — the only way UI chrome gets its words.

import { useCallback } from "react";
import { type UiLanguage, useLanguageStore } from "./store";
import { phrase, type StringKey } from "./strings";

export type Vars = Record<string, string | number>;
export type Translate = (key: StringKey, vars?: Vars) => string;

/** `{name}` inserts a value; `{n|one|other}` picks by count (English plurals). */
export function fill(text: string, vars?: Vars): string {
  if (vars === undefined) return text;
  return text.replace(
    /\{(\w+)(?:\|([^|{}]*)\|([^|{}]*))?\}/g,
    (whole, name: string, one?: string, other?: string) => {
      if (!(name in vars)) return whole;
      if (one === undefined || other === undefined) return String(vars[name]);
      return Number(vars[name]) === 1 ? one : other;
    },
  );
}

export function translateIn(language: UiLanguage, key: StringKey, vars?: Vars): string {
  return fill(phrase(key)[language], vars);
}

/** The same lookup outside React (toasts, busy lines, text built while loading a floor). */
export const translate: Translate = (key, vars) =>
  translateIn(useLanguageStore.getState().language, key, vars);

/** Stable per language, so it is safe in effect and callback dependency lists. */
export function useT(): Translate {
  const language = useLanguageStore((state) => state.language);
  return useCallback<Translate>((key, vars) => translateIn(language, key, vars), [language]);
}
