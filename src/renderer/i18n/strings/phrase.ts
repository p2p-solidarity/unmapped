import type { UiLanguage } from "../store";

/**
 * One UI line in every language. The type requires all of them, so a missing translation fails the
 * typecheck instead of showing up blank. `{name}` inserts a value; `{n|one|other}` picks the
 * English plural by count ("{n} {n|model|models}"); Chinese and Japanese just write `{n}`.
 */
export type Phrase = Record<UiLanguage, string>;
