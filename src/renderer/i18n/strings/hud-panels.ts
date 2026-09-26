// Play panels over the HUD: change proposals, the tweak panel (mod revisions and places), the
// isolated playtest, and the mod toasts of the world harness. Spread into HUD by ./hud.ts.

import type { Phrase } from "./phrase";

export const HUD_PANELS = {
  // ── Change proposals ───────────────────────────────────────────────────────────────────────
  proposalLabel: { en: "CHANGE PROPOSAL", "zh-TW": "變更提案", ja: "変更案" },
  proposalSaveNote: {
    en: "Preview: only this instance's flags, inventory, or atmosphere save will change.",
    "zh-TW": "預覽：只會改變這個遊玩進度的旗標、背包或氛圍存檔。",
    ja: "プレビュー：このプレイのフラグ・持ち物・雰囲気のセーブだけが変わります。",
  },
  proposalStructural: {
    en: "Structural changes are authored in a Remix workspace and published as a new revision.",
    "zh-TW": "結構性的變更要在 Remix 工作區編寫，再發布成新的版本。",
    ja: "構造の変更は Remix のワークスペースで作り、新しいリビジョンとして公開します。",
  },
  approve: { en: "Approve", "zh-TW": "核准", ja: "承認" },
  reject: { en: "Reject", "zh-TW": "駁回", ja: "却下" },
  proposalApplied: {
    en: "Applied: {change}",
    "zh-TW": "已套用：{change}",
    ja: "適用しました：{change}",
  },
  proposalNotApplied: {
    en: "Not applied: {reason}",
    "zh-TW": "未套用：{reason}",
    ja: "適用できませんでした：{reason}",
  },
  previewFlag: {
    en: "Set save flag {key} to {value}",
    "zh-TW": "將存檔旗標 {key} 設為 {value}",
    ja: "セーブのフラグ {key} を {value} にする",
  },
  previewAtmosphere: {
    en: "Change the saved atmosphere overlay",
    "zh-TW": "改變存檔裡的氛圍設定",
    ja: "セーブの雰囲気を変える",
  },
  previewAddMaterials: {
    en: "Add materials: {list}",
    "zh-TW": "加入素材：{list}",
    ja: "素材を追加：{list}",
  },
  previewConsume: {
    en: "Consume materials: {list}",
    "zh-TW": "消耗素材：{list}",
    ja: "素材を消費：{list}",
  },
  previewAddItem: {
    en: "Add item: {name}",
    "zh-TW": "加入道具：{name}",
    ja: "アイテムを追加：{name}",
  },
  previewStructural: {
    en: "{kind} changes the world's structure",
    "zh-TW": "{kind} 會改變世界的結構",
    ja: "{kind} はワールドの構造を変えます",
  },

  // ── Tweak panel: mod revisions ─────────────────────────────────────────────────────────────
  tweakRules: { en: "Change the rules", "zh-TW": "修改規則", ja: "ルールを変える" },
  tweakPlace: { en: "Add a place", "zh-TW": "新增關卡", ja: "ステージを追加" },
  tweakRulesTitle: { en: "Create a mod revision", "zh-TW": "建立模組修訂版", ja: "MOD 版をつくる" },
  tweakPlaceTitle: {
    en: "Add a place to this land",
    "zh-TW": "在這片大地新增關卡",
    ja: "この大地にステージを追加",
  },
  tweakRulesNote: {
    en: "Describe a weapon, monsters, pacing, a squad or a scene change. Anything the world lacks for it is added for you. Review the proposal, then publish a new version of the world; your current run stays on its original version.",
    "zh-TW":
      "描述一把武器、怪物、節奏、隊伍或場景的變化。世界缺少的功能會自動補上。檢查變更提案後，再發布世界的新版本；目前的遊玩進度會留在原本的版本。",
    ja: "武器、モンスター、テンポ、部隊、シーンの変更などを書いてください。ワールドに足りない機能は自動で追加されます。変更案を確認してから新しいバージョンを公開します。今のプレイは元のバージョンのままです。",
  },
  tweakPlaceNote: {
    en: "A side-scrolling course, a grid dungeon or an otherworld (one of your AI worlds), added to this save now. You walk into it from its entrance on the land and come back out where you went in, with what you found.",
    "zh-TW":
      "一段橫向捲軸關卡、一座格子地城，或一個異界（你的某個 AI 世界），現在就加進這個存檔。從大地上的入口走進去，出來時回到原地，並帶著找到的東西。",
    ja: "横スクロールのコース、グリッドのダンジョン、または異界（あなたの AI ワールド）を今このセーブに加えます。大地の入口から入り、見つけた物を持って入った場所に戻ってきます。",
  },
  tweakNeedsCartridge: {
    en: "Open a published v2 world to create a mod revision.",
    "zh-TW": "開啟已發布的 v2 世界，才能建立模組修訂版。",
    ja: "MOD 版をつくるには、公開済みの v2 ワールドを開いてください。",
  },
  requestedChange: { en: "Requested change", "zh-TW": "想要的變更", ja: "変えたい内容" },
  requestedPlaceholder: {
    en: "Add a gun and three slimes / make fights turn-based",
    "zh-TW": "加一把槍和三隻史萊姆／把戰鬥改成回合制",
    ja: "銃とスライム3匹を追加 / 戦闘をターン制に",
  },
  noProposal: {
    en: "No proposal yet.",
    "zh-TW": "還沒有變更提案。",
    ja: "変更案はまだありません。",
  },
  preparingProposal: {
    en: "Preparing and checking the proposal…",
    "zh-TW": "正在準備並檢查變更提案…",
    ja: "変更案を準備・確認しています…",
  },
  newVersion: { en: "New version", "zh-TW": "新版本", ja: "新しいバージョン" },
  opWeapon: {
    en: "Add {name} · {damage} damage · {range} range · {cooldown} ms cooldown",
    "zh-TW": "加入 {name} · 傷害 {damage} · 射程 {range} · 冷卻 {cooldown} ms",
    ja: "{name} を追加 · ダメージ {damage} · 射程 {range} · クールダウン {cooldown} ms",
  },
  opTiming: {
    en: "Timing: {from} → {to} · {resolution}",
    "zh-TW": "時序：{from} → {to} · {resolution}",
    ja: "タイミング：{from} → {to} · {resolution}",
  },
  opModule: { en: "Module: {id}", "zh-TW": "功能模組：{id}", ja: "モジュール：{id}" },
  opScene: {
    en: "Scene {id}: {changes}",
    "zh-TW": "場景 {id}：{changes}",
    ja: "シーン {id}：{changes}",
  },
  opMonster: {
    en: "{kind} (level {level}) at {x}, {z}",
    "zh-TW": "{kind}（等級 {level}）位於 {x}, {z}",
    ja: "{kind}（Lv.{level}）位置 {x}, {z}",
  },
  compatSummary: {
    en: "Save: {impact}. Network: new matching version required. Affected scenes: {scenes}.",
    "zh-TW": "存檔：{impact}。連線：雙方需要相同的新版本。受影響的場景：{scenes}。",
    ja: "セーブ：{impact}。通信：同じ新バージョンが必要です。影響するシーン：{scenes}。",
  },
  none: { en: "none", "zh-TW": "無", ja: "なし" },
  impactMigration: { en: "migration", "zh-TW": "需要遷移", ja: "移行が必要" },
  impactNewInstance: { en: "new run", "zh-TW": "新的遊玩進度", ja: "新しいプレイ" },
  orbitPreview: { en: "Orbit preview", "zh-TW": "環繞預覽", ja: "回転プレビュー" },
  playtestChanges: { en: "Playtest changes", "zh-TW": "試玩變更", ja: "変更を試遊" },
  publishedNote: {
    en: "Published {name} {version}. The original version and your progress are unchanged.",
    "zh-TW": "已發布 {name} {version}。原本的版本和你的進度都沒有改變。",
    ja: "{name} {version} を公開しました。元のバージョンとあなたの進行はそのままです。",
  },
  generateProposal: { en: "Generate proposal", "zh-TW": "生成變更提案", ja: "変更案を生成" },
  approvePublish: {
    en: "Approve & publish revision",
    "zh-TW": "核准並發布修訂版",
    ja: "承認して公開",
  },
  playNewVersion: { en: "Play new version", "zh-TW": "遊玩新版本", ja: "新バージョンをプレイ" },

  // ── Tweak panel: places ────────────────────────────────────────────────────────────────────
  kindSide: { en: "Side-scroller", "zh-TW": "橫向捲軸", ja: "横スクロール" },
  kindSideDetail: {
    en: "Run and jump along one row, platforms to climb, the way out at the far end.",
    "zh-TW": "沿著一條路奔跑跳躍、攀上平台，出口在最遠端。",
    ja: "一列を走って跳び、足場を登る。出口は一番奥にあります。",
  },
  kindDungeon: { en: "Dungeon", "zh-TW": "地城", ja: "ダンジョン" },
  kindDungeonDetail: {
    en: "A grid maze seen from above; the far end is somewhere in its corridors.",
    "zh-TW": "從上方俯視的格子迷宮；終點藏在走廊的某處。",
    ja: "見下ろしのグリッド迷路。ゴールは通路のどこかにあります。",
  },
  placeNeedsLand: {
    en: "Places are added to open land. Open a world with open land.",
    "zh-TW": "關卡只能加在開放的大地上。請開啟有開放大地的世界。",
    ja: "ステージは開かれた大地に追加されます。大地のあるワールドを開いてください。",
  },
  placeWishLabel: {
    en: "What is it? (optional — mention north / south / east / west to choose where)",
    "zh-TW": "這是什麼地方？（選填 — 寫上北／南／東／西可以指定方向）",
    ja: "どんな場所？（任意 — 北・南・東・西と書くと方角を選べます）",
  },
  placeWishPlaceholder: {
    en: "A flooded mine north of here, full of slimes",
    "zh-TW": "北邊一座淹水的礦坑，到處都是史萊姆",
    ja: "北にある水没した鉱山、スライムだらけ",
  },
  writingPlace: {
    en: "Writing the place…",
    "zh-TW": "正在寫這個關卡…",
    ja: "ステージを書いています…",
  },
  placeMade: {
    en: "Its entrance stands on the land now (at {cx}, {cz}). Walk to its marker and press E. It is part of this world: nothing else changed.",
    "zh-TW":
      "入口已經出現在大地上（位置 {cx}, {cz}）。走到標記旁按 E。它屬於這個世界，其他東西都沒有改變。",
    ja: "入口が大地に現れました（位置 {cx}, {cz}）。目印まで歩いて E を押してください。このワールドの一部で、ほかは何も変わっていません。",
  },
  addPlace: { en: "Add this place", "zh-TW": "新增這個關卡", ja: "このステージを追加" },

  // ── Isolated playtest ──────────────────────────────────────────────────────────────────────
  playtestFrame: {
    en: "Isolated scene playtest",
    "zh-TW": "隔離的場景試玩",
    ja: "隔離されたシーン試遊",
  },
  playtestInvalid: {
    en: "Invalid playtest content.",
    "zh-TW": "試玩內容無效。",
    ja: "試遊データが無効です。",
  },
  invalidContent: { en: "Invalid content.", "zh-TW": "內容無效。", ja: "内容が無効です。" },
  loadingPlaytest: { en: "Loading playtest…", "zh-TW": "正在載入試玩…", ja: "試遊を読み込み中…" },
  playtestHint: {
    en: "Playtest · WASD move · click to aim/fire · R end turn · Esc release cursor. No save is written.",
    "zh-TW": "試玩 · WASD 移動 · 點擊瞄準／開火 · R 結束回合 · Esc 釋放游標。不會寫入存檔。",
    ja: "試遊 · WASD 移動 · クリックで照準/射撃 · R ターン終了 · Esc カーソル解放。セーブは書き込まれません。",
  },
  reset: { en: "Reset", "zh-TW": "重設", ja: "リセット" },
  ammo: {
    en: "{weapon} · {ammo} ammo",
    "zh-TW": "{weapon} · 彈藥 {ammo}",
    ja: "{weapon} · 弾薬 {ammo}",
  },

  // ── Mods in the world harness ──────────────────────────────────────────────────────────────
  modMountFailed: {
    en: "A mod could not be mounted: {reason}",
    "zh-TW": "有個模組無法掛載：{reason}",
    ja: "MOD をマウントできませんでした：{reason}",
  },
  modLoadFailed: {
    en: 'Mod "{name}" is enabled but could not be loaded: {reason}',
    "zh-TW": "模組「{name}」已啟用，但無法載入：{reason}",
    ja: "MOD「{name}」は有効ですが、読み込めませんでした：{reason}",
  },
} as const satisfies Record<string, Phrase>;
