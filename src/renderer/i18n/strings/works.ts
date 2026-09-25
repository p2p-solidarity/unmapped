// AI Worlds: the list, the workshop, the player view and the story episodes.

import type { Phrase } from "./phrase";

export const WORKS = {
  localContextWarning: {
    en: "This local model has a {n} token context. AI Worlds may not fit; a task that cannot fit is stopped before it reaches the model. Choose a larger context or Cloud API in Settings → Model.",
    "zh-TW":
      "這個本地模型的上下文只有 {n} token，可能裝不下 AI Worlds。空間不足的任務會在送出前停止。請到「設定 → 模型」加大上下文或改用雲端 API。",
    ja: "このローカルモデルのコンテキストは {n} トークンです。AI Worlds が収まらない場合、送信前に停止します。「設定 → モデル」でコンテキストを増やすかクラウド API に切り替えてください。",
  },
  // ── Library (WorksScreen) ──────────────────────────────────────────────────────────────────
  backToTitle: { en: "← Title", "zh-TW": "← 標題畫面", ja: "← タイトル" },
  heading: { en: "AI Worlds", "zh-TW": "AI 世界", ja: "AI ワールド" },
  tagline: {
    en: "Describe a world in one sentence, play it, change it with another sentence.",
    "zh-TW": "用一句話描述一個世界，玩玩看，再用一句話改變它。",
    ja: "ひと言でワールドを描いて遊び、もうひと言で作り変えましょう。",
  },
  newWorld: { en: "New world", "zh-TW": "新世界", ja: "新しいワールド" },
  newWorldPlaceholder: {
    en: "e.g. A tiny maze where a ninja collects three keys before the exit opens",
    "zh-TW": "例如：一座小迷宮，忍者要先收集三把鑰匙，出口才會打開",
    ja: "例：忍者が鍵を 3 本集めると出口が開く小さな迷路",
  },
  generate: { en: "Generate", "zh-TW": "生成", ja: "生成" },
  readingWorlds: {
    en: "Reading your worlds…",
    "zh-TW": "正在讀取你的世界…",
    ja: "ワールドを読み込み中…",
  },
  drafts: { en: "Drafts", "zh-TW": "草稿", ja: "下書き" },
  noDrafts: { en: "No drafts yet.", "zh-TW": "還沒有草稿。", ja: "下書きはまだありません。" },
  draftNotPlayable: { en: "not playable yet", "zh-TW": "尚無可玩版本", ja: "まだプレイできません" },
  draftPlayable: { en: "playable {id}", "zh-TW": "可玩 {id}", ja: "プレイ可能 {id}" },
  draftCounts: {
    en: "{attempts} {attempts|attempt|attempts} · {saved} saved",
    "zh-TW": "嘗試 {attempts} 次 · 已儲存 {saved} 個",
    ja: "試行 {attempts} 回 · 保存 {saved} 件",
  },
  savedWorlds: { en: "Saved worlds", "zh-TW": "已儲存的世界", ja: "保存したワールド" },
  noSavedWorlds: {
    en: "Save a draft version to see it here.",
    "zh-TW": "儲存草稿的某個版本後，就會出現在這裡。",
    ja: "下書きのバージョンを保存するとここに表示されます。",
  },
  noSummary: { en: "No summary.", "zh-TW": "沒有摘要。", ja: "概要はありません。" },
  onChain: {
    en: "on chain · {author}…",
    "zh-TW": "已上鏈 · {author}…",
    ja: "オンチェーン · {author}…",
  },
  notOnChain: { en: "not on chain", "zh-TW": "未上鏈", ja: "オンチェーン未登録" },
  noLedger: {
    en: "No on-chain ledger is set up on this machine, so worlds are not checked or registered on chain.",
    "zh-TW": "這台電腦沒有設定鏈上帳本，所以不會在鏈上查詢或登錄世界。",
    ja: "このマシンにはオンチェーン台帳が設定されていないため、ワールドをチェーンで確認・登録しません。",
  },
  checkingChain: {
    en: "asking the ledger…",
    "zh-TW": "正在查詢鏈上帳本…",
    ja: "台帳に照会中…",
  },
  registerOnChain: { en: "Register on chain", "zh-TW": "登錄到鏈上帳本", ja: "台帳に登録" },
  confirmGas: { en: "Confirm · spends gas", "zh-TW": "確認 · 需支付 gas", ja: "確定 · ガス代あり" },
  registerAsk: {
    en: 'Registering "{title}" sends a transaction and spends gas. Click again to confirm.',
    "zh-TW": "登錄「{title}」會送出一筆交易並支付 gas。再按一次以確認。",
    ja: "「{title}」を登録するとトランザクションを送信し、ガス代がかかります。もう一度押して確定してください。",
  },
  registering: {
    en: "Registering {title}…",
    "zh-TW": "正在登錄 {title}…",
    ja: "{title} を登録中…",
  },
  registered: { en: "Registered · {tx}", "zh-TW": "已登錄 · {tx}", ja: "登録しました · {tx}" },
  journeyPick: { en: "Journey #{n}", "zh-TW": "旅程 #{n}", ja: "旅路 #{n}" },
  addToJourney: { en: "+ Journey", "zh-TW": "+ 旅程", ja: "+ 旅路" },
  startJourney: {
    en: "Start journey ({n} worlds)",
    "zh-TW": "開始旅程（{n} 個世界）",
    ja: "旅路を始める（{n} ワールド）",
  },
  journeys: { en: "Journeys", "zh-TW": "旅程", ja: "旅路" },
  nothingPlayed: {
    en: "Nothing played yet.",
    "zh-TW": "還沒有玩過任何世界。",
    ja: "まだ何もプレイしていません。",
  },
  journeyLine: {
    en: "world {current}/{total} · {cleared} cleared · {when}",
    "zh-TW": "第 {current}/{total} 個世界 · 已通關 {cleared} 個 · {when}",
    ja: "ワールド {current}/{total} · クリア {cleared} · {when}",
  },

  // ── Workshop (WorkshopView) ────────────────────────────────────────────────────────────────
  backToWorlds: { en: "← Worlds", "zh-TW": "← 世界列表", ja: "← ワールド一覧" },
  openingDraft: { en: "Opening draft…", "zh-TW": "正在開啟草稿…", ja: "下書きを開いています…" },
  noPlayableVersion: {
    en: "no playable version yet",
    "zh-TW": "尚無可玩版本",
    ja: "プレイ可能なバージョンなし",
  },
  playingVersion: { en: "playing {id}", "zh-TW": "正在玩 {id}", ja: "{id} をプレイ中" },
  savedVersion: { en: "saved v{version}", "zh-TW": "已儲存 v{version}", ja: "保存済み v{version}" },
  notSaved: { en: "not saved", "zh-TW": "未儲存", ja: "未保存" },
  restart: { en: "Restart", "zh-TW": "重新開始", ja: "やり直す" },
  saveVersion: { en: "Save version", "zh-TW": "儲存版本", ja: "バージョン保存" },
  firstVersionHere: {
    en: "The first version appears here once it passes the check.",
    "zh-TW": "第一個版本通過檢查後就會出現在這裡。",
    ja: "最初のバージョンはチェックに通るとここに表示されます。",
  },
  nothingPlayable: {
    en: "Nothing playable yet.",
    "zh-TW": "還沒有可玩的版本。",
    ja: "まだプレイできるものはありません。",
  },
  describeWorld: { en: "Describe the world", "zh-TW": "描述這個世界", ja: "ワールドを説明" },
  changeRequest: { en: "Change request", "zh-TW": "變更要求", ja: "変更リクエスト" },
  oneSentence: { en: "One sentence", "zh-TW": "一句話就好", ja: "ひと言で" },
  changePlaceholder: {
    en: "e.g. Enemies move twice as fast; make the sky dusk",
    "zh-TW": "例如：敵人移動速度加倍；天空改成黃昏",
    ja: "例：敵の移動を 2 倍速に、空を夕暮れに",
  },
  applyChange: { en: "Apply change", "zh-TW": "套用變更", ja: "変更を適用" },
  runningNote: {
    en: "{elapsed} · the playable version stays as it is until this passes",
    "zh-TW": "{elapsed} · 通過檢查前，可玩版本維持原樣",
    ja: "{elapsed} · チェックに通るまでプレイ可能なバージョンはそのままです",
  },
  images: { en: "Images", "zh-TW": "圖片", ja: "画像" },
  missing: { en: "missing", "zh-TW": "缺少", ja: "欠落" },
  replace: { en: "Replace…", "zh-TW": "替換…", ja: "差し替え…" },
  thisSession: { en: "This session", "zh-TW": "本次工作階段", ja: "このセッション" },
  history: { en: "History", "zh-TW": "紀錄", ja: "履歴" },
  current: { en: "current", "zh-TW": "目前版本", ja: "現在" },
  restoreVersion: {
    en: "Restore this version",
    "zh-TW": "還原成這個版本",
    ja: "このバージョンに戻す",
  },

  // Candidate kinds and statuses (also an attempt's outcome).
  kindGenerate: { en: "generate", "zh-TW": "生成", ja: "生成" },
  kindEdit: { en: "edit", "zh-TW": "修改", ja: "変更" },
  kindRepair: { en: "repair", "zh-TW": "修復", ja: "修復" },
  kindAsset: { en: "asset", "zh-TW": "素材", ja: "素材" },
  kindImport: { en: "import", "zh-TW": "匯入", ja: "読み込み" },
  statusPending: { en: "pending", "zh-TW": "待檢查", ja: "確認待ち" },
  statusPlayable: { en: "playable", "zh-TW": "可玩", ja: "プレイ可能" },
  statusFailed: { en: "failed", "zh-TW": "失敗", ja: "失敗" },
  statusStale: { en: "stale", "zh-TW": "已過時", ja: "旧版" },
  statusCancelled: { en: "cancelled", "zh-TW": "已取消", ja: "キャンセル" },

  // One attempt's report line.
  firstTry: { en: "first try", "zh-TW": "一次成功", ja: "一発成功" },
  afterRepair: { en: "after repair", "zh-TW": "修復後成功", ja: "修復後に成功" },
  modelTime: { en: "model {time}", "zh-TW": "模型 {time}", ja: "モデル {time}" },
  tokensInOut: {
    en: "{in} in / {out} out tokens",
    "zh-TW": "輸入 {in} / 輸出 {out} tokens",
    ja: "入力 {in} / 出力 {out} トークン",
  },
  repairCount: { en: "{n} {n|repair|repairs}", "zh-TW": "修復 {n} 次", ja: "修復 {n} 回" },
  metricsLine: {
    en: "{time} · {in} in / {out} out",
    "zh-TW": "{time} · 輸入 {in} / 輸出 {out}",
    ja: "{time} · 入力 {in} / 出力 {out}",
  },

  // What an attempt is doing right now.
  stageStarting: { en: "Starting…", "zh-TW": "啟動中…", ja: "開始中…" },
  stageWriting: {
    en: "Writing the world…",
    "zh-TW": "正在寫出世界…",
    ja: "ワールドを書いています…",
  },
  stageApplying: { en: "Applying the change…", "zh-TW": "正在套用變更…", ja: "変更を適用中…" },
  stageRepairing: {
    en: "Repairing ({n}/{max})…",
    "zh-TW": "修復中（{n}/{max}）…",
    ja: "修復中（{n}/{max}）…",
  },
  stageChecking: {
    en: "Checking in the player…",
    "zh-TW": "正在播放器中檢查…",
    ja: "プレイヤーで確認中…",
  },
  stageDrawing: {
    en: 'Drawing "{asset}"…',
    "zh-TW": "正在繪製「{asset}」…",
    ja: "「{asset}」を描いています…",
  },
  stageCheckingImage: {
    en: "Checking the new image…",
    "zh-TW": "正在檢查新圖片…",
    ja: "新しい画像を確認中…",
  },

  // Notices after an attempt.
  noticeRestarted: {
    en: "Preview restarted from the beginning for the new version.",
    "zh-TW": "預覽已為新版本從頭開始。",
    ja: "新しいバージョンのため、プレビューを最初からやり直しました。",
  },
  noticeCancelled: {
    en: "Cancelled. The playable version was not touched.",
    "zh-TW": "已取消。可玩版本沒有被更動。",
    ja: "キャンセルしました。プレイ可能なバージョンはそのままです。",
  },
  noticeNotApplied: {
    en: "Not applied ({outcome}). The playable version was not touched.",
    "zh-TW": "未套用（{outcome}）。可玩版本沒有被更動。",
    ja: "適用されませんでした（{outcome}）。プレイ可能なバージョンはそのままです。",
  },
  noticeSaved: {
    en: "Saved {title} v{version}.",
    "zh-TW": "已儲存 {title} v{version}。",
    ja: "{title} v{version} を保存しました。",
  },
  noticeRestored: { en: "Restored {id}.", "zh-TW": "已還原 {id}。", ja: "{id} に戻しました。" },
  previewCleared: { en: "Cleared: {summary}", "zh-TW": "通關：{summary}", ja: "クリア：{summary}" },
  previewError: { en: "Error: {message}", "zh-TW": "錯誤：{message}", ja: "エラー：{message}" },

  // ── Check sandbox (useChecker) and frame (WorkFrame) ──────────────────────────────────────
  checkingFresh: {
    en: "Checking {id} in a separate sandbox (fresh start, keys + click replayed)",
    "zh-TW": "正在獨立沙盒中檢查 {id}（全新開始，重播按鍵與點擊）",
    ja: "別のサンドボックスで {id} を確認中（新規開始、キーとクリックを再生）",
  },
  checkingResume: {
    en: "Checking {id} in a separate sandbox (resuming from its save)",
    "zh-TW": "正在獨立沙盒中檢查 {id}（從它的存檔繼續）",
    ja: "別のサンドボックスで {id} を確認中（セーブから再開）",
  },
  startingWorld: { en: "Starting world…", "zh-TW": "世界啟動中…", ja: "ワールドを起動中…" },

  // ── Journey player (PlayerView) ────────────────────────────────────────────────────────────
  openingJourney: { en: "Opening journey…", "zh-TW": "正在開啟旅程…", ja: "旅路を開いています…" },
  exit: { en: "Exit", "zh-TW": "離開", ja: "終了" },
  playerLine: {
    en: "world {current}/{total} · {ref} · carry {carry}",
    "zh-TW": "第 {current}/{total} 個世界 · {ref} · 攜帶 {carry}",
    ja: "ワールド {current}/{total} · {ref} · 持ち越し {carry}",
  },
  worldError: {
    en: "World error: {message}",
    "zh-TW": "世界錯誤：{message}",
    ja: "ワールドのエラー：{message}",
  },
  nextWorld: { en: "Next world →", "zh-TW": "下一個世界 →", ja: "次のワールド →" },
  restartWorld: { en: "Restart world", "zh-TW": "重玩這個世界", ja: "ワールドをやり直す" },
  reloadWorld: { en: "Reload world", "zh-TW": "重新載入世界", ja: "ワールドを再読み込み" },
  worldCleared: { en: "World cleared", "zh-TW": "世界通關", ja: "ワールドクリア" },
  carriedForward: {
    en: "Carried forward: {carry}",
    "zh-TW": "帶往下一站：{carry}",
    ja: "持ち越し：{carry}",
  },
  journeyComplete: { en: "Journey complete.", "zh-TW": "旅程完成。", ja: "旅路を終えました。" },

  // ── Story chapters written ahead (EpisodePrefetch) ────────────────────────────────────────
  landNextChapter: { en: "the land's next chapter", "zh-TW": "大地的下一章", ja: "大地の次の章" },
  askingModel: { en: "Asking the model…", "zh-TW": "正在詢問模型…", ja: "モデルに問い合わせ中…" },
  chapterReady: {
    en: "“{title}” is ready at its gate.",
    "zh-TW": "「{title}」已在關口準備好了。",
    ja: "「{title}」がゲートで待っています。",
  },
  newChapterOnMap: {
    en: "A new chapter is on the map: {title} ({place})",
    "zh-TW": "地圖上出現新章節：{title}（{place}）",
    ja: "新しい章が地図に現れました：{title}（{place}）",
  },
  writingAhead: {
    en: "Writing the next chapter… · {label}",
    "zh-TW": "正在撰寫下一章… · {label}",
    ja: "次の章を執筆中… · {label}",
  },
  stopping: {
    en: "Stopping after the current step…",
    "zh-TW": "完成目前步驟後就會停止…",
    ja: "現在のステップが終わると停止します…",
  },
  pause: { en: "Pause", "zh-TW": "暫停", ja: "一時停止" },
  pausedNote: {
    en: "Writing the next chapter ahead is paused.",
    "zh-TW": "預先撰寫下一章已暫停。",
    ja: "次の章の先行執筆は一時停止中です。",
  },
  notWrittenAhead: {
    en: "The next chapter is not written ahead.",
    "zh-TW": "下一章尚未預先寫好。",
    ja: "次の章はまだ先行執筆されていません。",
  },
  // "Retry", not common.retry ("Try again"): the model-offline hint tells the player to press Retry.
  retry: { en: "Retry", "zh-TW": "重試", ja: "リトライ" },

  // ── Otherworlds in the place maker (異界) ──────────────────────────────────────────────────
  otherworldSaved: {
    en: "AI worlds saved on this device",
    "zh-TW": "這台裝置上儲存的 AI 世界",
    ja: "この端末に保存した AI ワールド",
  },
  otherworldNone: {
    en: "No AI world is saved on this device yet. Write a new one below.",
    "zh-TW": "這台裝置上還沒有儲存任何 AI 世界。在下面寫一個新的吧。",
    ja: "この端末にはまだ AI ワールドが保存されていません。下で新しく書きましょう。",
  },
  otherworldPlace: { en: "Place its entrance", "zh-TW": "放置入口", ja: "入口を置く" },
  otherworldFree: {
    en: "Placing a saved world asks no model; its entrance appears a short walk away.",
    "zh-TW": "放置已儲存的世界不會呼叫模型；入口會出現在走幾步就到的地方。",
    ja: "保存したワールドを置くときはモデルを使いません。入口は少し歩いた先に現れます。",
  },
  otherworldWrite: {
    en: "Write a new otherworld",
    "zh-TW": "寫一個新的異界",
    ja: "新しい異界を書く",
  },
  otherworldWriteNote: {
    en: "Describe it in the box above. The workshop opens over the land, writes and checks it; the entrance appears once you save a version.",
    "zh-TW":
      "在上面的欄位描述它。工作坊會在大地上打開，寫好並檢查；你儲存一個版本後，入口就會出現。",
    ja: "上の欄に書いてください。大地の上に工房が開き、書いて確かめます。バージョンを保存すると入口が現れます。",
  },
  otherworldLibrary: {
    en: "All AI worlds and journeys (leaves the land)",
    "zh-TW": "所有 AI 世界與旅程（會離開大地）",
    ja: "すべての AI ワールドと旅路（大地を離れます）",
  },
} as const satisfies Record<string, Phrase>;
