# Player names, the deployed station and the chapter card — E2E on Sepolia (2026-09-26)

What milestone-ens-in-game left unverified, driven in the real app against the **deployed** gas
station (https://unmapped-relay.gimmychang.workers.dev, not a local one): the operator's one step for
player names, a player claiming `<label>.players.unmapped.eth` with a passkey, the name taking the
place of `0x…` in the Market and on a continent seen by a second app, the web view's `players` tag,
and the chapter card's **record** and then **update** buttons clicked in Play. Replay: `run.json`.
Registry v2 `0xda8051e3e2855C125AAd6050f97Ea64cf203dAf6` (unchanged); passkey = the CDP virtual
authenticator with the credential of account `0xfBaB…8537`.

## What was checked, and what we saw

| # | Step | Observed | Evidence |
| --- | --- | --- | --- |
| 1 | `bun run relay:deploy` | the Worker now carries this build's rules (`MAX_LAUNCH_FEE_GWEI` 5); `/status` kept `relayer 0xB62C…Fd3D` | version `f539261a…` |
| 2 | A forged launch through the deployed station (curl: one `LineageRegistry.launch` call, random key, forged WebAuthn) | `relay-reverted` — the policy lets a launch through and the simulation refuses it; nothing sent. The previous Worker answered "not part of the lineage market" | — |
| 3 | `bun run lineage:demo players` (operator key) | `players.unmapped.eth` registered and described | `0x8f88cbdd…87b7` 869,437 gas; `0xd703a4eb…f309` 166,208 |
| 4 | App A (fresh, no key, deployed station): Worlds → 市場, link the passkey | **Failed first:** `錯誤 · market-unreachable — … eth_getLogs … Rate limit exceeded` from publicnode. A refresh sent three log queries per world at once (nine with three worlds on the market). | log |
| 5 | Fix `main/chain/market.ts`: the account's bids, exits and claims read in one query per event across every auction, and the client falls through publicnode → Tenderly → dRPC with backoff; restart | the market loads: `帳戶 0xfBaB…8537`, the player-name block `在 players.unmapped.eth 底下認領你自己的名稱…`, default `player-cll9.players.unmapped.eth 還沒有人使用。` | 02 |
| 6 | Type `kidney`, 用 passkey 認領 → the page shows `認領 kidney.players.unmapped.eth 作為你的玩家名稱` → approve | the account heading reads `kidney.players.unmapped.eth`; `aether.playerName` = `kidney.players.unmapped.eth` | `0x1ed6a310…5157` 854,715 gas; 03–04 |
| 7 | Market → misty-harbor | `名字持有人 kidney.players.unmapped.eth (0xfBaB…8537)`; aether-land (operator, no player name) still `0x8eEC…51C3` | 05 |
| 8 | Device name set back to `player-cll9`, reopen Market | `這台裝置目前以「player-cll9」遊玩。` + 設為我的玩家名稱 → clicked → the offer goes, the device name is `kidney.players.unmapped.eth` again | 06–07 |
| 9 | A: New Game, Worlds → 大陸 → 向夥伴敞開我的門 | `大陸 TRLVDV · 已連線 · 0 位夥伴` | 08–09 |
| 10 | B (fresh, no passkey, no station, device name `friend-b`): New Game, type `TRLVDV`, 穿過這扇門 | `639 ms 連線中…` → `739 ms 已連線 · 0 位夥伴` → `2,641 ms 已連線 · 1 位夥伴` | 10 |
| 11 | Who each app sees (`getRemotePlayers`, continent worlds' owners) | B: `["kidney.players.unmapped.eth"]` both as the player and as the owner of A's land; A: `["friend-b"]` | — |
| 12 | Live web view, Family tree | `players.unmapped.eth PLAYER NAMES` → `kidney.players.unmapped.eth PLAYER`, beside the worlds, the remix cartridge and the saves | 11 |
| 13 | A: resume, clear chapter 1 of aether-land 1.3.0 (met toki · mika · sadao, found keepsake) | after a few seconds the card: `要把這趟旅程記錄到 ENS，名稱為 kidney-mui0pchb.aether-land.unmapped.eth 嗎？ 目前的進度：1 chapter cleared · 6 deeds` (the default label now starts from the player name) | 12 |
| 14 | 用 passkey 記錄 (the card's own button) | HUD: `這趟旅程的 ENS 名稱：kidney-mui0pchb.aether-land.unmapped.eth——記錄的是 1 chapter cleared · 7 deeds。` | `0xd7b54a49…4d9f` 947,864 gas; 13 |
| 15 | Clear chapter 2 (met haru · mori · ken, found three) | card: `更新到目前的進度嗎？ 目前的進度：2 chapters cleared · 17 deeds · ENS 上目前記錄：1 chapter cleared · 7 deeds`, buttons `用 passkey 更新 | 稍後再說` | 14 |
| 16 | **用 passkey 更新** (the card's own button this time) | card closes; HUD: `…記錄的是 2 chapters cleared · 17 deeds。` | `0x12c1c65a…4e7c` 277,620 gas; 15 |

The deployed station paid all three player transactions (1,080,199 gas in total at the fee of the
moment); it holds 0.0318 Sepolia ETH after them. No dev reload interrupted the chapter runs this time.

## Not verified here

- A real launch through the deployed station (only the forged probe above; real launches ran through
  the same code locally in milestone-ens-in-game, 5.1M gas each).
- Joining by a save's ENS name was not repeated (milestone-ens-in-game, step 16); this run joined by
  the door number and looked at names.
- Real Touch ID: the CDP virtual authenticator stood in for it.
