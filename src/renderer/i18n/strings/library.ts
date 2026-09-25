// The Worlds library (title → Worlds): its sections, the saves list and the continent section.
// The cartridge, archive, ENS and New Game lines it shows keep their `title.*` keys.

import type { Phrase } from "./phrase";

export const LIBRARY = {
  heading: { en: "Worlds", "zh-TW": "世界", ja: "ワールド" },
  sections: { en: "Library sections", "zh-TW": "收藏分類", ja: "ライブラリの分類" },
  backToTitle: { en: "← Title", "zh-TW": "← 標題畫面", ja: "← タイトル" },

  // ── Sections (the nav on the left) ─────────────────────────────────────────────────────────
  sectionNew: { en: "New game", "zh-TW": "新遊戲", ja: "はじめから" },
  sectionSaves: { en: "Saves", "zh-TW": "存檔", ja: "セーブ" },
  sectionCartridges: { en: "Cartridges", "zh-TW": "卡帶", ja: "カートリッジ" },
  sectionContinent: { en: "Continent", "zh-TW": "大陸", ja: "大陸" },
  sectionArchive: { en: "Archive", "zh-TW": "封存", ja: "アーカイブ" },

  // ── Saves ──────────────────────────────────────────────────────────────────────────────────
  readingSaves: { en: "Reading saves…", "zh-TW": "正在讀取存檔…", ja: "セーブを読み込み中…" },
  noSaves: {
    en: "No saves yet. Start a new game, create a world, or restore a backup.",
    "zh-TW": "還沒有存檔。開始新遊戲、創造世界，或還原備份。",
    ja: "セーブはまだありません。はじめから遊ぶか、世界をつくるか、バックアップから復元してください。",
  },

  // ── Continent ──────────────────────────────────────────────────────────────────────────────
  continentIntro: {
    en: "Choose the saved world you will bring. Open its door to friends, or enter a friend's door number and walk through.",
    "zh-TW": "選擇要帶去的存檔世界。向夥伴敞開它的門，或輸入夥伴的門牌後穿過去。",
    ja: "持っていくセーブ済みの世界を選んでください。仲間に扉を開くか、仲間の扉番号を入力してくぐります。",
  },
  continentNoWorld: {
    en: "No saved world yet. Start a new game or create a world first.",
    "zh-TW": "尚無存檔世界。請先開始新遊戲或創造世界。",
    ja: "セーブ済みの世界がありません。先にはじめから遊ぶか、世界をつくってください。",
  },
  continentPickWorld: {
    en: "Choose a world above first.",
    "zh-TW": "請先在上方選擇一個世界。",
    ja: "まず上で世界を選んでください。",
  },
} as const satisfies Record<string, Phrase>;
