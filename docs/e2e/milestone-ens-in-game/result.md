# ENS in the game — E2E on Sepolia (2026-09-26)

Before this run ENS lived only in menus. This run drives the new paths in the real app, keyless,
through this build's gas station (`bun run relay:dev`, the station's own key `0xB62C…Fd3D`): a world
named right after Create (with a Chinese name), launched from the app, its name on the HUD, a
chapter clear that records the run with its door number, a remix from the Remix button named under
its parent and launched in the parent's token, a friend walking onto the continent by the save's
ENS name, and the two old ENS paths gone. Replay: `run.json`. Registry v2
`0xda8051e3e2855C125AAd6050f97Ea64cf203dAf6` (unchanged); passkey = the CDP virtual authenticator with
the credential of account `0xfBaB…8537` from milestone-lineage-relay.

## What was checked, and what we saw

| # | Step | Observed | Evidence |
| --- | --- | --- | --- |
| 1 | Worlds → Market, link the passkey (browser page, "Use my existing passkey") | `帳戶 0xfBaB…8537`, and the player-name block says `這個部署還沒有開放玩家名稱。` (the `players` directory is not registered yet: a calm line, not an error) | 02–03 |
| 2 | Create 霧之港 (words + name, no look picture, 4 chapters), 建立並開始玩 | New "built" panel instead of dropping straight into Play: `你的世界已經發布 · 霧之港 · 進入世界`, and `它的 ENS 名稱（可略過）` | 04–05 |
| 3 | The label a Chinese name gets | id `xn--9iq609e681a-3fec58` → label **`xn-9iq609e681a-3fec58.unmapped.eth`** (the punycode `--` collapses to `-`, so it no longer decodes: unreadable). The panel says so: `這個世界的名稱不是拉丁字母，由 id 轉出來的標籤很難讀。請改成好讀的英文標籤。` | 06 |
| 4 | Type `misty-harbor`, 用 passkey 登記名稱 | `ENS misty-harbor.unmapped.eth · 指向這個版本`; the name is found by cartridge id from then on | `0x96732d92…202d` 921,165 gas; 07–08 |
| 5 | 上架到市場 on the same panel (terms shown first: 1,000,000 tokens · half to the pool · ~20 min / 100 blocks · floor 0.01 USDC · graduates after 10 USDC) | `已在市場上——到「世界 → 市場」查看。` — `LineageRegistry.launch` by the holder, paid by the station alone in its batch | `0x56f32d4c…89fa` **5,126,613 gas**, 0.00538 ETH; 09 |
| 6 | 進入世界 | HUD player card: `霧之港` + chip `misty-harbor.unmapped.eth`, title `這個世界的 ENS 名稱：misty-harbor.unmapped.eth。這趟旅程還沒有自己的名稱。` | 10 |
| 7 | Clear chapter 1 (先問外港: met 阿霧 · 阿潮 · 阿鹽, found 2) with the gamepad run's helpers | card `章節完成 · ENS — 要把這趟旅程記錄到 ENS，名稱為 my-save.misty-harbor.unmapped.eth 嗎？ 目前的進度：1 chapter cleared · 8 deeds` + 用 passkey 記錄 / 稍後再說 | 11–12 |
| 8 | 用 passkey 記錄 | chip → `這趟旅程的 ENS 名稱：my-save.misty-harbor.unmapped.eth——記錄的是 1 chapter cleared · 9 deeds。` Lookup: `progress 1 chapter cleared · 9 deeds`, **`door GEC2AA`** = `plateOf(instance-muhutk0b)` (recordSave + describe in one batch) | `0x010811ca…892b` 945,749 gas; 13 |
| 9 | Worlds → Cartridges → aether-land 1.3.0 → 改編 (`lantern-quay`, 燈籠碼頭) → 驗證並預覽 | **Failed:** `✕ Offline completion route — origin.oui is terminal but has no ending gate.`, 發布 refused. The workspace check never learned what publishing already allows (open land has no finale) | 16 |
| 10 | Fix `workspaces/validation.ts`, restart, validate, publish 1.0.0 | all checks ✓; published. **Failed next:** playing it says `這張卡帶沒有世界設定集，所以它的大地不會被寫出來` — publishing a workspace dropped the base's bible, story and baked dialogues | 17–18 |
| 11 | Fix `publishWorkspace` (carry them, as a mod revision does), publish 1.0.1 | `lantern-quay/1.0.1/bible/{core.md, style.md, story.json}` present (1.0.0 had none) | — |
| 12 | Select lantern-quay 1.0.1 | `ENS lantern-quay.aether-land.unmapped.eth · 尚未登記` — under its parent's name, found by the parent's cartridge id | 19 |
| 13 | 用 passkey 登記名稱 (the app had lost its link after a forced restart and asked again) | `指向這個版本`; the launch terms then read `底價每枚 0.1 枚 aether-land.unmapped.eth 代幣 · 募得 10 枚 … 後轉入交易池` — **only after re-opening the row**: the line had re-read with the pre-link (empty) key. Fixed afterwards (below) | `0xc89b67b4…b9f5` 974,388 gas; 20–21 |
| 14 | 上架到市場 | `已在市場上`; Market lists three worlds: `aether-land.unmapped.eth 交易中 · 0.019 USDC/AETHERLAND`, `misty-harbor.unmapped.eth 競標已結束 · 0.01 USDC/MISTYHARBOR` (100 blocks passed with no bid), `lantern-quay.aether-land.unmapped.eth 競標中 · 0.1 AETHERLAND/LANTERNQUAY` | `0x2157511e…9df3` **5,153,739 gas**, 0.00556 ETH; 22–23 |
| 15 | A: Worlds → Continent → 霧之港 | `這個世界的門牌：GEC2AA` and `夥伴也可以用名稱走進來：my-save.misty-harbor.unmapped.eth`; 向夥伴敞開我的門 → `大陸 GEC2AA · 已連線 · 0 位夥伴` | 24 |
| 16 | B (fresh, no passkey, no station): New Game, Continent, type `my-save.misty-harbor.unmapped.eth`, 穿過這扇門 | `150 ms 正在查詢名稱…` → `720 ms 大陸 GEC2AA · 連線中…` → `820 ms 已連線 · 0 位夥伴` → **`1,610 ms 已連線 · 1 位夥伴`**; A's roster `["friend-b"]`, B's `["player-WUNM"]` | 25–26 |
| 17 | B: resolveDoor for four names | `first-light.aether-land…` → `continent-name-no-door` (recorded before doors); `nobody-here-7x…` → `continent-name-not-found`; `misty-harbor.unmapped.eth` → `continent-name-not-save`; `my-save.misty-harbor…` → `GEC2AA` | — |
| 18 | A: clear chapter 2 of 霧之港 (找潮紙: met 3, found 1) | card `章節完成——要把 my-save.misty-harbor.unmapped.eth 更新到目前的進度嗎？ 目前的進度：2 chapters cleared · 17 deeds · ENS 上目前記錄：1 chapter cleared · 9 deeds` + 用 passkey 更新 | 29 |
| 19 | Before it was clicked, the dev renderer reloaded to the title (another session's edits to the working tree hot-reload a `bun run dev` app) and the card's state was gone; back in Play the chip read `my-save.misty-harbor.unmapped.eth · 較早的進度`. The same `name-save` action from Worlds → Saves → 更新到目前進度 | `記錄的就是這個存檔目前的樣子。 目前：2 chapters cleared · 17 deeds · 記著門牌 GEC2AA` — updateSave only (the door was already on the name) | `0x56044448…9524` 277,632 gas; 30 |
| 20 | Old paths | `bun run ens:setup` → `Script not found "ens:setup"`; F12 → 世界 tab ends at 匯出/匯入 .seed with no ENS lookup | 27 |

The station paid 6 transactions, 0.01419 Sepolia ETH (0.04816 → about 0.0340).

## Found and fixed during the run

- **A new run looked like the player's old one** (15): with no name matching the save's hash, the
  app fell back to "the newest save name this passkey holds under the cartridge", so a brand-new
  aether-land run showed `first-light.aether-land.unmapped.eth · 較早的進度` and would have offered to
  overwrite it. Now the fallback also needs the name's door to be this save's door; after the fix
  the same run reads `run-muhv6dr7.aether-land.unmapped.eth 還沒有人使用` with `名稱會記上這個存檔的門牌（DPRD6R）`.
- **Default save label `my-save`** for a save with a CJK name (step 7): every such run would collide.
  Now `<player name or "run">-<save id tail>` (seen above as `run-muhv6dr7`).
- Remix validation and the lost bible (steps 9–11), and the stale key after a first link (step 13):
  the line now re-reads through the newest `read` after any signature. The punycode hint now shows
  only while the typed label still starts with `xn-`.

## Not verified here

- **Player names** (`<label>.players.unmapped.eth`): the operator transaction that registers the
  `players.unmapped.eth` directory (`bun run lineage:demo players`, 869,437 + 166,208 gas simulated)
  was not sent in this run, so claiming, "Use as my player name" and a continent showing ENS player
  names are unverified.
- The chapter card's **update** button itself (19: the card showed, but a reload took it away before
  the click; the same action went through Saves). The stale-key fix and the punycode-hint fix were
  not re-driven in the app.
- The **deployed** station still runs the previous rules; until `bun run relay:deploy`, an in-app
  launch through `https://unmapped-relay.gimmychang.workers.dev` is refused as "not part of the
  lineage market". The launch rules' refusals are covered by `tests/relay/sponsor.test.ts`.
- Real Touch ID (virtual authenticator), and the web view's new `players` tag.
