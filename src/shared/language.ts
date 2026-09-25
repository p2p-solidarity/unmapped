// A BCP-47 tag as the model reads it. Shared so the story prompts (shared) and the DSL prompts name
// a language the same way, and so hygiene checks can ask which script a world is written in.

/** A language tag a save may carry ("ja-JP", "zh-TW", "en"): language, then up to three subtags. */
export const LANGUAGE_TAG_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/;

/** "Hant" / "Hans" / "Jpan" … for a tag, or null when the runtime cannot tell. */
export function scriptOf(tag: string): string | null {
  try {
    return new Intl.Locale(tag).maximize().script ?? null;
  } catch {
    return null;
  }
}

/**
 * "Japanese (ja-JP)" when the runtime knows the tag, otherwise the raw tag. Chinese always names its
 * script: "Chinese (Taiwan)" alone lets a small model drift into Simplified characters.
 */
export function languageName(tag: string): string {
  let name: string | undefined;
  try {
    name = new Intl.DisplayNames(["en"], { type: "language" }).of(tag);
  } catch {
    return tag;
  }
  const base = name === undefined || name === tag ? tag : `${name} (${tag})`;
  if (!/^zh\b/i.test(tag)) return base;
  const script = scriptOf(tag);
  if (script === "Hant") return `${base}, Traditional Chinese characters only`;
  if (script === "Hans") return `${base}, Simplified Chinese characters only`;
  return base;
}

// Common characters that exist only in Simplified form; their Traditional forms differ (们/們,
// 这/這, 说/說 …). Enough to catch a model that slid into Simplified, not a full converter.
const SIMPLIFIED_ONLY =
  /[们这说么时个来对会过还没发现让给东车门开关见问间长马鸟鱼龙书读话语记认识边远选择应该为从经实头脑电动进运样种声听买卖钱觉学习写满]/;

/** True when text meant for a Traditional-Chinese world is written with Simplified characters. */
export function slipsIntoSimplified(tag: string, text: string): boolean {
  return scriptOf(tag) === "Hant" && SIMPLIFIED_ONLY.test(text);
}
