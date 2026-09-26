# Simplify: one world, one way to play together

Asked by the owner on 2026-09-26: "卡帶 世界 存檔 大陸 太複雜了 房間 門牌 ens … 統整簡化 就都共用 簡單一點
進去完全不會玩", then: F12 can bring friends in and show friends' coordinates; the share / invite
link UI shows no server (keep the function, fold it into the world system later); playing with
friends is called **加入世界** everywhere; **ENS comes first**; P2P players get a chat box.
No E2E run for this change (the owner said so); `bun run check` must still be green.

Later the same day: "還是拿一個 passkey 然後簡單一點", "70歲的阿公也要會玩的簡單", "存檔卡帶之類的太過複雜
讓他們世界更統一點". So the design target is **a 70-year-old can play it**: one obvious button per
screen, plain words, advanced things folded away; saves and cartridges are **one list of worlds**;
the player has **one passkey**. Where this section and the rest of the file disagree, this wins.

This is a player-facing change. Storage, IPC, the history, the service, continents' protocol and
every Rule in CLAUDE.md stay as they are. Code that loses its last UI path stays in place unless a
work package below says to remove it.

## Words the player sees (zh-TW / en / ja)

| Concept (code) | Player word | Replaces |
| --- | --- | --- |
| a save / instance (+ its cartridge) | 世界 / world / ワールド; the list is **我的世界 / My worlds / マイワールド** | 存檔 (as a section), 卡帶, 存檔世界 |
| continent join, invite link, `.world` import, move link | **加入世界 / Join a world / ワールドに参加** | 大陸, 房間, 世界檔案, 穿過這扇門 |
| `openMyDoor` (+ service invites) | **邀請朋友 / Invite friends / 友だちを招待** | 向夥伴敞開我的門, 主持, 共享到 {service} |
| door number (`plateOf`, 6 symbols) | **加入碼 / join code / 参加コード** | 門牌, 門牌代碼, 加入代碼, door number |
| peer / member | **朋友 / friend / 友だち** | 夥伴 |
| a save's / world's ENS name | **ENS 名稱**, shown before any code | — |

- 卡帶 / cartridge, 大陸 / continent, 房間 / room and 門牌 / door number no longer appear in the
  library, the HUD, the door panel or F12. A version is 版本 / version.
- A service address (`ws://…`, a host name) is never shown in the door, Join a world, badges or
  F12. Settings → 共享世界 keeps its list (that is configuration).
- AppError `message` / `hint` stay English at the source (Rule 10), but a hint that names a menu path
  that no longer exists ("Worlds → Saves", "Worlds → Continent", "Worlds → Cartridges",
  "Console → Multiplayer", "World files") is rewritten to the new path, and its translations too.

## The Worlds screen (library)

Nav, in order: **我的世界 · 加入世界 · 市場** (+ 封存 only when legacy worlds exist).

1. **我的世界 / My worlds** — ONE list; each row is a world's name (its ENS name first) and ONE button:
   - first row **開始新的冒險**: the built-in world, New game (random seed, UI language; seed and
     language folded under that row's 更多);
   - every save → **繼續**;
   - every installed world with no save yet (newest version per cartridge id) → **開始**.
   Everything else is behind a per-row **更多**: 邀請朋友 (opens the world, then `openMyDoor`), the ENS
   name, 匯出 .world, 備份, 升級, older versions, drafts, remix, `.cartridge` export, launch to market.
   還原備份 and 匯入 `.cartridge` sit in a small 更多 under the list. "用 ENS 名稱開啟" moves to Join
   a world. The "move to another world service" form is not shown. Rows never say 存檔 / 卡帶 /
   version numbers / seed.
3. **加入世界 / Join a world** — one field: "朋友的 ENS 名稱、加入碼或邀請連結". What was typed decides:
   - an ENS name (`looksLikeEnsName`) is looked up **first**: a save's name → its join code → the
     continent path below; a cartridge's name → "開始玩這個世界" (what CartridgeName did);
   - a 6-symbol join code → bring a world and walk through (`joinContinentByCode`). The world you
     bring is the newest one in My worlds, shown as "帶著：{name}（更換）"; with none, a new game on
     the built-in world is started first (random seed, UI language);
   - `unmapped://join?…` → the invite preview and join (no service line in the preview);
   - `unmapped://world?…` → follow the move (as today).
   Below: **從 .world 檔加入** (was World files → import). No other section joins anything.
4. **市場** and **封存** unchanged.

## Play

- **Goal first.** The player card leads with the world's name (ENS name first) and a **目標 / Goal**
  block: the next chapter's title and, in plain words, what to do next ("走到入口，按 E 開始",
  "再和 2 個人說話 · 再打開 1 個", "正在寫這一章…"). The compass arrow already points to the gate.
- **Less machinery.** Hidden from the HUD (still in F12 → 推論): provider kind, model id, probe detail,
  ms, FPS, token / cache counts and the 用量 button. The HUD keeps one plain model line only when
  it matters ("還沒設定模型" / "模型離線", with where to fix it: 設定 → 模型). Hidden from the player
  card: seed, "大地 cx · cz", "因果 N 筆", and the floor quest line on open land.
