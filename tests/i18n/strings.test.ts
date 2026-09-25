import { describeError, ERRORS, fill, type Phrase, STRINGS, UI_LANGUAGES } from "@renderer/i18n";
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

  it("fills values and English plurals", () => {
    expect(fill("{n} {n|model|models}", { n: 1 })).toBe("1 model");
    expect(fill("{n} {n|model|models}", { n: 3 })).toBe("3 models");
    expect(fill("B{depth}", {})).toBe("B{depth}");
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

describe("errors on screen", () => {
  const code = Object.keys(ERRORS)[0] as string;
  const error = { code, message: "Port 8080 refused", hint: "Run llama-server --port 8080" };

  it("keeps the source's exact words in English", () => {
    expect(describeError(error, "en")).toEqual({
      message: error.message,
      hint: error.hint,
      detail: null,
    });
  });

  it("translates a known code elsewhere and keeps the original as detail", () => {
    const ja = describeError(error, "ja");
    expect(ja.message).toBe(ERRORS[code]?.message.ja);
    expect(ja.detail).toBe("Port 8080 refused — Run llama-server --port 8080");
  });

  it("shows an unknown code's own words", () => {
    const other = { code: "not-in-the-table", message: "x" };
    expect(describeError(other, "zh-TW")).toEqual({ message: "x", hint: null, detail: null });
  });
});
