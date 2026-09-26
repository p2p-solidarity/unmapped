// Rumors (rev 6 phase 3, WP7: D13–D15): what residents pass on about what members did, the
// per-device switch that lets this device write a beat's rumors in the background, and what the
// screen says about a batch. The rumors themselves are the model's words, in the world's language
// (Rule 10); only the chrome around them is here.

import type { ErrorText } from "./errors";
import type { Phrase } from "./phrase";

export const RUMORS = {
  // ── Talk ──────────────────────────────────────────────────────────────────────────────────
  theySay: { en: "They say…", "zh-TW": "聽說……", ja: "噂では…" },
  notShared: {
    en: "not shared yet",
    "zh-TW": "尚未分享出去",
    ja: "まだ共有されていません",
  },

  // ── Settings → Advanced settings → Shared worlds ───────────────────────────────────────────────
  switchHeading: { en: "Rumors", "zh-TW": "傳聞", ja: "噂" },
  switchLabel: {
    en: "Write rumors in the background",
    "zh-TW": "在背景寫下傳聞",
    ja: "バックグラウンドで噂を書く",
  },
  switchIntro: {
    en: "Now and then, the residents of a shared world pass on what friends did there. This device can write those rumors with its own model: at most one call each time, counted in that world's usage. Auto writes them only for worlds you own, and never with the free allowance.",
    "zh-TW":
      "共享世界每隔一段時間，居民會傳述朋友們在那裡做過的事。這台裝置可以用自己的模型寫下這些傳聞：每次最多呼叫一次，記在那個世界的用量裡。「自動」只替你擁有的世界寫，也從不花用免費額度。",
    ja: "共有ワールドでは、ときどき住人たちが友だちのしたことを語り継ぎます。この端末は自分のモデルでその噂を書けます。1 回につき呼び出しは多くて 1 回で、そのワールドの使用量に記録されます。「自動」はあなたが持ち主のワールドでだけ書き、無料枠は使いません。",
  },
  switchAuto: { en: "Auto", "zh-TW": "自動", ja: "自動" },
  switchOn: { en: "On", "zh-TW": "開", ja: "オン" },
  switchOff: { en: "Off", "zh-TW": "關", ja: "オフ" },
  switchNote: {
    en: "Only for shared worlds you have joined. Walking never waits for it.",
    "zh-TW": "只用於你加入的共享世界。走動時從不需要等它。",
    ja: "参加している共有ワールドだけが対象です。歩くときに待たされることはありません。",
  },

  // ── A batch ───────────────────────────────────────────────────────────────────────────────
  batchReady: {
    en: "Residents have news: {n} {n|rumor|rumors} written",
    "zh-TW": "居民們有了新消息：寫下 {n} 則傳聞",
    ja: "住人たちに新しい話題：噂を {n} 件書きました",
  },
  batchFailed: {
    en: "This time's rumors were not written: {reason}",
    "zh-TW": "這一次的傳聞沒有寫成：{reason}",
    ja: "今回の噂は書けませんでした：{reason}",
  },
  batchRefused: {
    en: "{n} {n|rumor was|rumors were} not kept: {reason}",
    "zh-TW": "有 {n} 則傳聞沒有留下：{reason}",
    ja: "{n} 件の噂は残りませんでした：{reason}",
  },

  // ── Usage ─────────────────────────────────────────────────────────────────────────────────
  usagePurpose: { en: "Rumors", "zh-TW": "傳聞", ja: "噂" },
} as const satisfies Record<string, Phrase>;

const REPAIRED = {
  en: "Nothing was written; new rumors come next time. A larger model (Settings → Model) writes them better.",
  "zh-TW": "這次什麼都沒寫下；下一次會有新消息。到「設定 → 模型」換用較大的模型會更穩定。",
  ja: "何も書かれていません。次の回に新しい話題が届きます。「設定 → モデル」で大きめのモデルにすると安定します。",
};

const NEXT_BEAT = {
  en: "Nothing was written; new rumors come next time.",
  "zh-TW": "這次什麼都沒寫下；下一次會有新消息。",
  ja: "何も書かれていません。次の回に新しい話題が届きます。",
};

/** What the screen shows for the codes a rumor batch can end with (spread into ERRORS). */
export const RUMOR_ERRORS: Record<string, ErrorText> = {
  "dsl-invalid-rumors": {
    message: {
      en: "The model's rumors still did not come out right after two repairs.",
      "zh-TW": "模型寫的傳聞在修正兩次之後仍然不對。",
      ja: "モデルの噂は 2 回直しても正しく書けませんでした。",
    },
    hint: REPAIRED,
  },
  "rumor-beat-expired": {
    message: {
      en: "That time is too long ago to write rumors for.",
      "zh-TW": "那一次太久了，不能再為它寫傳聞。",
      ja: "その回は古すぎて、もう噂を書けません。",
    },
    hint: NEXT_BEAT,
  },
  "rumor-beat-unknown": {
    message: {
      en: "The rumor names a time this world never had.",
      "zh-TW": "這則傳聞指向這個世界從未有過的一次。",
      ja: "この噂は、このワールドにない回を指しています。",
    },
    hint: NEXT_BEAT,
  },
  "rumor-slot-unknown": {
    message: {
      en: "This time has no such rumor slot.",
      "zh-TW": "這一次沒有這個傳聞位置。",
      ja: "この回にその噂の枠はありません。",
    },
    hint: NEXT_BEAT,
  },
  "rumor-text-invalid": {
    message: {
      en: "A rumor is one line of 1 to 200 characters.",
      "zh-TW": "一則傳聞是一行，長度 1 到 200 個字元。",
      ja: "噂は 1〜200 文字の 1 行です。",
    },
    hint: NEXT_BEAT,
  },
  "rumor-cites-nothing": {
    message: {
      en: "The rumor's slot retells nothing this world's history holds.",
      "zh-TW": "這則傳聞的位置所傳述的事，不在這個世界的歷史裡。",
      ja: "この噂の枠が語る出来事は、このワールドの歴史にありません。",
    },
    hint: NEXT_BEAT,
  },
  "rumor-uncited": {
    message: {
      en: "The rumor does not name what it retells.",
      "zh-TW": "這則傳聞沒有說出它傳述的是什麼。",
      ja: "この噂は、語っている出来事の名前を出していません。",
    },
    hint: NEXT_BEAT,
  },
  "rumor-names-other": {
    message: {
      en: "The rumor names a place or person outside what it retells.",
      "zh-TW": "這則傳聞提到了它所傳述之事以外的地方或人。",
      ja: "この噂は、語っている出来事の外にある場所や人の名前を出しています。",
    },
    hint: NEXT_BEAT,
  },
  "rumor-switch-not-saved": {
    message: {
      en: "This device's rumor setting could not be saved.",
      "zh-TW": "這台裝置的傳聞設定無法儲存。",
      ja: "この端末の噂の設定を保存できませんでした。",
    },
    hint: {
      en: "Storage may be disabled for this app; the setting did not change.",
      "zh-TW": "這個 App 的儲存空間可能被停用了；設定沒有改變。",
      ja: "このアプリのストレージが無効になっている可能性があります。設定は変わっていません。",
    },
  },
};
