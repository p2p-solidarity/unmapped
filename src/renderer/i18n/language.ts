// The UI language meets everything else: the language a new world is written in, how a BCP-47 tag
// is named on screen, dates, and how an error reads.

import type { AppError } from "@shared/result";
import { type UiLanguage, useLanguageStore } from "./store";
import { ERRORS } from "./strings";

const current = (): UiLanguage => useLanguageStore.getState().language;

/**
 * The language a new world is written in unless the player picks another: the UI language, in the
 * OS's regional form when the two agree (an en-GB machine keeps en-GB).
 */
export function contentLanguage(ui: UiLanguage = current()): string {
  const os = typeof navigator === "undefined" ? "" : navigator.language;
  if (ui === "en") return os.startsWith("en") ? os : "en-US";
  if (ui === "ja") return "ja-JP";
  return "zh-TW";
}

/** "日文（日本）" for `ja-JP` in a Chinese UI; the raw tag when the runtime cannot name it. */
export function languageLabel(tag: string, ui: UiLanguage = current()): string {
  try {
    return new Intl.DisplayNames([ui], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

function asDate(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Date and time in the UI language; the raw value when it is not a date. */
export function formatDateTime(value: string | number | Date, ui: UiLanguage = current()): string {
  const date = asDate(value);
  return date === null ? String(value) : date.toLocaleString(ui);
}

export function formatTime(value: string | number | Date, ui: UiLanguage = current()): string {
  const date = asDate(value);
  return date === null ? String(value) : date.toLocaleTimeString(ui);
}

export function formatNumber(value: number, ui: UiLanguage = current()): string {
  return value.toLocaleString(ui);
}

const CJK = /[぀-ヿ㐀-鿿]/;

/**
 * What an error says on screen. English shows the source's own words, which name the exact step
 * (`sudo fm license`, a port, a path). Another language shows the code's table entry, with the
 * original English kept as `detail` so nothing specific is lost. An unknown code shows the source.
 * (A few sources are written in Chinese; English reads those from the table too.)
 */
export function describeError(
  error: AppError,
  ui: UiLanguage = current(),
): { message: string; hint: string | null; detail: string | null } {
  const text = ERRORS[error.code];
  const source = { message: error.message, hint: error.hint ?? null, detail: null };
  if (text === undefined) return source;
  if (ui === "en" && !CJK.test(`${error.message} ${error.hint ?? ""}`)) return source;
  const original = error.hint === undefined ? error.message : `${error.message} — ${error.hint}`;
  return {
    message: text.message[ui],
    hint: text.hint?.[ui] ?? error.hint ?? null,
    detail: original === text.message[ui] ? null : original,
  };
}

/** One line for a toast: the error in the UI language, with its hint after a dash. */
export function errorLine(error: AppError, ui: UiLanguage = current()): string {
  const { message, hint } = describeError(error, ui);
  return hint === null ? message : `${message} — ${hint}`;
}
