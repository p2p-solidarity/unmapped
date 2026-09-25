import { ERRORS, type Phrase, STRINGS, UI_LANGUAGES } from "@renderer/i18n";
import { languageName, slipsIntoSimplified } from "@shared/language";
import { describe, expect, it } from "vitest";

const names = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)(?:\|[^|{}]*\|[^|{}]*)?\}/g)].map((m) => m[1] as string).sort();

function everyPhrase(): Array<[string, Phrase]> {
  const out: Array<[string, Phrase]> = [];
  for (const [ns, table] of Object.entries(STRINGS)) {
    for (const [key, phrase] of Object.entries(table as Record<string, Phrase>)) {
      out.push([`${ns}.${key}`, phrase]);
    }
  }
  for (const [code, text] of Object.entries(ERRORS)) {
    out.push([`errors.${code}`, text.message]);
    if (text.hint !== undefined) out.push([`errors.${code}.hint`, text.hint]);
  }
  return out;
}

describe("UI strings", () => {
  it("fills every language, with the same placeholders", () => {
    for (const [key, phrase] of everyPhrase()) {
      const expected = [...new Set(names(phrase.en))];
      for (const language of UI_LANGUAGES) {
        expect(phrase[language].trim(), `${key} [${language}]`).not.toBe("");
        expect([...new Set(names(phrase[language]))], `${key} [${language}]`).toEqual(expected);
      }
    }
  });

  it("never writes Simplified characters in the Traditional Chinese table", () => {
    for (const [key, phrase] of everyPhrase()) {
      expect(slipsIntoSimplified("zh-TW", phrase["zh-TW"]), key).toBe(false);
    }
  });
});

describe("model language names", () => {
  it("names the Chinese script so a small model keeps to it", () => {
    expect(languageName("zh-TW")).toMatch(/Traditional/);
    expect(languageName("zh-CN")).toMatch(/Simplified/);
    expect(languageName("ja-JP")).toBe("Japanese (Japan) (ja-JP)");
    expect(slipsIntoSimplified("zh-TW", "我们这里")).toBe(true);
    expect(slipsIntoSimplified("zh-TW", "我們這裡")).toBe(false);
  });
});
