// Errors about AI Worlds (drafts, published worlds, journeys, the sandboxed frame, images) and about
// mods: installing them and the change proposals of a mod revision.

import type { ErrorText } from "./errors";
import { HINT } from "./errors-hints";

const FIX_WORLD = {
  en: "Reload it, or describe the problem so the model can fix it.",
  "zh-TW": "請重新載入，或描述問題讓模型修正。",
  ja: "再読み込みするか、問題を説明してモデルに直してもらってください。",
};

export const WORKS_ERRORS: Record<string, ErrorText> = {
  // ── AI Worlds ──────────────────────────────────────────────────────────────────────────────
  "work-missing": {
    message: {
      en: "This world is not installed.",
      "zh-TW": "這個世界沒有安裝。",
      ja: "このワールドはインストールされていません。",
    },
    hint: {
      en: "Otherworlds stay in the AI worlds of the device that placed them; import or publish that world here.",
      "zh-TW": "異界留在放置它的那台裝置的 AI 世界裡；請在這台裝置匯入或發布那個世界。",
      ja: "異界は置いた端末の AI ワールドに残ります。この端末でそのワールドを取り込むか公開してください。",
    },
  },
  "work-tampered": {
    message: {
      en: "This world's files were changed after it was published.",
      "zh-TW": "這個世界的檔案在發布後被改動過。",
      ja: "このワールドのファイルは公開後に変更されています。",
    },
    hint: {
      en: "Publish a new version instead of editing the files.",
      "zh-TW": "請發布新版本，而不是直接修改檔案。",
      ja: "ファイルを直接編集せず、新しいバージョンを公開してください。",
    },
  },
  "work-mismatch": {
    message: {
      en: "This world's version does not match the one this journey uses.",
      "zh-TW": "這個世界的版本和這趟旅程使用的版本不符。",
      ja: "このワールドの版が、この旅路で使っている版と一致しません。",
    },
  },
  "work-invalid": {
    message: {
      en: "This world's files are not valid.",
      "zh-TW": "這個世界的檔案無效。",
      ja: "このワールドのファイルが正しくありません。",
    },
  },
  "work-unreadable": {
    message: {
      en: "This world's files could not be read.",
      "zh-TW": "無法讀取這個世界的檔案。",
      ja: "このワールドのファイルを読み込めませんでした。",
    },
    hint: HINT.readable,
  },
  "work-publish-failed": {
    message: {
      en: "The world could not be published.",
      "zh-TW": "無法發布這個世界。",
      ja: "ワールドを公開できませんでした。",
    },
    hint: HINT.disk,
  },
  "work-too-large": {
    message: {
      en: "This world's files or images are too large.",
      "zh-TW": "這個世界的檔案或圖片太大了。",
      ja: "このワールドのファイルか画像が大きすぎます。",
    },
  },
  "draft-missing": {
    message: {
      en: "This draft does not exist.",
      "zh-TW": "這份草稿不存在。",
      ja: "この下書きは存在しません。",
    },
  },
  "draft-invalid": {
    message: {
      en: "That draft or version cannot be used here.",
      "zh-TW": "這份草稿或版本無法在這裡使用。",
      ja: "その下書きまたはバージョンは、ここでは使えません。",
    },
  },
  "draft-empty": {
    message: {
      en: "There is no playable version yet.",
      "zh-TW": "還沒有可以玩的版本。",
      ja: "まだ遊べるバージョンがありません。",
    },
    hint: {
      en: "Make a playable version first.",
      "zh-TW": "請先做出可以玩的版本。",
      ja: "先に遊べるバージョンを作ってください。",
    },
  },
  "draft-full": {
    message: {
      en: "This draft has too many attempts.",
      "zh-TW": "這份草稿的嘗試次數太多了。",
      ja: "この下書きは試行回数が多すぎます。",
    },
    hint: {
      en: "Publish it, or start a new draft.",
      "zh-TW": "請發布它，或開始新的草稿。",
      ja: "公開するか、新しい下書きを始めてください。",
    },
  },
  "draft-stale": {
    message: {
      en: "The draft changed while this version was being made; it was kept but not made current.",
      "zh-TW": "製作這個版本時草稿已經變動；這個版本已保留，但沒有設為目前版本。",
      ja: "このバージョンを作っている間に下書きが変わりました。保存はしましたが、現在のバージョンにはしていません。",
    },
  },
  "draft-write-failed": {
    message: {
      en: "The new version could not be saved.",
      "zh-TW": "無法儲存新的版本。",
      ja: "新しいバージョンを保存できませんでした。",
    },
    hint: HINT.disk,
  },
  "candidate-settled": {
    message: {
      en: "This version has already been decided.",
      "zh-TW": "這個版本已經有結果了。",
      ja: "このバージョンはすでに結果が出ています。",
    },
  },
  "play-missing": {
    message: {
      en: "This journey does not exist.",
      "zh-TW": "這趟旅程不存在。",
      ja: "この旅路は存在しません。",
    },
  },
  "play-invalid": {
    message: {
      en: "This journey's record is not valid.",
      "zh-TW": "這趟旅程的紀錄無效。",
      ja: "この旅路の記録が正しくありません。",
    },
  },
  "carry-too-large": {
    message: {
      en: "The things carried between worlds are too large.",
      "zh-TW": "在世界之間攜帶的東西太大了。",
      ja: "ワールド間で持ち運ぶものが大きすぎます。",
    },
  },
  "state-too-large": {
    message: {
      en: "The world's saved progress is too large.",
      "zh-TW": "這個世界儲存的進度太大了。",
      ja: "ワールドの保存した進行状況が大きすぎます。",
    },
  },
  "world-flooding": {
    message: {
      en: "The world sent too many messages, so it was stopped.",
      "zh-TW": "這個世界送出太多訊息，因此已被停止。",
      ja: "ワールドがメッセージを送りすぎたため、停止しました。",
    },
    hint: FIX_WORLD,
  },
  "world-stalled": {
    message: {
      en: "The world stopped responding or did not start.",
      "zh-TW": "這個世界沒有回應，或沒有啟動。",
      ja: "ワールドが応答しないか、起動しませんでした。",
    },
    hint: FIX_WORLD,
  },

  // ── Images ─────────────────────────────────────────────────────────────────────────────────
  "asset-unknown": {
    message: {
      en: "This world has no image by that name.",
      "zh-TW": "這個世界沒有這個名稱的圖片。",
      ja: "このワールドにその名前の画像はありません。",
    },
  },
  "asset-type": {
    message: {
      en: "Pick a PNG, JPEG, WebP or GIF image.",
      "zh-TW": "請選擇 PNG、JPEG、WebP 或 GIF 圖片。",
      ja: "PNG・JPEG・WebP・GIF の画像を選んでください。",
    },
  },
  "asset-too-large": {
    message: {
      en: "The image is larger than 2 MB.",
      "zh-TW": "圖片超過 2 MB。",
      ja: "画像が 2 MB を超えています。",
    },
  },
  "image-empty": {
    message: {
      en: "The image service returned no image.",
      "zh-TW": "圖片服務沒有回傳任何圖片。",
      ja: "画像サービスが画像を返しませんでした。",
    },
    hint: HINT.tryAgain,
  },
  "image-failed": {
    message: {
      en: "Image generation failed.",
      "zh-TW": "圖片生成失敗。",
      ja: "画像の生成に失敗しました。",
    },
    hint: {
      en: "Check the API key, the image model name and your quota.",
      "zh-TW": "請檢查 API 金鑰、圖片模型名稱與你的用量額度。",
      ja: "API キー、画像モデル名、利用枠を確認してください。",
    },
  },

  // ── Installing mods ────────────────────────────────────────────────────────────────────────
  "mod-unreadable": {
    message: {
      en: "The mod could not be read.",
      "zh-TW": "無法讀取模組。",
      ja: "MOD を読み込めませんでした。",
    },
    hint: {
      en: "Check the .mod file or mod folder, then try again.",
      "zh-TW": "請檢查 .mod 檔案或模組資料夾，然後再試一次。",
      ja: ".mod ファイルか MOD のフォルダーを確認してから、もう一度試してください。",
    },
  },
  "mod-write-failed": {
    message: {
      en: "The mod could not be installed.",
      "zh-TW": "無法安裝模組。",
      ja: "MOD をインストールできませんでした。",
    },
    hint: HINT.disk,
  },
  "mod-remove-failed": {
    message: {
      en: "The mod could not be removed.",
      "zh-TW": "無法移除模組。",
      ja: "MOD を削除できませんでした。",
    },
    hint: HINT.tryAgain,
  },
  "mod-missing": {
    message: {
      en: "That mod is not installed.",
      "zh-TW": "這個模組沒有安裝。",
      ja: "その MOD はインストールされていません。",
    },
    hint: {
      en: "Install it from the Mods panel.",
      "zh-TW": "請從「模組」面板安裝。",
      ja: "「MOD」パネルからインストールしてください。",
    },
  },
  "mod-name-invalid": {
    message: {
      en: "That is not a valid mod name.",
      "zh-TW": "這不是有效的模組名稱。",
      ja: "正しい MOD 名ではありません。",
    },
    hint: {
      en: "A mod name is 1–64 lowercase letters, digits, dots, dashes or underscores.",
      "zh-TW": "模組名稱為 1–64 個小寫英文字母、數字、句點、連字號或底線。",
      ja: "MOD 名は英小文字・数字・ドット・ハイフン・アンダースコアの 1〜64 文字です。",
    },
  },
  "mod-name-mismatch": {
    message: {
      en: "The mod folder's name does not match the mod's own name.",
      "zh-TW": "模組資料夾的名稱和模組本身的名稱不符。",
      ja: "MOD のフォルダー名が、MOD 自身の名前と一致しません。",
    },
    hint: {
      en: "Rename the folder, or fix name: in mod.yml.",
      "zh-TW": "請替資料夾改名，或修正 mod.yml 裡的 name:。",
      ja: "フォルダー名を変えるか、mod.yml の name: を直してください。",
    },
  },
  "mod-manifest-missing": {
    message: {
      en: "The mod has no mod.yml.",
      "zh-TW": "模組沒有 mod.yml。",
      ja: "MOD に mod.yml がありません。",
    },
    hint: {
      en: "A mod keeps mod.yml at its top level.",
      "zh-TW": "模組的 mod.yml 必須放在最上層。",
      ja: "MOD の mod.yml は最上位に置きます。",
    },
  },
  "mod-manifest-invalid": {
    message: {
      en: "The mod's mod.yml is not valid.",
      "zh-TW": "模組的 mod.yml 無效。",
      ja: "MOD の mod.yml が正しくありません。",
    },
  },
  "mod-manifest-yaml": {
    message: {
      en: "The mod's mod.yml is not valid YAML.",
      "zh-TW": "模組的 mod.yml 不是有效的 YAML。",
      ja: "MOD の mod.yml が正しい YAML ではありません。",
    },
  },
  "mod-file-missing": {
    message: {
      en: "The mod refers to a file it does not include.",
      "zh-TW": "模組引用了沒有附上的檔案。",
      ja: "MOD が、含まれていないファイルを参照しています。",
    },
    hint: {
      en: "Add the file, or remove that section from mod.yml.",
      "zh-TW": "請加入那個檔案，或從 mod.yml 移除該段落。",
      ja: "そのファイルを追加するか、mod.yml からそのセクションを削除してください。",
    },
  },
  "mod-file-rejected": {
    message: {
      en: "The mod contains a kind of file mods may not have.",
      "zh-TW": "模組含有不允許的檔案類型。",
      ja: "MOD に使えない種類のファイルが含まれています。",
    },
    hint: {
      en: "Mods hold text files only, never code.",
      "zh-TW": "模組只能包含文字檔，不能有程式碼。",
      ja: "MOD に入れられるのはテキストファイルだけで、コードは入れられません。",
    },
  },
  "mod-file-too-large": {
    message: {
      en: "A file in the mod is too large.",
      "zh-TW": "模組裡有檔案太大。",
      ja: "MOD 内のファイルが大きすぎます。",
    },
    hint: {
      en: "Mod files are prompt and skill text, with a size limit per file.",
      "zh-TW": "模組檔案是提示詞與技能文字，每個檔案都有大小上限。",
      ja: "MOD のファイルはプロンプトとスキルの文章で、1 ファイルごとにサイズの上限があります。",
    },
  },
  "mod-path-unsafe": {
    message: {
      en: "The mod contains an unsafe file path, so it was refused.",
      "zh-TW": "模組含有不安全的檔案路徑，因此已拒絕。",
      ja: "MOD に安全でないファイルパスが含まれているため、拒否しました。",
    },
  },
  "mod-skill-duplicate": {
    message: {
      en: "The mod declares the same skill twice.",
      "zh-TW": "模組重複宣告了同一個技能。",
      ja: "MOD が同じスキルを二回宣言しています。",
    },
  },

  // ── Change proposals of a mod revision ─────────────────────────────────────────────────────
  "mod-proposal-invalid": {
    message: {
      en: "The change proposal is not valid.",
      "zh-TW": "變更提案無效。",
      ja: "変更案が正しくありません。",
    },
    hint: HINT.askAgain,
  },
  "mod-base-mismatch": {
    message: {
      en: "The change proposal was made for a different version of the world.",
      "zh-TW": "這份變更提案是針對這個世界的另一個版本。",
      ja: "この変更案は、ワールドの別の版に向けたものです。",
    },
    hint: {
      en: "Ask for the change again on this version.",
      "zh-TW": "請針對這個版本重新要求變更。",
      ja: "この版に対して、もう一度変更を頼んでください。",
    },
  },
  "mod-v2-required": {
    message: {
      en: "Structural changes need a world in the v2 format.",
      "zh-TW": "結構性的變更需要 v2 格式的世界。",
      ja: "構造の変更には v2 形式のワールドが必要です。",
    },
  },
  "mod-version-invalid": {
    message: {
      en: "The new version number must be higher than the current one.",
      "zh-TW": "新的版本號必須比目前的版本高。",
      ja: "新しいバージョン番号は、今のものより大きくする必要があります。",
    },
  },
  "mod-module-missing": {
    message: {
      en: "The engine has no module for that change.",
      "zh-TW": "引擎沒有能做這個變更的功能模組。",
      ja: "エンジンに、その変更に使えるモジュールがありません。",
    },
    hint: {
      en: "Ask for a change the installed modules can make.",
      "zh-TW": "請要求已安裝的功能模組做得到的變更。",
      ja: "インストール済みのモジュールでできる変更を頼んでください。",
    },
  },
  "mod-scene-missing": {
    message: {
      en: "The change names a scene that does not exist.",
      "zh-TW": "變更提到的場景不存在。",
      ja: "変更案に、存在しないシーンが含まれています。",
    },
    hint: HINT.askAgain,
  },
  "mod-scene-invalid": {
    message: {
      en: "A scene in the change has no definition.",
      "zh-TW": "變更中的場景沒有定義。",
      ja: "変更案のシーンに定義がありません。",
    },
    hint: HINT.askAgain,
  },
  "mod-context-missing": {
    message: {
      en: "A scene in the change refers to unknown capability settings.",
      "zh-TW": "變更中的場景引用了未知的功能設定。",
      ja: "変更案のシーンが、不明な機能設定を参照しています。",
    },
    hint: HINT.askAgain,
  },
  "mod-contract-id": {
    message: {
      en: "A change cannot alter which scene is which.",
      "zh-TW": "變更不能改動場景的識別。",
      ja: "変更でシーンの識別を変えることはできません。",
    },
    hint: HINT.askAgain,
  },
  "mod-asset-missing": {
    message: {
      en: "The change refers to an asset the scene does not have.",
      "zh-TW": "變更提到了場景裡沒有的素材。",
      ja: "変更案が、シーンにない素材を参照しています。",
    },
    hint: HINT.askAgain,
  },
  "mod-asset-placement-required": {
    message: {
      en: "Asset changes must match where the assets stand in the scene.",
      "zh-TW": "素材的變更必須符合它們在場景裡的位置。",
      ja: "素材の変更は、シーン内の配置と一致している必要があります。",
    },
    hint: HINT.askAgain,
  },
  "mod-position-invalid": {
    message: {
      en: "The change places an asset outside the scene.",
      "zh-TW": "變更把素材放到了場景之外。",
      ja: "変更案が素材をシーンの外に置いています。",
    },
    hint: HINT.askAgain,
  },
};
