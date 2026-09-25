// The open land: chapters, doors, notes, errands, talking, and the words drawn on the map.

import type { Phrase } from "./phrase";

export const LAND = {
  doorNoLanding: {
    en: "No safe landing spot was found near that door. Witness the place and try again.",
    "zh-TW": "那扇門附近找不到安全落點。請先見證該地，再試一次。",
    ja: "その扉の近くに安全な到着地点がありません。土地を見届けてから、もう一度お試しください。",
  },
  // ── A story gate's card ───────────────────────────────────────────────────────────────────
  chapterOf: {
    en: "Chapter {n} of {total}",
    "zh-TW": "第 {n} 章，共 {total} 章",
    ja: "第 {n} 章／全 {total} 章",
  },
  chapterByLand: {
    en: "Chapter {n} · written by the land",
    "zh-TW": "第 {n} 章 · 由大地寫成",
    ja: "第 {n} 章 · 大地が綴った章",
  },
  cleared: { en: "Cleared — {summary}", "zh-TW": "已通關 — {summary}", ja: "クリア — {summary}" },
  gateLocked: {
    en: "This gate opens after “{title}” is cleared.",
    "zh-TW": "「{title}」通關後，這道關口才會開啟。",
    ja: "「{title}」をクリアすると、このゲートが開きます。",
  },
  chapterBefore: { en: "the chapter before", "zh-TW": "上一章", ja: "前の章" },
  todoTalk: { en: "talk to {n} more", "zh-TW": "再與 {n} 人交談", ja: "あと {n} 人と話す" },
  todoFind: { en: "open {n} more", "zh-TW": "再開啟 {n} 個", ja: "あと {n} 個開ける" },
  todoDefeat: { en: "defeat {n} more", "zh-TW": "再擊敗 {n} 個", ja: "あと {n} 体倒す" },
  revived: {
    en: "You are back at home. Take a moment to recover.",
    "zh-TW": "你回到了家，先喘口氣。",
    ja: "家に戻りました。少し休んでください。",
  },
  todoNone: {
    en: "Everything here is done.",
    "zh-TW": "這裡的事都完成了。",
    ja: "ここでやることはすべて終わりました。",
  },
  todoLeft: { en: "Still to do: {list}", "zh-TW": "尚待完成：{list}", ja: "残り：{list}" },
  chapterAround: {
    en: "{todo} — everyone and everything of this chapter is around this gate.",
    "zh-TW": "{todo} — 這一章的人與物都在這道關口附近。",
    ja: "{todo} — この章の人も物も、すべてこのゲートの周りにあります。",
  },
  chapterSide: {
    en: "A side-scrolling course: reach its far end to clear the chapter.",
    "zh-TW": "橫向捲軸關卡：抵達最遠端即可通關本章。",
    ja: "横スクロールのステージです。奥の端まで進めば章クリアです。",
  },
  chapterDungeon: {
    en: "A dungeon: find its far end to clear the chapter.",
    "zh-TW": "地下城：找到最深處即可通關本章。",
    ja: "ダンジョンです。最奥を見つければ章クリアです。",
  },
  chapterWriting: {
    en: "Writing this chapter…",
    "zh-TW": "正在撰寫這一章…",
    ja: "この章を執筆中…",
  },
  chapterWrite: {
    en: "Write this chapter now",
    "zh-TW": "現在撰寫這一章",
    ja: "今この章を書く",
  },
  begin: { en: "Begin", "zh-TW": "開始", ja: "始める" },
  enter: { en: "Enter", "zh-TW": "進入", ja: "入る" },
  playAgain: { en: "Play again", "zh-TW": "再玩一次", ja: "もう一度" },
  backToLand: { en: "Back to the land", "zh-TW": "回到大地", ja: "大地へ戻る" },

  // ── Chapter and place toasts ──────────────────────────────────────────────────────────────
  chapterClearedToast: {
    en: "Chapter cleared: {title}",
    "zh-TW": "章節通關：{title}",
    ja: "章クリア：{title}",
  },
  notChapterPerson: {
    en: "That person is not part of a chapter here.",
    "zh-TW": "這個人不屬於此處的章節。",
    ja: "その人はここの章の登場人物ではありません。",
  },
  notChapterTreasure: {
    en: "That treasure is not part of a chapter here.",
    "zh-TW": "這個寶箱不屬於此處的章節。",
    ja: "その宝箱はここの章のものではありません。",
  },
  found: { en: "Found: {items}", "zh-TW": "找到：{items}", ja: "入手：{items}" },
  empty: { en: "It is empty.", "zh-TW": "裡面是空的。", ja: "空っぽです。" },
  placeMissing: {
    en: "That place is not on this land.",
    "zh-TW": "這片大地上沒有那個關卡。",
    ja: "そのステージはこの大地にありません。",
  },
  crossed: { en: "Crossed {title}", "zh-TW": "已穿越 {title}", ja: "{title} を踏破" },

  // ── Errands ───────────────────────────────────────────────────────────────────────────────
  errand: { en: "Errand", "zh-TW": "委託", ja: "依頼" },
  errandDone: { en: "Errand · done", "zh-TW": "委託 · 已完成", ja: "依頼 · 完了" },
  errandAccept: { en: "Accept the errand", "zh-TW": "接受委託", ja: "依頼を受ける" },
  errandReport: { en: "Report back", "zh-TW": "回報", ja: "報告する" },
  errandReportReceive: {
    en: "Report back · receive {name}",
    "zh-TW": "回報 · 領取 {name}",
    ja: "報告する · {name} を受け取る",
  },
  errandSearch: {
    en: "Search {bearing} of them.",
    "zh-TW": "到他們{bearing}搜尋。",
    ja: "その人の{bearing}を探してください。",
  },
  errandNearby: { en: "nearby", "zh-TW": "附近", ja: "近く" },
  errandGoTo: {
    en: "Go to {place}.",
    "zh-TW": "前往 {place}。",
    ja: "{place} へ向かってください。",
  },
  errandPlaceNamed: {
    en: "the place they named",
    "zh-TW": "他們說的地方",
    ja: "その人が言っていた場所",
  },
  bearingHere: { en: "right where they stand", "zh-TW": "腳邊", ja: "足元" },
  bearing: {
    en: "about {n} {n|tile|tiles} {dir}",
    "zh-TW": "{dir}約 {n} 格外",
    ja: "{dir}、約 {n} マス先",
  },
  dirEast: { en: "east", "zh-TW": "東方", ja: "東" },
  dirSouthEast: { en: "south-east", "zh-TW": "東南方", ja: "南東" },
  dirSouth: { en: "south", "zh-TW": "南方", ja: "南" },
  dirSouthWest: { en: "south-west", "zh-TW": "西南方", ja: "南西" },
  dirWest: { en: "west", "zh-TW": "西方", ja: "西" },
  dirNorthWest: { en: "north-west", "zh-TW": "西北方", ja: "北西" },
  dirNorth: { en: "north", "zh-TW": "北方", ja: "北" },
  dirNorthEast: { en: "north-east", "zh-TW": "東北方", ja: "北東" },
  searchFound: {
    en: "Found it. Take it back to whoever asked.",
    "zh-TW": "找到了。把它帶回去給委託的人吧。",
    ja: "見つけました。依頼した人のところへ持って帰りましょう。",
  },
  errandArrived: {
    en: "Arrived. Go back to the one who asked ({cx}, {cz}).",
    "zh-TW": "已抵達。回去找委託人吧（{cx}, {cz}）。",
    ja: "到着しました。依頼した人のところへ戻りましょう（{cx}, {cz}）。",
  },

  // ── The door at home ──────────────────────────────────────────────────────────────────────
  door: { en: "Door", "zh-TW": "門", ja: "扉" },
  dial: { en: "Dial {n}", "zh-TW": "轉盤 {n}", ja: "ダイヤル {n}" },
  dialEmpty: { en: "— empty —", "zh-TW": "— 空 —", ja: "— 空き —" },
  go: { en: "Go", "zh-TW": "前往", ja: "行く" },
  clear: { en: "Clear", "zh-TW": "清除", ja: "外す" },
  pinPlace: {
    en: "Pin a witnessed place to dial {n}",
    "zh-TW": "把見證過的地點設定到轉盤 {n}",
    ja: "見届けた場所をダイヤル {n} に登録",
  },
  noPlacesWitnessed: {
    en: "No other place has been witnessed yet. Walk out and see somewhere first.",
    "zh-TW": "還沒見證過其他地點。先出門走走，去看看別的地方吧。",
    ja: "まだ他の場所を見届けていません。まずは外を歩いて、どこかを見てきましょう。",
  },
  doorCodes: { en: "Door codes", "zh-TW": "門牌代碼", ja: "扉コード" },
  doorCodesHint: {
    en: "Host this game from the room panel and its code becomes your door number.",
    "zh-TW": "從房間面板開設這場遊戲，它的代碼就會成為你的門牌號碼。",
    ja: "ルームパネルからこのゲームをホストすると、そのコードがあなたの扉番号になります。",
  },
  yourDoorNumber: {
    en: "Your door number: {code} — friends pin it to a dial to visit.",
    "zh-TW": "你的門牌號碼：{code} — 夥伴把它設定到轉盤上就能來拜訪。",
    ja: "あなたの扉番号：{code} — 仲間がダイヤルに登録すると訪ねて来られます。",
  },
  visitingDoor: {
    en: "Visiting through door {code}.",
    "zh-TW": "正透過門 {code} 拜訪中。",
    ja: "扉 {code} から訪問中です。",
  },
  friendDoorCode: { en: "a friend's door code", "zh-TW": "夥伴的門牌代碼", ja: "仲間の扉コード" },
  pinToDial: { en: "Pin to dial {n}", "zh-TW": "設定到轉盤 {n}", ja: "ダイヤル {n} に登録" },
  doorOf: { en: "Door {code}", "zh-TW": "門 {code}", ja: "扉 {code}" },
  keepsakes: { en: "Keepsakes you carry", "zh-TW": "你攜帶的紀念品", ja: "持っている記念品" },
  noKeepsakes: {
    en: "Nothing to set on the shelf. Residents hand keepsakes over when an errand is done.",
    "zh-TW": "沒有可以擺上架子的東西。完成委託後，居民會交給你紀念品。",
    ja: "棚に飾れる物がありません。依頼を果たすと住人が記念品をくれます。",
  },
  setOnShelf: {
    en: "Set {name} on the shelf",
    "zh-TW": "把 {name} 擺上架子",
    ja: "{name} を棚に飾る",
  },
  visitNeedsSave: {
    en: "Open a saved game of this cartridge before visiting a friend.",
    "zh-TW": "拜訪夥伴前，請先開啟這個卡帶的存檔。",
    ja: "仲間を訪ねる前に、このカートリッジのセーブを開いてください。",
  },
  visitNoProfile: {
    en: "No player profile could be made for the visit.",
    "zh-TW": "無法為這次拜訪建立玩家檔案。",
    ja: "訪問用のプレイヤープロフィールを作成できませんでした。",
  },

  // ── Notes ─────────────────────────────────────────────────────────────────────────────────
  notesTitle: {
    en: "Notes · {place} ({cx} · {cz})",
    "zh-TW": "留言 · {place}（{cx} · {cz}）",
    ja: "メモ · {place}（{cx} · {cz}）",
  },
  unwrittenLand: { en: "unwritten land", "zh-TW": "未書寫的大地", ja: "未記述の大地" },
  noNotes: {
    en: "Nobody has left a note here yet.",
    "zh-TW": "還沒有人在這裡留言。",
    ja: "ここにはまだ誰もメモを残していません。",
  },
  noteTile: { en: "tile {x},{z}", "zh-TW": "格 {x},{z}", ja: "マス {x},{z}" },
  noteVersionOf: {
    en: "another version of {author}'s note",
    "zh-TW": "{author} 留言的另一個版本",
    ja: "{author} のメモの別の版",
  },
  noteWriteVersion: {
    en: "Write a different version",
    "zh-TW": "寫下不同的版本",
    ja: "別の版を書く",
  },
  noteWritingVersion: {
    en: "Writing another version of {author}'s note",
    "zh-TW": "正在寫 {author} 留言的另一個版本",
    ja: "{author} のメモの別の版を書いています",
  },
  yourNote: { en: "your note", "zh-TW": "你的留言", ja: "あなたのメモ" },
  noteLeave: { en: "Leave the note", "zh-TW": "留下留言", ja: "メモを残す" },

  // ── Talking ───────────────────────────────────────────────────────────────────────────────
  thinking: {
    en: "{name} is thinking…",
    "zh-TW": "{name} 正在思考…",
    ja: "{name} が考えています…",
  },
  noAnswer: { en: "No answer yet.", "zh-TW": "還沒有回應。", ja: "まだ返事がありません。" },
  acting: {
    en: '{name} is acting on "{choice}"…',
    "zh-TW": "{name} 正在執行「{choice}」…",
    ja: "{name} が「{choice}」を実行しています…",
  },
  tryThatAgain: { en: "Try that again", "zh-TW": "重試這個選擇", ja: "この選択をやり直す" },
  takeAnyway: {
    en: "Take the choice anyway",
    "zh-TW": "仍然做出這個選擇",
    ja: "それでもこの選択にする",
  },
  walkAway: { en: "Walk away", "zh-TW": "離開", ja: "立ち去る" },

  // ── The wish altar ────────────────────────────────────────────────────────────────────────
  altarTitle: { en: "The Altar", "zh-TW": "祭壇", ja: "祭壇" },
  altarMaterials: {
    en: "Materials to offer ({n} selected)",
    "zh-TW": "要獻上的素材（已選 {n} 個）",
    ja: "捧げる素材（{n} 個選択中）",
  },
  altarEmpty: {
    en: "You carry nothing to offer. A wish made with empty hands tends to come back cursed.",
    "zh-TW": "你身上沒有可獻上的東西。空手許下的願望，往往會帶著詛咒回來。",
    ja: "捧げられる物を何も持っていません。手ぶらの願いは呪われて返ってきがちです。",
  },
  altarWish: { en: "Your wish", "zh-TW": "你的願望", ja: "あなたの願い" },
  altarDeciding: {
    en: "The altar is deciding…",
    "zh-TW": "祭壇正在裁決…",
    ja: "祭壇が判断しています…",
  },
  wish: { en: "Wish", "zh-TW": "許願", ja: "願う" },
  accept: { en: "Accept", "zh-TW": "收下", ja: "受け取る" },
  power: { en: "power {n}", "zh-TW": "威力 {n}", ja: "威力 {n}" },
  altarReceived: {
    en: "Received {name}",
    "zh-TW": "獲得 {name}",
    ja: "{name} を手に入れました",
  },
  altarReceivedCursed: {
    en: "Received {name} — cursed",
    "zh-TW": "獲得 {name} — 受到詛咒",
    ja: "{name} を手に入れました — 呪われています",
  },

  // ── Item kinds (the vocabulary in @shared/world ITEM_KINDS) ──────────────────────────────
  kind_sword: { en: "sword", "zh-TW": "劍", ja: "剣" },
  kind_rapier: { en: "rapier", "zh-TW": "細劍", ja: "レイピア" },
  kind_bow: { en: "bow", "zh-TW": "弓", ja: "弓" },
  kind_staff: { en: "staff", "zh-TW": "法杖", ja: "杖" },
  kind_gun: { en: "gun", "zh-TW": "槍", ja: "銃" },
  kind_tool: { en: "tool", "zh-TW": "工具", ja: "道具" },
  kind_charm: { en: "charm", "zh-TW": "護符", ja: "お守り" },
  kind_armor: { en: "armor", "zh-TW": "防具", ja: "防具" },
  kind_consumable: { en: "consumable", "zh-TW": "消耗品", ja: "消耗品" },

  // ── The land's two looks ─────────────────────────────────────────────────────────────────
  viewHd2d: {
    en: "Unwritten Land, HD-2D view",
    "zh-TW": "Unwritten Land，HD-2D 畫面",
    ja: "Unwritten Land、HD-2D 表示",
  },
  viewPixel: {
    en: "Unwritten Land, 16-bit view",
    "zh-TW": "Unwritten Land，16-bit 畫面",
    ja: "Unwritten Land、16-bit 表示",
  },
  hd2dUnavailable: {
    en: "HD-2D is unavailable ({reason}); using 16-bit.",
    "zh-TW": "無法使用 HD-2D（{reason}），改用 16-bit。",
    ja: "HD-2D を使えません（{reason}）。16-bit で表示します。",
  },
  assetsFailed: {
    en: "CC0 2D assets failed to load: {reason}",
    "zh-TW": "CC0 2D 素材載入失敗：{reason}",
    ja: "CC0 2D 素材を読み込めませんでした：{reason}",
  },
} as const satisfies Record<string, Phrase>;
