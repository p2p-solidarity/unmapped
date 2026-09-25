// The endless depths below a finished run: the descent, its floors and their objectives.

import type { Phrase } from "./phrase";

export const DEPTHS = {
  enterDepths: {
    en: "Enter the depths",
    "zh-TW": "進入無盡深層",
    ja: "深層へ進む",
  },
  depthsNote: {
    en: "Below the ending, every floor is generated from this save's seed and gets harder.",
    "zh-TW": "結局之下的每一層都由這個存檔的種子生成，越往下越難。",
    ja: "エンディングの下の階層はこのセーブのシードから生成され、深いほど難しくなります。",
  },
  descending: {
    en: "Descending to B{depth}…",
    "zh-TW": "前往 B{depth}…",
    ja: "B{depth} へ降りています…",
  },
  reachedDepth: {
    en: "B{depth}",
    "zh-TW": "B{depth}",
    ja: "B{depth}",
  },
  objectiveClear: {
    en: "Clear every hostile on this floor, then take the stairs down.",
    "zh-TW": "清光這一層的敵人，再走樓梯往下。",
    ja: "この階の敵をすべて倒してから階段を降りる。",
  },
  objectiveLoot: {
    en: "Open every cache on this floor, then take the stairs down.",
    "zh-TW": "打開這一層所有的寶箱，再走樓梯往下。",
    ja: "この階の宝箱をすべて開けてから階段を降りる。",
  },
  objectiveReach: {
    en: "Find the stairs down.",
    "zh-TW": "找到往下的樓梯。",
    ja: "下り階段を見つける。",
  },
  objectiveUnmet: {
    en: "Not yet: {left} left.",
    "zh-TW": "還不行：還剩 {left} 個。",
    ja: "まだです：残り {left}。",
  },
  retryFloor: {
    en: "Retry this floor",
    "zh-TW": "重試這一層",
    ja: "この階をやり直す",
  },
} as const satisfies Record<string, Phrase>;
