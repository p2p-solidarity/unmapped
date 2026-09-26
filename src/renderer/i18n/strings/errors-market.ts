// Errors from the lineage market's names and launches (src/main/chain/names.ts, players.ts,
// launch.ts): naming a cartridge or a save, claiming a player name, putting a world on the market.
// Each message holds wherever its code is raised; the source's English (with the exact name) stays
// the detail.

import type { ErrorText } from "./errors";

export const MARKET_ERRORS: Record<string, ErrorText> = {
  "market-launch-unnamed": {
    message: {
      en: "This world has no ENS name yet.",
      "zh-TW": "這個世界還沒有 ENS 名稱。",
      ja: "この世界にはまだ ENS 名がありません。",
    },
    hint: {
      en: "Name the world first; a world goes on the market under its ENS name.",
      "zh-TW": "請先登記名稱；世界是以它的 ENS 名稱上架的。",
      ja: "先に名前を登録してください。世界は ENS 名でマーケットに出ます。",
    },
  },
  "market-launch-not-holder": {
    message: {
      en: "Someone else holds this world's name.",
      "zh-TW": "這個世界的名稱由別人持有。",
      ja: "この世界の名前は別の人が保有しています。",
    },
    hint: {
      en: "Only the name's holder can put it on the market.",
      "zh-TW": "只有名稱的持有人可以把它上架。",
      ja: "マーケットに出せるのは名前の保有者だけです。",
    },
  },
  "market-launch-done": {
    message: {
      en: "This world is already on the market.",
      "zh-TW": "這個世界已經在市場上了。",
      ja: "この世界はすでにマーケットに出ています。",
    },
    hint: {
      en: "Find it in Worlds → Market.",
      "zh-TW": "到「世界 → 市場」查看。",
      ja: "「ワールド → マーケット」で見られます。",
    },
  },
  "market-parent-not-launched": {
    message: {
      en: "Its parent world is not on the market yet.",
      "zh-TW": "它的上一代世界還沒上架。",
      ja: "親の世界がまだマーケットに出ていません。",
    },
    hint: {
      en: "A remix trades in its parent's token, so the parent launches first.",
      "zh-TW": "remix 以上一代世界的代幣交易，所以上一代要先上架。",
      ja: "リミックスは親のトークンで取引されるため、先に親を出す必要があります。",
    },
  },
  "ens-players-missing": {
    message: {
      en: "Player names are not set up on this deployment yet.",
      "zh-TW": "這個部署還沒有開放玩家名稱。",
      ja: "このデプロイではまだプレイヤー名が用意されていません。",
    },
    hint: {
      en: "The operator registers the players directory once (`bun run lineage:demo players`).",
      "zh-TW": "營運者需要先登記一次玩家目錄（`bun run lineage:demo players`）。",
      ja: "運営者がプレイヤー用のディレクトリを一度登録します（`bun run lineage:demo players`）。",
    },
  },
  "ens-player-named": {
    message: {
      en: "This passkey's account already holds a player name.",
      "zh-TW": "這個 passkey 帳戶已經持有一個玩家名稱。",
      ja: "このパスキーのアカウントはすでにプレイヤー名を保有しています。",
    },
    hint: {
      en: "One player name per account; transfer it from an ENS app to change hands.",
      "zh-TW": "每個帳戶只能有一個玩家名稱；要轉手請用 ENS app 轉移。",
      ja: "プレイヤー名は 1 アカウントに 1 つです。手放すときは ENS のアプリで移転してください。",
    },
  },
  "ens-name-current": {
    message: {
      en: "The name already says exactly this.",
      "zh-TW": "這個名稱記的已經就是這些內容。",
      ja: "その名前にはすでにこの内容が載っています。",
    },
    hint: {
      en: "Nothing to write now; it can move once the world or the save does.",
      "zh-TW": "現在不需要寫入；等世界或存檔有了新進度再更新。",
      ja: "今は書き込む必要はありません。世界やセーブが進んだら更新できます。",
    },
  },
  "ens-cartridge-unnamed": {
    message: {
      en: "The cartridge has no name yet, so a save cannot hang under it.",
      "zh-TW": "卡帶還沒有名稱，存檔無法掛在底下。",
      ja: "カートリッジにまだ名前がないため、セーブを付けられません。",
    },
    hint: {
      en: "Name the cartridge first (Worlds → Cartridges).",
      "zh-TW": "請先登記卡帶名稱（世界 → 卡帶）。",
      ja: "先にカートリッジの名前を登録してください（ワールド → カートリッジ）。",
    },
  },
};
