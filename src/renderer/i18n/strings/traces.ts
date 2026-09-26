// What the world's history leaves on the land (rev 6 phase 3, WP5 views): mist and legends over
// forgotten chunks, 異聞 (other tellings), signposts and gifts, the note marks, and the world's own
// lists at the door (refused entries, what the migration kept on this device, a newer build's).

import type { ErrorText } from "./errors";
import type { Phrase } from "./phrase";

export const TRACES = {
  // ── The HUD's land line ───────────────────────────────────────────────────────────────────
  mist: {
    en: "In the mist — this place faded from memory and can be written anew.",
    "zh-TW": "霧中 — 這個地方已被淡忘，可以重新寫出來。",
    ja: "霧の中 — この場所は忘れられ、もう一度書き出せます。",
  },
  legend: { en: "Legend · {name}", "zh-TW": "傳說 · {name}", ja: "伝説 · {name}" },
  fading: {
    en: "Few come here — it is fading into mist.",
    "zh-TW": "很少有人來 — 正漸漸隱入霧中。",
    ja: "訪れる人が少なく、霧に消えかけています。",
  },
  variants: { en: "Variants ×{n}", "zh-TW": "異聞 ×{n}", ja: "異聞 ×{n}" },
  refusedHud: {
    en: "{n} of your {n|entry was|entries were} refused — see the door at home.",
    "zh-TW": "你有 {n} 筆紀錄被拒絕 — 請到家門查看。",
    ja: "あなたの記録 {n} 件が拒否されました — 家の扉で確認してください。",
  },
  rumorClaiming: {
    en: "Rumors: asking the world who writes this beat's news…",
    "zh-TW": "傳聞：正在詢問世界由誰寫下這一拍的消息…",
    ja: "噂：この拍の話を誰が書くか世界に確かめています…",
  },
  rumorWriting: {
    en: "Rumors: writing what the residents pass on…",
    "zh-TW": "傳聞：正在寫下居民口耳相傳的消息…",
    ja: "噂：住人が伝える話を書いています…",
  },
  rumorSaving: {
    en: "Rumors: sharing them with the world…",
    "zh-TW": "傳聞：正在把它們分享給世界…",
    ja: "噂：世界に共有しています…",
  },
  // ── Signposts and gifts where the player stands ───────────────────────────────────────────
  heading: { en: "Left here", "zh-TW": "留在這裡的", ja: "ここに残されたもの" },
  signposts: { en: "Signposts", "zh-TW": "路標", ja: "道しるべ" },
  gifts: { en: "Gifts", "zh-TW": "禮物", ja: "贈り物" },
  toward: { en: "Points toward {place}", "zh-TW": "指向 {place}", ja: "{place} の方を指す" },
  home: { en: "home", "zh-TW": "家", ja: "家" },
  leaveSignpost: { en: "Put up a signpost", "zh-TW": "立一塊路標", ja: "道しるべを立てる" },
  signpostText: {
    en: "What it says (one line, up to {n} characters)",
    "zh-TW": "上面寫的字（一行，最多 {n} 字）",
    ja: "書く言葉（一行、{n} 文字まで）",
  },
  pointsToward: { en: "Points toward", "zh-TW": "指向", ja: "指す方向" },
  nowhere: { en: "Nowhere", "zh-TW": "不指向任何地方", ja: "どこも指さない" },
  putUp: { en: "Put it up", "zh-TW": "立起來", ja: "立てる" },
  signpostDone: {
    en: "Your signpost stands here.",
    "zh-TW": "你的路標立在這裡了。",
    ja: "道しるべを立てました。",
  },
  leaveGift: { en: "Leave a gift", "zh-TW": "留下一份禮物", ja: "贈り物を置く" },
  giftPick: { en: "What to leave", "zh-TW": "要留下什麼", ja: "置くもの" },
  giftNone: {
    en: "Nothing in your bag can be given: only items made in this game can.",
    "zh-TW": "背包裡沒有能送出的東西：只有在這個遊戲裡做出的道具才能送。",
    ja: "持ち物に贈れるものがありません。このゲームで作られた道具だけが贈れます。",
  },
  giftWords: {
    en: "A few words with it (optional, up to {n} characters)",
    "zh-TW": "附上幾句話（可不填，最多 {n} 字）",
    ja: "添える言葉（任意、{n} 文字まで）",
  },
  giftFor: { en: "For", "zh-TW": "送給", ja: "宛先" },
  anyone: { en: "Anyone", "zh-TW": "任何人", ja: "誰でも" },
  leaveIt: { en: "Leave it here", "zh-TW": "放在這裡", ja: "ここに置く" },
  giftLeft: {
    en: "You left {item} here.",
    "zh-TW": "你把 {item} 留在這裡了。",
    ja: "{item} をここに置きました。",
  },
  giftFrom: { en: "From {name}", "zh-TW": "來自 {name}", ja: "{name} から" },
  giftForYou: { en: "Left for you", "zh-TW": "留給你的", ja: "あなた宛て" },
  giftForOther: { en: "Left for {name}", "zh-TW": "留給 {name}", ja: "{name} 宛て" },
  take: { en: "Take it", "zh-TW": "收下", ja: "受け取る" },
  taking: { en: "Taking it…", "zh-TW": "收下中…", ja: "受け取っています…" },
  takenBy: { en: "Taken by {name}", "zh-TW": "已被 {name} 收下", ja: "{name} が受け取りました" },
  tookIt: {
    en: "{item} is in your bag.",
    "zh-TW": "{item} 放進你的背包了。",
    ja: "{item} を持ち物に入れました。",
  },
  tookFirst: {
    en: "Someone took it first.",
    "zh-TW": "有人先拿走了。",
    ja: "先に誰かが受け取りました。",
  },
  takeWaiting: {
    en: "Waiting for the world's service — the gift is yours once it is shared.",
    "zh-TW": "等待世界服務 — 分享出去之後，禮物就是你的。",
    ja: "世界サービスを待っています — 共有されれば贈り物はあなたのものです。",
  },
  // ── Marks on a note ───────────────────────────────────────────────────────────────────────
  noteVariant: {
    en: "A variant — written on another telling of this place.",
    "zh-TW": "異聞 — 寫在這個地方的另一個版本上。",
    ja: "異聞 — この場所の別の語りに書かれたもの。",
  },
  noteKept: {
    en: "A visitor's note, kept by the world's owner.",
    "zh-TW": "訪客的手記，由世界的主人收下。",
    ja: "訪問者の手記。世界の持ち主が残しました。",
  },
  noteLocal: {
    en: "Not in the world's history yet.",
    "zh-TW": "還不在世界的歷史中。",
    ja: "まだ世界の歴史にはありません。",
  },
  // ── 異聞 of one chunk ─────────────────────────────────────────────────────────────────────
  variantsTitle: {
    en: "Tellings of {place} ({cx} · {cz})",
    "zh-TW": "{place}（{cx} · {cz}）的異聞",
    ja: "{place}（{cx} · {cz}）の異聞",
  },
  variantsIntro: {
    en: "People wrote this place at the same time. The world keeps the first it received as the place you walk; the others stay in its history as variants, to read.",
    "zh-TW":
      "有人在同一時間寫下了這個地方。世界把最先收到的那一份當成你走進的地方；其餘的以異聞留在歷史中，可以閱讀。",
    ja: "同じ時にこの場所を書いた人がいます。世界は最初に受け取ったものを歩ける場所とし、ほかは異聞として歴史に残して読めるようにします。",
  },
  standing: { en: "Standing", "zh-TW": "現存", ja: "現在の姿" },
  variantRow: { en: "Variant {i}", "zh-TW": "異聞 {i}", ja: "異聞 {i}" },
  writtenBy: {
    en: "Written by {name} · entry {n} · {when}",
    "zh-TW": "{name} 寫下 · 第 {n} 筆 · {when}",
    ja: "{name} が記した · {n} 件目 · {when}",
  },
  localCopy: {
    en: "This device's own older copy, kept in its files from before the world was shared.",
    "zh-TW": "這台裝置自己較舊的一份，是世界分享之前留在檔案裡的。",
    ja: "この端末自身の古い写し。世界を共有する前のファイルに残っています。",
  },
  variantNotes: {
    en: "{n} {n|note was|notes were} left on this telling.",
    "zh-TW": "有 {n} 則手記留在這個版本上。",
    ja: "この語りには {n} 件の手記があります。",
  },
  legends: {
    en: "Legends (earlier looks)",
    "zh-TW": "傳說（從前的樣子）",
    ja: "伝説（かつての姿）",
  },
  // ── The world's records, at the door ──────────────────────────────────────────────────────
  records: { en: "This world's records", "zh-TW": "這個世界的紀錄", ja: "この世界の記録" },
  refused: { en: "Refused ({n})", "zh-TW": "被拒絕的（{n}）", ja: "拒否されたもの（{n}）" },
  refusedIntro: {
    en: "The world did not take these; they stay listed until you dismiss them.",
    "zh-TW": "世界沒有收下這些；在你按下「知道了」之前都會留在這裡。",
    ja: "世界はこれらを受け取りませんでした。閉じるまでここに残ります。",
  },
  dismiss: { en: "Dismiss", "zh-TW": "知道了", ja: "閉じる" },
  dismissGift: {
    en: "Dismiss — {item} returns to your bag",
    "zh-TW": "知道了 — {item} 會回到你的背包",
    ja: "閉じる — {item} は持ち物に戻ります",
  },
  skipped: {
    en: "Kept on this device only ({n})",
    "zh-TW": "只留在這台裝置（{n}）",
    ja: "この端末だけに残るもの（{n}）",
  },
  skippedIntro: {
    en: "Moving this save into its world's history left these out; this device still draws them from its own files.",
    "zh-TW": "把這個存檔移入世界的歷史時略過了這些；這台裝置仍從自己的檔案畫出它們。",
    ja: "このセーブを世界の歴史に移すとき、これらは入りませんでした。この端末は自分のファイルから描き続けます。",
  },
  skippedOf: { en: "{i} of {n}", "zh-TW": "第 {i} 項，共 {n} 項", ja: "{n} 件中 {i} 件目" },
  previous: { en: "Previous", "zh-TW": "上一項", ja: "前へ" },
  next: { en: "Next", "zh-TW": "下一項", ja: "次へ" },
  newer: {
    en: "{n} {n|entry|entries} from a newer build of UNMAPPED {n|is|are} kept here but not shown; update to see {n|it|them}.",
    "zh-TW": "有 {n} 筆來自較新版本《無界之地》的紀錄已保留但沒有顯示；更新後就能看到。",
    ja: "新しいビルドの UNMAPPED による記録 {n} 件は保存されていますが表示されません。更新すると見られます。",
  },
  whatChunk: { en: "Land ({key})", "zh-TW": "土地（{key}）", ja: "土地（{key}）" },
  whatNote: { en: "A note ({key})", "zh-TW": "手記（{key}）", ja: "手記（{key}）" },
  whatPlace: { en: "A place ({key})", "zh-TW": "地點（{key}）", ja: "場所（{key}）" },
  whatOther: { en: "{what} ({key})", "zh-TW": "{what}（{key}）", ja: "{what}（{key}）" },
  evNote: { en: "Note: “{text}”", "zh-TW": "手記：「{text}」", ja: "手記：「{text}」" },
  evSignpost: { en: "Signpost: “{text}”", "zh-TW": "路標：「{text}」", ja: "道しるべ：「{text}」" },
  evGift: { en: "Gift: {item}", "zh-TW": "禮物：{item}", ja: "贈り物：{item}" },
  evTake: { en: "Taking a gift", "zh-TW": "收下禮物", ja: "贈り物の受け取り" },
  evWitness: {
    en: "Writing the land ({cx} · {cz})",
    "zh-TW": "寫出大地（{cx} · {cz}）",
    ja: "大地を書く（{cx} · {cz}）",
  },
  evPlace: { en: "Place: {title}", "zh-TW": "地點：{title}", ja: "場所：{title}" },
  evChapter: { en: "Chapter: {title}", "zh-TW": "章節：{title}", ja: "章：{title}" },
  evOther: { en: "An entry ({kind})", "zh-TW": "一筆紀錄（{kind}）", ja: "記録（{kind}）" },
} satisfies Record<string, Phrase>;

