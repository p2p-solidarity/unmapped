// The gamepad's hint lines: the HUD's control row as it reads after a pad input (@shared/input).
// Button names (A, B, X, Y, RB, LS, Start, ✚) are printed on the pad and stay as they are; only the
// verbs are translated, like the key hints in hud.ts.

import type { Phrase } from "./phrase";

export const INPUT = {
  padLandArmed: {
    en: "LS / ✚ Move · RB Sprint · X Fire · A Interact · Y Notes · Start Menu",
    "zh-TW": "LS / ✚ 移動 · RB 衝刺 · X 開火 · A 互動 · Y 留言 · Start 選單",
    ja: "LS / ✚ 移動 · RB ダッシュ · X 射撃 · A 調べる · Y メモ · Start メニュー",
  },
  padLand: {
    en: "LS / ✚ Move · RB Sprint · A Interact · Y Notes · Start Menu",
    "zh-TW": "LS / ✚ 移動 · RB 衝刺 · A 互動 · Y 留言 · Start 選單",
    ja: "LS / ✚ 移動 · RB ダッシュ · A 調べる · Y メモ · Start メニュー",
  },
  padLand3d: {
    en: "LS / ✚ Move · RB Sprint · B Jump · A Interact · Y Notes · Start Menu",
    "zh-TW": "LS / ✚ 移動 · RB 衝刺 · B 跳躍 · A 互動 · Y 留言 · Start 選單",
    ja: "LS / ✚ 移動 · RB ダッシュ · B ジャンプ · A 調べる · Y メモ · Start メニュー",
  },
  padFpsArmed: {
    en: "LS / ✚ Move · X Fire · A Interact · Start Menu",
    "zh-TW": "LS / ✚ 移動 · X 開火 · A 互動 · Start 選單",
    ja: "LS / ✚ 移動 · X 射撃 · A 調べる · Start メニュー",
  },
  padFps: {
    en: "LS / ✚ Move · A Interact · Start Menu",
    "zh-TW": "LS / ✚ 移動 · A 互動 · Start 選單",
    ja: "LS / ✚ 移動 · A 調べる · Start メニュー",
  },
  padSide: {
    en: "LS / ✚ Move · B Jump · A Interact · Start Menu",
    "zh-TW": "LS / ✚ 移動 · B 跳躍 · A 互動 · Start 選單",
    ja: "LS / ✚ 移動 · B ジャンプ · A 調べる · Start メニュー",
  },
  padTopdown: {
    en: "LS / ✚ Move · A Interact · Start Menu",
    "zh-TW": "LS / ✚ 移動 · A 互動 · Start 選單",
    ja: "LS / ✚ 移動 · A 調べる · Start メニュー",
  },
  padTps: {
    en: "LS / ✚ Move · RB Sprint · B Jump · A Interact · Start Menu",
    "zh-TW": "LS / ✚ 移動 · RB 衝刺 · B 跳躍 · A 互動 · Start 選單",
    ja: "LS / ✚ 移動 · RB ダッシュ · B ジャンプ · A 調べる · Start メニュー",
  },
} as const satisfies Record<string, Phrase>;
