// Public surface of the UI language layer.
//
// A barrel rather than the store itself, so `strings/` and `useT.ts` can import the store without
// pulling their own re-export back in through this file.

export {
  contentLanguage,
  describeError,
  errorLine,
  formatDateTime,
  formatNumber,
  formatTime,
  languageLabel,
} from "./language";
export { LANGUAGE_LABEL, UI_LANGUAGES, type UiLanguage, useLanguageStore } from "./store";
export { ERRORS, type ErrorText, type Phrase, phrase, STRINGS, type StringKey } from "./strings";
export { fill, type Translate, translate, translateIn, useT, type Vars } from "./useT";
