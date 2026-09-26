# Lineage market in the app — E2E on Sepolia (2026-09-26)

The whole life of the first world, `aether-land.unmapped.eth`, driven through the real app and
real Sepolia transactions: a passkey account with no wallet, the faucet, bids signed in the app and
in the system browser, settlement, the Uniswap v4 pool, a passkey buy across the lineage hook, and
the royalty payout to the ENS name holder. Replay: `run.json` (each `runs` key is one
`scripts/cdp-drive.ts` session; `$authenticatorId` is filled from the previous reply).

Contracts: LineageRegistry `0x439F…5237`, LineageHook `0x0f11…6044`, LineageRouter `0x57C5…609C`,
PasskeyAccountFactory `0x7B8b…9bE5`. World token `0x5e8e39c25cEa96F3ED4d6B03c1fc17213453ae7f`,
auction (CCA) `0x828fC65d333712474fb249220aBD1EBc04B3b1fC`, blocks 11,780,833 – 11,781,083.

## What was checked, and what we saw

| # | Step | Observed | Evidence |
| --- | --- | --- | --- |
| 1 | Launch (operator, `lineage:demo launch`) | name, token, auction and records in one tx | `0x6e74dba6…6a6b`, 5,766,964 gas |
| 2 | Three seed bidders (software passkeys, `seed-bids`) | 4,000 / 3,000 / 2,000 USDC, each the account's first action (deploys it) | `0x050235c1…0f96` 624,637 gas; `0x389cb030…494b` 510,364; `0xc59c39f6…9aaf` 478,187 |
| 3 | App: Worlds → 市場 → 使用我的 passkey (in-app, virtual authenticator) | account `0x499e…cBD1` shown before it exists on chain | 03 |
| 4 | App: 領 1,000 測試 USDC | balance 1,000 → bid 50 → 950 | 04–06 |
| 5 | App: bid 50 USDC, in-app passkey | bid #3 進行中 | `0x892bac1e…9e6e`; 06 |
| 6 | App: 用 Touch ID（在瀏覽器開啟）→ page "Create a passkey" | linked account `0x0E50…5c07` | 07–10 |
| 7 | App: bid 20 USDC → page shows "在 aether-land.unmapped.eth 出價 20 USDC" → Approve | bid #4 進行中, page says Sent | `0xad4755f8…acc3`; 11–13 |
| 8 | After block 11,781,083: app shows 競標已結束, clearing 0.018 | 5 bids | 14 |
| 9 | App: 結算拍賣 (no signature; relayer only) | 5 × `exitBid` + 5 × `claimTokens`, then `graduate`; phase → 交易中, pool 0.018 | 10 txs 67,428–186,917 gas; graduate `0x218ae77b…f6bb` 667,957 gas; 15–16 |
| 10 | App: 花費 10 USDC → 用 passkey 買入 → page "用 10 USDC 買入 aether-land.unmapped.eth" → Approve | buyer got 535.393400 AETHERLAND; hook took 5.408014 (exactly 1 % of the 540.801414 output) | `0x0aca30e5…d55f` 255,298 gas; 17–19 |
| 11 | App: 待發分潤 5.408 AETHERLAND → 發放分潤 | hook → ENS holder `0x8eEC…51C3` 5.408014 AETHERLAND; line disappears | `0x3161c788…d819` 62,927 gas; 20 |
| 12 | Public web view (Cloudflare) | GRADUATED · POOL OPEN, 5 bids CLAIMED, pool 0.01848, royalties owed 0 | 21 |

Final numbers read from chain (`bun run lineage:demo status`): clearing 0.018395 USDC/AETHERLAND
(floor 0.009999, +84 %), raised 9,069.999999 USDC, 500,000 of 500,000 auctioned tokens claimed
(221,462 + 164,994 + 109,726 + 2,731 + 1,087), pool price 0.018476 after the buy.

`aether-land` is a first-generation world, so the whole 1 % stayed with it: the parent's 30 % and
the grandparent's 20 % have no one to go to (`LineageHook._split`). The three-generation split
(50/30/20) is exercised in the dry run (`bun run lineage:market --dry-run`, `milestone-lineage-market`).

## Not verified here

- Real Touch ID. Both passkeys were the CDP WebAuthn virtual authenticator (P-256, user verified).
  The contract verifies the same WebAuthn assertion format, and the browser page uses plain
  `navigator.credentials`, but a person pressing Touch ID was not part of this run.
- `shell.openExternal`: the run set `UNWRITTEN_SIGN_BROWSER=none` and opened the logged URL in a
  headless Chrome.
- A bid outbid below the final price (needs CCA's partial exit; the app does not do it).
- A remix (second generation) launched and traded live. Only the dry run covers it.
