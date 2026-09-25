// Errors about unlocking saves (passkey, OS keychain, the Data Key), encrypted and plain .seed files,
// and restoring a seed through an ENS name.

import type { ErrorText } from "./errors";
import { HINT } from "./errors-hints";

const PASSKEY_RETRY = {
  en: "Try again and approve the Touch ID, Windows Hello or security-key prompt.",
  "zh-TW": "請再試一次，並在 Touch ID、Windows Hello 或安全金鑰的提示中核准。",
  ja: "もう一度試して、Touch ID・Windows Hello・セキュリティキーの確認を承認してください。",
};

const SEED_SHAPE = {
  en: "A seed holds exactly meta.json, genesis.json, world.oui, karma.jsonl and inventory.json.",
  "zh-TW": "種子必須剛好包含 meta.json、genesis.json、world.oui、karma.jsonl 與 inventory.json。",
  ja: "シードには meta.json・genesis.json・world.oui・karma.jsonl・inventory.json がちょうど揃っている必要があります。",
};

const SEED_CORRUPT = {
  en: "The file decrypted, but it is not a valid Unwritten Land world.",
  "zh-TW": "檔案已解密，但它不是有效的 Unwritten Land 世界。",
  ja: "ファイルは復号できましたが、正しい Unwritten Land のワールドではありません。",
};

