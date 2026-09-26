# Lineage market — demo runbook

The chain part of UNMAPPED: one ENSv2 name tree under `unmapped.eth` (cartridges, their remixes and
players' saves), a Uniswap Continuous Clearing Auction that launches a named world, and a v4 hook that
pays royalties up the tree. Players use a passkey; they never connect a wallet, hold ETH, or trust a
key inside the app — a gas station pays. Design and diagrams: `docs/demo/architecture.html`
(published as https://claude.ai/artifact/BYHoYybqUPQiDWwqHi5RmJ). The general demo scripts (world
creation, witnessing, continent) are in `docs/demo-flow/`.

## What is live on Sepolia (v2, 2026-09-26)

| | |
| --- | --- |
| Parent name | `unmapped.eth` (registered to the deploy key until 2027-09-25) |
| LineageRegistry | `0xda8051e3e2855C125AAd6050f97Ea64cf203dAf6` (block 11,781,460) |
| LineageHook / LineageRouter | `0x59FA49D974B4564Eade17EDDC4a3CCf8D819a044` / `0x2201fBDB7f17BD687d8965B9Dc2Ae000689039BE` |
| PasskeyAccountFactory | `0x7B8b8E17590cC85c315d459feD8fC9384C2c9bE5` |
| First world | `aether-land.unmapped.eth`: cartridge `aether-land` 1.3.0, `sha256:57f17e0d…e81b`; token `0xA801C5067a0649c640AF21fa2334Cf822bb8dBb6`; auction `0xAB2Df6CA3f3972b22D4980897aD12cd401a56203` ended at block 11,781,522 and graduated; v4 pool open |
| Other names | `moss-hollow.aether-land.unmapped.eth` (a remix cartridge, not launched); saves `kidney-run.…` and `first-light.aether-land.unmapped.eth`; from milestone-ens-in-game: `misty-harbor.unmapped.eth` (launched from the app; its 100-block auction ended with no bid), `lantern-quay.aether-land.unmapped.eth` (a remix launched from the app, priced in AETHERLAND; its 100-block auction also ended with no bid) and the save `my-save.misty-harbor.unmapped.eth` (door GEC2AA); from milestone-ens-players: `players.unmapped.eth`, the player name `kidney.players.unmapped.eth` and the save `kidney-mui0pchb.aether-land.unmapped.eth` (door TRLVDV). All ten re-read at block 11,785,145 (`docs/e2e/milestone-chain-audit/`). Every label here is taken: pick new ones on stage. Only the `aether-land` names lead back to bytes the repo ships; `moss-hollow`, `misty-harbor` and `lantern-quay` were published only inside E2E data |
| Gas station | https://unmapped-relay.gimmychang.workers.dev (Cloudflare Worker); its key `0xB62C…Fd3D` pays |
| Live web view | https://unmapped-auction.gimmychang.workers.dev/#aether-land (read-only; `bun run web:deploy`). Without `#aether-land` it opens the newest launch, lantern-quay, whose auction ended with no bid |

## Before the demo

1. The station must hold its key once: `bunx wrangler@4 secret put RELAYER_KEY -c web/lineage-relay/wrangler.jsonc < .cache/relay/relayer.key`.
   Check `curl https://unmapped-relay.gimmychang.workers.dev/status` shows `relayer: 0xB62C…` and a
   balance (keep it above 0.02 Sepolia ETH; 5 player actions cost about 0.0018, but an in-app launch
   alone is 5.13–5.15M gas, 0.0054–0.0056 ETH at ~1 gwei and up to ~0.026 at the station's 5-gwei
   launch cap). At block 11,785,145 it held 0.0318 ETH; after a top-up it held 0.4518 ETH at block
   11,785,984: enough for a rehearsal plus the live ENS and Uniswap scripts many times over.
2. On the demo machine, `.env` needs the `UNWRITTEN_LINEAGE_*` lines (addresses above) and
   `UNWRITTEN_LINEAGE_RELAY=https://unmapped-relay.gimmychang.workers.dev`. It needs no private key for
   the app; `UNWRITTEN_PRIVATE_KEY` is only for the operator commands below.
3. Run the app (`bun run dev`). Passkeys need the `http://localhost` origin.
4. Open the live web view on a second screen; it refreshes every block (~12 s).
5. Decide what is live at demo time:
   - **Bidding live.** Launch a remix just before you present (about 10 minutes of auction; an
     in-app launch is 100 blocks, about 20 minutes). The operator key pays for these commands
     (0.0074 ETH at block 11,785,145, about one ~5.9M-gas launch at 1 gwei, not its seed bids):
     `bun run lineage:demo launch <label> --parent 0xA801C5067a0649c640AF21fa2334Cf822bb8dBb6 --blocks 50`.
     Its bids are in AETHERLAND, so buy some in the `aether-land` pool first. To show competition,
     `bun run lineage:demo seed-bids <token> --usdc 10,8,6` adds software-passkey bidders.
   - **Trading and names only.** `aether-land` has graduated, so a buy, royalties, naming a cartridge
     and recording a save can be shown at any time.
6. `bun run lineage:demo status` lists every world with its phase, price, bids and pool.
7. Player names hang under `players.unmapped.eth`, registered once on 2026-09-26 (`bun run lineage:demo
   players`, tx `0x8f88cbdd…87b7`). The deployed station runs this build's rules (redeployed the same
   day), so in-app launches go through it; after changing `src/relay`, run `bun run relay:deploy` again.

## Click path in the app (no wallet, no key)

