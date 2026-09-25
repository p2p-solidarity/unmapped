// Public surface of the UI language layer.
//
// A barrel rather than the store itself, so `strings.ts` and `useT.ts` can import the store
// without pulling their own re-export back in through this file.

export { LANGUAGE_LABEL, UI_LANGUAGES, type UiLanguage, useLanguageStore } from "./store";
export { type Phrase, STRINGS, type StringKey } from "./strings";
export { type Translate, translate, useT } from "./useT";
