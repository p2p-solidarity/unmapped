// Errors about chat with friends (simplify-together → Chat): on a continent (peer to peer) and in
// a shared world through its service. Split from errors-net.ts to keep each table short.

import type { ErrorText } from "./errors";

export const CHAT_ERRORS: Record<string, ErrorText> = {
  "chat-unreadable": {
    message: {
      en: "That line is empty or too long to send.",
      "zh-TW": "這句話是空的或太長，無法送出。",
      ja: "その言葉は空か長すぎて送れません。",
    },
    hint: {
      en: "Write up to 200 characters.",
      "zh-TW": "最多 200 個字。",
      ja: "200 文字までにしてください。",
    },
  },
  "chat-too-fast": {
    message: {
      en: "That is a lot of lines at once.",
      "zh-TW": "一下子說太多句了。",
      ja: "一度にたくさん話しすぎです。",
    },
    hint: {
      en: "Wait a few seconds, then say it again.",
      "zh-TW": "等幾秒鐘再說一次。",
      ja: "数秒待ってから、もう一度言ってください。",
    },
  },
  "chat-invalid": {
    message: {
      en: "That line is empty or too long to send.",
      "zh-TW": "這句話是空的或太長，無法送出。",
      ja: "その言葉は空か長すぎて送れません。",
    },
    hint: {
      en: "Write up to 200 characters.",
      "zh-TW": "最多 200 個字。",
      ja: "200 文字までにしてください。",
    },
  },
  "quota-chat": {
    message: {
      en: "That is a lot of lines at once.",
      "zh-TW": "一下子說太多句了。",
      ja: "一度にたくさん話しすぎです。",
    },
    hint: {
      en: "Wait a few seconds, then say it again.",
      "zh-TW": "等幾秒鐘再說一次。",
      ja: "数秒待ってから、もう一度言ってください。",
    },
  },
  "chat-members-only": {
    message: {
      en: "Only the world's owners and invited friends talk here.",
      "zh-TW": "只有這個世界的主人和受邀的朋友能在這裡說話。",
      ja: "このワールドで話せるのは、持ち主と招待された友だちだけです。",
    },
    hint: {
      en: "Ask the owner for an invite to talk here.",
      "zh-TW": "請主人給你一個邀請，就能說話了。",
      ja: "話すには、持ち主に招待してもらってください。",
    },
  },
  "chat-service-old": {
    message: {
      en: "This world's server is older and cannot carry chat yet.",
      "zh-TW": "這個世界用的伺服器比較舊，還不能聊天。",
      ja: "このワールドのサーバーは古く、まだチャットを運べません。",
    },
    hint: {
      en: "Everything else keeps working; chat comes once the server is updated.",
      "zh-TW": "其他功能都照常；伺服器更新後就能聊天。",
      ja: "ほかの機能はそのまま使えます。サーバーが更新されればチャットできます。",
    },
  },
  "chat-no-friends": {
    message: {
      en: "Chat works only while you play with friends.",
      "zh-TW": "只有和朋友一起玩時才能聊天。",
      ja: "チャットは友だちと遊んでいるときだけ使えます。",
    },
    hint: {
      en: "Invite friends or join a friend's world first.",
      "zh-TW": "請先邀請朋友，或加入朋友的世界。",
      ja: "まず友だちを招待するか、友だちのワールドに参加してください。",
    },
  },
};
