// Inside a place (a course seen from the side, a dungeon from above): the view's own words. The
// place's name and goal are the model's, written in the world's language; only this chrome is ours.

import type { Phrase } from "./phrase";

export const PLACE_VIEW = {
  viewSide: {
    en: "{title}, seen from the side",
    "zh-TW": "{title}，側面畫面",
    ja: "{title}、横からの表示",
  },
  viewDungeon: {
    en: "{title}, seen from above",
    "zh-TW": "{title}，俯視畫面",
    ja: "{title}、見下ろし表示",
  },
  goal: { en: "Goal · {goal}", "zh-TW": "目標 · {goal}", ja: "目標 · {goal}" },
  reachEnd: {
    en: "Reach the far end (✓)",
    "zh-TW": "抵達盡頭（✓）",
    ja: "奥（✓）までたどり着く",
  },
  hintSide: {
    en: "S Drop from a ledge",
    "zh-TW": "S 從平台跳下",
    ja: "S 足場から降りる",
  },
  hintSideArmed: {
    en: "F / Click Fire · S Drop from a ledge",
    "zh-TW": "F / 點擊 開火 · S 從平台跳下",
    ja: "F / クリック 射撃 · S 足場から降りる",
  },
  hintDungeonArmed: {
    en: "Space / F / Click Fire",
    "zh-TW": "Space / F / 點擊 開火",
    ja: "Space / F / クリック 射撃",
  },
  revived: {
    en: "You are back at the way in. Take a moment to recover.",
    "zh-TW": "你回到了入口，先喘口氣。",
    ja: "入口に戻りました。少し休んでください。",
  },
} as const satisfies Record<string, Phrase>;