/** Codes the land's traces raise, and the history's refusals of them (admit, the service). */
export const TRACE_ERRORS: Record<string, ErrorText> = {
  "gift-taken": {
    message: {
      en: "Someone already took that gift.",
      "zh-TW": "有人已經收下那份禮物了。",
      ja: "その贈り物はもう誰かが受け取りました。",
    },
  },
  "gift-not-yours": {
    message: {
      en: "That gift was left for someone else.",
      "zh-TW": "那份禮物是留給別人的。",
      ja: "その贈り物は別の人宛てです。",
    },
  },
  "gift-unknown": {
    message: {
      en: "That gift is not in this world.",
      "zh-TW": "這個世界裡沒有那份禮物。",
      ja: "その贈り物はこの世界にありません。",
    },
  },
  "gift-item-invalid": {
    message: {
      en: "Only an item made in this game can be given.",
      "zh-TW": "只有在這個遊戲裡做出的道具才能送出。",
      ja: "このゲームで作られた道具だけが贈れます。",
    },
  },
  "gift-words-length": {
    message: {
      en: "A gift's words hold up to 120 characters.",
      "zh-TW": "禮物附上的話最多 120 字。",
      ja: "贈り物に添える言葉は 120 文字までです。",
    },
    hint: { en: "Shorten them.", "zh-TW": "請縮短。", ja: "短くしてください。" },
  },
  "signpost-length": {
    message: {
      en: "A signpost holds one line of 1 to 40 characters.",
      "zh-TW": "路標只能寫一行，1 到 40 字。",
      ja: "道しるべに書けるのは 1〜40 文字の一行です。",
    },
    hint: { en: "Shorten it.", "zh-TW": "請縮短。", ja: "短くしてください。" },
  },
  "signpost-quota": {
    message: {
      en: "You already put three signposts in this area.",
      "zh-TW": "你已經在這一帶立了三塊路標。",
      ja: "このあたりにはもう三つ道しるべを立てました。",
    },
    hint: {
      en: "Put the next one somewhere else.",
      "zh-TW": "下一塊請立在別的地方。",
      ja: "次は別の場所に立ててください。",
    },
  },
  "trace-nowhere": {
    message: {
      en: "Signposts and gifts are left on this world's own land.",
      "zh-TW": "路標和禮物只能留在這個世界自己的土地上。",
      ja: "道しるべと贈り物はこの世界自身の土地に残します。",
    },
    hint: {
      en: "Walk out onto your world's land first.",
      "zh-TW": "請先走到你世界的土地上。",
      ja: "まず自分の世界の土地に出てください。",
    },
  },
  "access-visitor-kind": {
    message: {
      en: "Only invited friends write in this world.",
      "zh-TW": "只有受邀的朋友能在這個世界寫下新的內容。",
      ja: "この世界に書けるのは、招待された友だちだけです。",
    },
    hint: {
      en: "Visitors leave notes, signposts and gifts; ask the owner for an invite to write more.",
      "zh-TW": "訪客可以留下手記、路標和禮物；想寫更多，請向主人要邀請。",
      ja: "訪問者は手記・道しるべ・贈り物を残せます。もっと書くには持ち主に招待を頼んでください。",
    },
  },
  "quota-visitors": {
    message: {
      en: "Visitors have written all this world takes from them today.",
      "zh-TW": "訪客今天能在這個世界寫下的已經用完了。",
      ja: "訪問者が今日この世界に書ける分は使い切られました。",
    },
    hint: {
      en: "Try again tomorrow, or ask the owner for an invite.",
      "zh-TW": "明天再試，或向主人要邀請。",
      ja: "明日もう一度試すか、持ち主に招待を頼んでください。",
    },
  },
};