export const IDENTITY_ERRORS: Record<string, ErrorText> = {
  // ── Unlocking saves ────────────────────────────────────────────────────────────────────────
  locked: {
    message: {
      en: "No save key is unlocked in this session.",
      "zh-TW": "這次工作階段還沒有解鎖存檔金鑰。",
      ja: "このセッションでは、セーブの鍵がロック解除されていません。",
    },
    hint: {
      en: "Unlock with your passkey or the OS keychain first.",
      "zh-TW": "請先用通行密鑰或系統鑰匙圈解鎖。",
      ja: "先にパスキーか OS キーチェーンでロックを解除してください。",
    },
  },
  "prf-unsupported": {
    message: {
      en: "Passkey unlock is not available here.",
      "zh-TW": "這裡無法使用通行密鑰解鎖。",
      ja: "ここではパスキーでのロック解除を使えません。",
    },
    hint: {
      en: "Use the OS keychain instead; that key never leaves this machine.",
      "zh-TW": "請改用系統鑰匙圈；那把金鑰絕不會離開這台電腦。",
      ja: "代わりに OS キーチェーンを使ってください。その鍵がこのマシンの外に出ることはありません。",
    },
  },
  "prf-cancelled": {
    message: {
      en: "The passkey prompt was cancelled or timed out.",
      "zh-TW": "通行密鑰的提示已取消或逾時。",
      ja: "パスキーの確認がキャンセルされたか、タイムアウトしました。",
    },
    hint: PASSKEY_RETRY,
  },
  "prf-failed": {
    message: {
      en: "The passkey did not work.",
      "zh-TW": "通行密鑰沒有成功。",
      ja: "パスキーがうまく動きませんでした。",
    },
    hint: {
      en: "Try again and approve the prompt; if it keeps failing, add the passkey again.",
      "zh-TW": "請再試一次並核准提示；如果一直失敗，請重新加入通行密鑰。",
      ja: "もう一度試して確認を承認してください。失敗が続く場合は、パスキーを追加し直してください。",
    },
  },
  "key-bad-length": {
    message: {
      en: "The unlock secret has the wrong length.",
      "zh-TW": "解鎖用的密鑰長度不對。",
      ja: "ロック解除用のシークレットの長さが正しくありません。",
    },
    hint: {
      en: "Unlock again; the secret came from the wrong source.",
      "zh-TW": "請重新解鎖；這個密鑰的來源不正確。",
      ja: "もう一度ロックを解除してください。シークレットの取得元が正しくありません。",
    },
  },
  "data-key-invalid": {
    message: {
      en: "The stored save key is damaged.",
      "zh-TW": "儲存的存檔金鑰已損毀。",
      ja: "保存されたセーブの鍵が壊れています。",
    },
  },
  "data-key-unwrap-failed": {
    message: {
      en: "This passkey or keychain cannot open your saves.",
      "zh-TW": "這把通行密鑰或鑰匙圈無法開啟你的存檔。",
      ja: "このパスキーまたはキーチェーンでは、セーブを開けません。",
    },
    hint: {
      en: "Use a passkey or keychain that was added while the saves were unlocked.",
      "zh-TW": "請使用存檔解鎖時加入的通行密鑰或鑰匙圈。",
      ja: "セーブのロック解除中に追加したパスキーかキーチェーンを使ってください。",
    },
  },
  "data-key-wrapping-missing": {
    message: {
      en: "This passkey or keychain is not linked to your saves yet.",
      "zh-TW": "這把通行密鑰或鑰匙圈還沒有連結到你的存檔。",
      ja: "このパスキーまたはキーチェーンは、まだセーブに紐づいていません。",
    },
    hint: {
      en: "Unlock with a passkey you already linked, then add this one.",
      "zh-TW": "請先用已連結的通行密鑰解鎖，再加入這一把。",
      ja: "紐づけ済みのパスキーでロックを解除してから、これを追加してください。",
    },
  },
  "data-key-locked": {
    message: {
      en: "Unlock your saves before adding another passkey.",
      "zh-TW": "請先解鎖存檔，再新增另一把通行密鑰。",
      ja: "パスキーを追加する前に、セーブのロックを解除してください。",
    },
  },
  "vault-unavailable": {
    message: {
      en: "The OS keychain cannot protect a key here.",
      "zh-TW": "這裡的系統鑰匙圈無法保護金鑰。",
      ja: "ここでは OS キーチェーンで鍵を保護できません。",
    },
    hint: {
      en: "Unlock your OS keychain and restart Unwritten Land, or unlock with a passkey instead.",
      "zh-TW": "請解鎖系統鑰匙圈並重新啟動 Unwritten Land，或改用通行密鑰解鎖。",
      ja: "OS キーチェーンのロックを解除して Unwritten Land を再起動するか、代わりにパスキーでロックを解除してください。",
    },
  },
  "vault-write-failed": {
    message: {
      en: "The keychain key could not be saved.",
      "zh-TW": "無法儲存鑰匙圈金鑰。",
      ja: "キーチェーンの鍵を保存できませんでした。",
    },
    hint: HINT.disk,
  },
  "vault-bad-key": {
    message: {
      en: "The stored keychain key is damaged.",
      "zh-TW": "儲存的鑰匙圈金鑰已損毀。",
      ja: "保存されたキーチェーンの鍵が壊れています。",
    },
    hint: {
      en: "Delete the vault file in the app's data folder so a fresh key is made.",
      "zh-TW": "請刪除應用程式資料夾裡的 vault 檔案，讓它產生新的金鑰。",
      ja: "アプリのデータフォルダーにある vault ファイルを削除すると、新しい鍵が作られます。",
    },
  },
  "wrapping-records-invalid": {
    message: {
      en: "The record of ways to unlock your saves is damaged.",
      "zh-TW": "解鎖存檔方式的紀錄已損毀。",
      ja: "セーブのロック解除方法の記録が壊れています。",
    },
  },
  "wrapping-records-read-failed": {
    message: {
      en: "The record of ways to unlock your saves could not be read.",
      "zh-TW": "無法讀取解鎖存檔方式的紀錄。",
      ja: "セーブのロック解除方法の記録を読み込めませんでした。",
    },
    hint: HINT.readable,
  },
  "wrapping-records-write-failed": {
    message: {
      en: "The record of ways to unlock your saves could not be saved.",
      "zh-TW": "無法儲存解鎖存檔方式的紀錄。",
      ja: "セーブのロック解除方法の記録を保存できませんでした。",
    },
    hint: HINT.disk,
  },

  // ── Encrypted and plain seeds ──────────────────────────────────────────────────────────────
  "bad-header": {
    message: {
      en: "That file is not an encrypted Unwritten Land seed (.seed.enc).",
      "zh-TW": "這個檔案不是 Unwritten Land 的加密種子（.seed.enc）。",
      ja: "そのファイルは Unwritten Land の暗号化シード（.seed.enc）ではありません。",
    },
    hint: {
      en: "Pick a .seed.enc file exported from Unwritten Land.",
      "zh-TW": "請選擇從 Unwritten Land 匯出的 .seed.enc 檔案。",
      ja: "Unwritten Land から書き出した .seed.enc ファイルを選んでください。",
    },
  },
  "decrypt-failed": {
    message: {
      en: "The file could not be decrypted.",
      "zh-TW": "無法解密這個檔案。",
      ja: "ファイルを復号できませんでした。",
    },
    hint: {
      en: "Wrong key or a damaged file. Unlock with the same passkey (or the same machine's keychain) that made it.",
      "zh-TW": "金鑰不對，或檔案已損毀。請用當初建立它的通行密鑰（或同一台電腦的鑰匙圈）解鎖。",
      ja: "鍵が違うか、ファイルが壊れています。作成したときと同じパスキー（または同じマシンのキーチェーン）でロックを解除してください。",
    },
  },
  "seed-read-failed": {
    message: {
      en: "The seed file could not be read.",
      "zh-TW": "無法讀取種子檔案。",
      ja: "シードファイルを読み込めませんでした。",
    },
    hint: HINT.checkFile,
  },
  "seed-write-failed": {
    message: {
      en: "The seed file could not be written.",
      "zh-TW": "無法寫入種子檔案。",
      ja: "シードファイルを書き込めませんでした。",
    },
    hint: HINT.otherFolder,
  },
  "seed-pack-failed": {
    message: {
      en: "The world could not be packed into a seed.",
      "zh-TW": "無法把世界打包成種子。",
      ja: "ワールドをシードにまとめられませんでした。",
    },
    hint: HINT.tryAgain,
  },
  "seed-unreadable": {
    message: {
      en: "That file is not a readable seed.",
      "zh-TW": "這個檔案不是可讀取的種子。",
      ja: "そのファイルは読み込めるシードではありません。",
    },
    hint: HINT.exportAgain,
  },
  "seed-corrupt": {
    message: {
      en: "The seed could not be unpacked.",
      "zh-TW": "無法解開種子。",
      ja: "シードを展開できませんでした。",
    },
    hint: SEED_CORRUPT,
  },
  "seed-incomplete": {
    message: {
      en: "The seed is missing some of the world's files.",
      "zh-TW": "種子缺少世界的部分檔案。",
      ja: "シードにワールドのファイルが一部足りません。",
    },
    hint: SEED_SHAPE,
  },
  "seed-unknown-file": {
    message: {
      en: "The seed contains files a seed should not have.",
      "zh-TW": "種子裡有不該有的檔案。",
      ja: "シードに、あるはずのないファイルがあります。",
    },
    hint: SEED_SHAPE,
  },
  "seed-invalid": {
    message: {
      en: "The seed's world.oui is empty.",
      "zh-TW": "種子裡的 world.oui 是空的。",
      ja: "シードの world.oui が空です。",
    },
    hint: SEED_SHAPE,
  },
  "seed-bad-json": {
    message: {
      en: "A file in the seed is not valid JSON.",
      "zh-TW": "種子裡有檔案不是有效的 JSON。",
      ja: "シード内のファイルが正しい JSON ではありません。",
    },
    hint: SEED_CORRUPT,
  },
  "seed-bad-meta": {
    message: {
      en: "The seed's meta.json is not valid.",
      "zh-TW": "種子的 meta.json 無效。",
      ja: "シードの meta.json が正しくありません。",
    },
    hint: SEED_CORRUPT,
  },
  "seed-bad-genesis": {
    message: {
      en: "The seed's genesis.json is not valid.",
      "zh-TW": "種子的 genesis.json 無效。",
      ja: "シードの genesis.json が正しくありません。",
    },
    hint: SEED_CORRUPT,
  },
  "seed-bad-inventory": {
    message: {
      en: "The seed's inventory.json is not valid.",
      "zh-TW": "種子的 inventory.json 無效。",
      ja: "シードの inventory.json が正しくありません。",
    },
    hint: SEED_CORRUPT,
  },
  "seed-bad-karma": {
    message: {
      en: "The seed's karma log is not valid.",
      "zh-TW": "種子的因果紀錄無效。",
      ja: "シードのカルマの記録が正しくありません。",
    },
    hint: SEED_CORRUPT,
  },
  "seed-bad-scene": {
    message: {
      en: "The seed's world.oui cannot be read.",
      "zh-TW": "無法讀取種子的 world.oui。",
      ja: "シードの world.oui を読み込めません。",
    },
    hint: SEED_CORRUPT,
  },

  // ── Restoring a seed through ENS ───────────────────────────────────────────────────────────
  "ens-invalid-name": {
    message: {
      en: "That is not a valid ENS name.",
      "zh-TW": "這不是有效的 ENS 名稱。",
      ja: "正しい ENS 名ではありません。",
    },
    hint: {
      en: "Type a full name, such as a .eth name or a DNS name imported into ENS.",
      "zh-TW": "請輸入完整名稱，例如 .eth 名稱，或匯入 ENS 的 DNS 網域。",
      ja: ".eth の名前や ENS に取り込んだ DNS ドメインなど、完全な名前を入力してください。",
    },
  },
  "ens-not-found": {
    message: {
      en: "That name has no address or aether.seed record on this network.",
      "zh-TW": "這個名稱在這個網路上沒有位址，也沒有 aether.seed 紀錄。",
      ja: "その名前には、このネットワーク上でアドレスも aether.seed レコードもありません。",
    },
    hint: {
      en: "Check the spelling and the network (Sepolia or mainnet), and that records were set on the name.",
      "zh-TW": "請檢查拼字與網路（Sepolia 或主網），並確認名稱上已經設定紀錄。",
      ja: "つづりとネットワーク（Sepolia かメインネットか）、名前にレコードが設定されているかを確認してください。",
    },
  },
  "ens-names-not-configured": {
    message: {
      en: "ENS names are not set up on this machine.",
      "zh-TW": "這台機器還沒設定 ENS 名稱。",
      ja: "このマシンでは ENS 名が設定されていません。",
    },
    hint: {
      en: "Run bun run ens:setup <label> and put the UNWRITTEN_ENS_* lines it prints in .env.",
      "zh-TW": "執行 bun run ens:setup <label>，再把它印出的 UNWRITTEN_ENS_* 設定放進 .env。",
      ja: "bun run ens:setup <label> を実行し、表示された UNWRITTEN_ENS_* の行を .env に入れてください。",
    },
  },
  "ens-names-read-only": {
    message: {
      en: "This machine has no signing key for ENS names.",
      "zh-TW": "這台機器沒有 ENS 名稱的簽署金鑰。",
      ja: "このマシンには ENS 名の署名鍵がありません。",
    },
    hint: {
      en: "Set UNWRITTEN_PRIVATE_KEY in .env to write names; reading works without it.",
      "zh-TW": "在 .env 設定 UNWRITTEN_PRIVATE_KEY 才能寫入名稱；不設也能讀取。",
      ja: "名前を書き込むには .env に UNWRITTEN_PRIVATE_KEY を設定してください。読み取りは不要です。",
    },
  },
  "ens-bad-label": {
    message: {
      en: "This cartridge id cannot be an ENS label.",
      "zh-TW": "這個卡帶 id 不能當作 ENS 標籤。",
      ja: "このカートリッジ ID は ENS のラベルにできません。",
    },
    hint: {
      en: "Remix the cartridge under an id made of a–z, 0–9 and hyphens.",
      "zh-TW": "請用只含 a–z、0–9 與連字號的 id 重新混製這個卡帶。",
      ja: "a–z、0–9、ハイフンだけの ID でリミックスしてください。",
    },
  },
  "ens-name-taken": {
    message: {
      en: "That ENS name already belongs to something else.",
      "zh-TW": "這個 ENS 名稱已經屬於別的東西。",
      ja: "その ENS 名はすでに別のものに使われています。",
    },
    hint: {
      en: "Two cartridge ids share this label; remix under a different id.",
      "zh-TW": "有兩個卡帶 id 對應到同一個標籤；請換一個 id 重新混製。",
      ja: "2 つのカートリッジ ID が同じラベルになっています。別の ID でリミックスしてください。",
    },
  },
  "ens-write-failed": {
    message: {
      en: "Sepolia refused the ENS transaction.",
      "zh-TW": "Sepolia 拒絕了這筆 ENS 交易。",
      ja: "Sepolia が ENS のトランザクションを拒否しました。",
    },
    hint: {
      en: "Check the key has Sepolia ETH and that UNWRITTEN_ENS_* came from bun run ens:setup with this key.",
      "zh-TW":
        "請確認金鑰有 Sepolia ETH，且 UNWRITTEN_ENS_* 是用同一把金鑰執行 bun run ens:setup 產生的。",
      ja: "鍵に Sepolia ETH があり、UNWRITTEN_ENS_* が同じ鍵で bun run ens:setup を実行して得たものか確認してください。",
    },
  },
  "ens-unreachable": {
    message: {
      en: "The Ethereum network could not be reached.",
      "zh-TW": "無法連線到以太坊網路。",
      ja: "イーサリアムのネットワークに接続できません。",
    },
    hint: {
      en: "Check your network connection (or your RPC), then try again.",
      "zh-TW": "請檢查網路連線（或你的 RPC），然後再試一次。",
      ja: "ネットワーク接続（または RPC）を確認してから、もう一度試してください。",
    },
  },
  "seed-fetch-failed": {
    message: {
      en: "The seed could not be downloaded.",
      "zh-TW": "無法下載種子。",
      ja: "シードをダウンロードできませんでした。",
    },
    hint: {
      en: "Check your network connection and the name's aether.seed link, then try again.",
      "zh-TW": "請檢查網路連線與這個名稱的 aether.seed 連結，然後再試一次。",
      ja: "ネットワーク接続と、名前の aether.seed のリンクを確認してから、もう一度試してください。",
    },
  },
  "seed-timeout": {
    message: {
      en: "The seed download timed out.",
      "zh-TW": "種子下載逾時。",
      ja: "シードのダウンロードがタイムアウトしました。",
    },
    hint: {
      en: "The server is slow or unreachable; try again later.",
      "zh-TW": "對方伺服器太慢或無法連線，請稍後再試。",
      ja: "配信元のサーバーが遅いか、接続できません。しばらくしてから試してください。",
    },
  },
  "seed-too-large": {
    message: {
      en: "The seed is too large.",
      "zh-TW": "種子太大了。",
      ja: "シードが大きすぎます。",
    },
    hint: {
      en: "Seeds are capped at 20 MB.",
      "zh-TW": "種子的上限是 20 MB。",
      ja: "シードの上限は 20 MB です。",
    },
  },
  "seed-url-invalid": {
    message: {
      en: "The aether.seed record is not a link.",
      "zh-TW": "aether.seed 紀錄不是連結。",
      ja: "aether.seed レコードがリンクではありません。",
    },
    hint: {
      en: "Set the name's aether.seed record to an https:// link.",
      "zh-TW": "請把這個名稱的 aether.seed 紀錄設成 https:// 連結。",
      ja: "名前の aether.seed レコードを https:// のリンクにしてください。",
    },
  },
  "seed-url-insecure": {
    message: {
      en: "The seed link is not secure, so it was not fetched.",
      "zh-TW": "種子連結不安全，所以沒有下載。",
      ja: "シードのリンクが安全でないため、取得しませんでした。",
    },
    hint: {
      en: "Only https:// seed links are fetched.",
      "zh-TW": "只會下載 https:// 的種子連結。",
      ja: "取得できるのは https:// のシードのリンクだけです。",
    },
  },
};