1. **Worlds → 市場 (Market) → 用 Touch ID（在瀏覽器開啟）.** The system browser opens a localhost
   page: **Create a passkey** (Touch ID once) or **Use my existing passkey** (twice). The account
   address appears ("created on chain with your first action").
2. **領 1,000 測試 USDC.** The gas station pays.
3. **Pick a world → 用 passkey 出價 / 用 passkey 買入.** The browser page shows exactly what is signed.
   A buy runs through every ancestor; each hop pays 1% up the tree (50% the world, 30% its parent,
   20% its grandparent).
4. **After an auction's last block: 結算拍賣.** Every bid exits and claims, then the pool opens.
5. **發放分潤.** Pays the royalties a world earned to whoever holds its ENS name.
6. **Worlds → 卡帶 (Cartridges).** Each revision shows its name: `aether-land.unmapped.eth · 指向這個版本`,
   another holder's older name, or `尚未登記` with **用 passkey 登記名稱** (a remix is named under its
   parent). **用 ENS 名稱開啟** follows any name back to its revision — or a save's checkpoint.
7. **Worlds → 存檔 (Saves) → 這個存檔的 ENS 名稱.** Pick a label → **用 passkey 記錄**: the save becomes
   `<label>.aether-land.unmapped.eth`, held by the player's passkey account, recording only a hash, the
   exact version and a progress line. After playing on, **更新到目前進度**. Export the backup, restore it
   on another machine: that machine finds the name by the save's hash and says it records this save.
8. **In the game.** Right after **建立並開始玩**, the "你的世界已經發布" panel names the new world (pick a
   label — a Chinese name's own label is unreadable) and offers **上架到市場**. In Play the player card
   shows the save's (else the world's) name; clearing a chapter brings a card that records the run or
   moves its name to the new checkpoint. **Worlds → 卡帶 → a revision you hold → 上架到市場** launches it
   (a remix only after its parent, priced in the parent's token).
9. **By name on the continent.** A save's name carries its door number, so a friend types
   `<save>.<cartridge>.unmapped.eth` in Worlds → 大陸 (or the door at home) instead of the six symbols.
   **Worlds → 市場 → your name** claims `<you>.players.unmapped.eth` (用 passkey 認領); 設為我的玩家名稱 makes it what
   others see.

A USB security key can sign inside the app: **在 app 內使用安全金鑰**.

## Why the browser step

Electron cannot show Touch ID for WebAuthn in a development build. It needs
`app.configureWebAuthn({ touchID })` plus a keychain-access-groups entitlement in a signed build;
without them `navigator.credentials` waits forever. So the app serves a page on
`http://localhost:47821` (127.0.0.1 only) and opens it in the system browser, where Touch ID works.
The page signs the digest main holds for the prepared batch; main hands it to the gas station.

## Operator commands

```bash
bun run lineage:market --dry-run              # whole market + names + saves simulated on Sepolia (no key)
bun run lineage:demo status [world]           # worlds, auctions, pools, royalties
bun run lineage:demo launch <label> [--parent 0x…] [--blocks 50|100|250] [--floor 1/100] [--required 10]
bun run lineage:demo seed-bids <world> [--usdc 40,30,20]
bun run lineage:demo settle <world>           # the same as 結算拍賣, paid by the operator key
bun run lineage:demo players                  # once: players.unmapped.eth, where player names hang
bun run relay:key                             # the station's key in .cache/relay/ (prints only its address)
bun run relay:dev                             # the station on http://localhost:8790
bun run relay:deploy                          # ship the station to Cloudflare
bun run web:deploy                            # redeploy the live web view
```

Auction length must divide 10,000,000 blocks: 50 blocks ≈ 10 min, 250 blocks ≈ 50 min.

## Measured (v2)

| Step | Gas | Notes |
| --- | --- | --- |
| Deploy registry / hook / router | 4,939,593 / 1,351,265 / 1,132,625 | factory reused |
| Launch `aether-land` 1.3.0 | 5,872,109 | tx `0xe8637a01…10c2` |
| Seed bids through passkey accounts | 356,883 – 503,345 | 4,000 / 3,000 / 2,000 USDC |
| App bid, browser passkey, via the station | — | 25 USDC, tx `0x96ccc5bc…14d4` |
| Settle: 4 exits + 4 claims, then graduate | 67,428 – 186,917; 650,770 | graduate `0xac7221df…3f63` |
| Faucet / buy (deploys the account) / royalties, station's own key | 51,369 / 373,664 / 67,203 | 10 USDC → 528.45 AETHERLAND |
| Name a remix cartridge | — | `moss-hollow.aether-land…`, tx `0x866a8c93…f9e9` |
| Record a save / update it | 901,746 / 274,808 | `first-light.aether-land…` |

The auction closed at 0.018636 USDC (floor 0.009999, +86%) and raised 9,025 USDC from four bids. E2E
records: `docs/e2e/milestone-lineage-relay/`, `docs/e2e/milestone-lineage-names/` (and the v1 run in
`milestone-lineage-demo/`).

## Known limits

- The station pays only for the market's own contracts and kinds; anything else is refused before it
  is sent. Its key is a Cloudflare secret: a person adds and rotates it.
- The faucet stops once an account holds 2,000 test USDC.
- The app bids with a ceiling of at least 5× the floor, so a bid settles with a plain exit. A bid
  outbid below the final price would need CCA's partial exit, which the app does not do.
- The full-range LP position is locked in the registry, and nothing collects its fees yet.
- Account abstraction (ERC-4337 with a paymaster) is the planned next step; today the station calls
  PasskeyAccountFactory directly.