- **How to play.** The first time Play opens on this device (a device preference in localStorage,
  Rule 2), a short card: move (WASD / stick), E to talk / open, follow the arrow to the next chapter,
  and "想和朋友一起玩：按 F12 → 朋友，或走到家門按 E". Closing it keeps it closed; a **說明 / Help**
  dock button opens it again.
- **The door (門)** reads top to bottom: **邀請朋友** (ENS name first, then the join code, 開放 /
  已開放 · N 位朋友 / 關閉, copy), **加入世界** (the same one field, walk through), then 快速移動 (the
  dials), then 進階 (folded: who may come in, invite links, people, the chain, records). An invite
  link is created without naming a service: "建立邀請連結" attaches to the first service in
  Settings; with none listed the invite-link part is simply not offered.

## F12 → 朋友 / Friends (the first tab; replaces 多人連線 / the room)

- **拉朋友進來**: the same invite block as the door (ENS name, join code, open / close, copy; an
  invite link without a service when the world is attached).
- **加入世界**: the same one field.
- **在線的朋友**: every other player drawn on this land (`sampleRemotePlayers`: continent awareness
  and shared-world presence) — name, tile coordinates `x, z`, the land they stand on (its owner),
  and distance in tiles from you, refreshed a few times a second. Empty: "還沒有朋友在線".
- The room panel is no longer reachable (net/room.ts stays for now).

## Chat (P2P, on a continent)

- A continent message `{ type: "chat", text }` (`@shared/continentHello`). Text is trimmed, control
  characters removed, at most 200 characters; anything else is dropped. It is sent only to verified
  peers and accepted only from them (the gate), at most 5 messages per peer per 5 s (excess dropped).
  The sender's name is the one its awareness state carries for its world, never the message's.
- Messages live in memory only (a small store, at most 50, cleared on leaving) — never saved,
  never in history, never on the continent's Y.Doc.
- In Play, a chat box bottom-left: the last lines fade after a while; **Enter** opens the input
  (movement is locked while typing), Enter sends, Esc closes. Shown only on a continent; "Enter 聊天"
  appears once a friend is connected. A shared world's presence (service) gets chat later.

## One passkey, and Settings

- Settings shows 語言 · 模型 · **你的 passkey**; 帳號, 方案, 圖片, 信令伺服器, 共享世界 and build info sit
  under one folded **進階設定**.
- 你的 passkey is the market passkey (`identity/passkeySign.ts`): it names worlds and players on ENS
  and confirms market actions. One button creates or links it, choosing the path itself (the system
  browser for Touch ID on this app; a security key in the window is folded away). The player's ENS
  name sits under it. Without a configured market nothing about passkeys is shown.
- The Data Key unlock (`UnlockPanel`) leaves Settings: it only serves F12 → 世界's encrypted legacy
  export, so it is offered there, and reuses the in-app passkey when there is one.
- The gateway account (帳號) keeps its device key; it is folded, not merged.

## Work packages (parallel, disjoint files)

| WP | Owns | i18n tables |
| --- | --- | --- |
| library | `app/library/*`, `app/title/{CartridgesPanel,CartridgeName,ContinentPanel,ContinentSaveName}.tsx`, `app/market/EnsNames.tsx` | `library.ts`, `title.ts`, `bundle.ts`, `world.ts` blocks "Badges" + "Worlds → Join a world" only |
| play | `app/Hud.tsx`, `app/hud/*` (not `UsagePanel.tsx`), `app/land/{WorldDoorSection,DoorPeople,DoorChain,WorldRecordsSection}.tsx`, `works/EpisodePrefetch.tsx`, new `app/hud/HowToPlay.tsx` | `hud.ts`, `hud-panels.ts`, `hud-ens.ts`, `landHistory.ts`, `world.ts` (all door blocks + Settings block) |
| friends | `app/Console.tsx`, `app/console/*`, `app/land/{DoorPanel,ContinentSection,ForeignDoorCard,useFriendDoor}.tsx/.ts`, `app/PlayScreen.tsx`, `app/hotkeys.ts`, `net/*`, `@shared/continentHello.ts`, new `app/friends/*`, new chat store in `state/`, `tests/net/*` | `console.ts`, `continent.ts`, `together.ts`, `land.ts`, `errors-net.ts` |
| passkey | `app/title/{SystemPanel,PasskeyPanel}.tsx`, `identity/UnlockPanel.tsx`, `app/console/WorldTab.tsx`, `app/market/*` (not `EnsNames.tsx`) | `identity.ts`, `market.ts`, `account.ts` |
| words | every other `i18n/strings/*.ts` (errors-*, create*, market, identity, works, mobile, …) and English hints in `src/main`, `src/shared`, `src/dsl` that name removed menu paths | the rest |

- The friends WP writes the shared in-play blocks (`app/friends/InviteFriends.tsx`,
  `app/friends/JoinWorldField.tsx`) and places them in both the door (DoorPanel) and F12. The library
  WP writes its own Join a world panel (it runs before Play, where no continent is open).
- The HUD's 說明 button and the HowToPlay card belong to play; the chat box (friends) mounts from
  PlayScreen, so the play WP never edits PlayScreen and the friends WP never edits `Hud.tsx`.
- A key used by a file you do not own is never renamed or deleted; change its value only.
- `hud/UsagePanel.tsx` stays where it is: play stops rendering its button, friends renders the panel
  in F12 → 推論.
