# The Market's gas station — E2E on Sepolia (2026-09-26)

The app no longer holds a key that pays gas. Every Market write goes app → player's passkey →
the gas station (`src/relay`, a Cloudflare Worker; `web/lineage-relay/wrangler.jsonc`) → Sepolia,
and main waits for the receipt on its own RPC. The station builds each transaction itself from a
request's kind; the only calldata it forwards is a passkey batch, which the account contract checks
against the passkey's signature on chain. Replay: `run.json`.

The app ran with `UNWRITTEN_PRIVATE_KEY=` (empty wins over `.env`, since dotenv never overrides a
set variable). The station ran locally under `wrangler dev`. The deployed Worker
(https://unmapped-relay.gimmychang.workers.dev) is the same code; at the time of this run it was
still waiting for its `RELAYER_KEY` secret, so `/status` answered `relayer: null` and every write was
refused with `relay-no-key` (checked).

## What was checked, and what we saw

| # | Step | Observed | Evidence |
| --- | --- | --- | --- |
| 1 | Station refuses what it must not pay for (curl) | browser `Origin` 403; unknown world; malformed body 400; a call to a foreign contract; ETH value; forged WebAuthn signature (simulation reverts); an already settled bid; royalties in a foreign currency; nothing owed | every answer `ok: false`, no transaction |
| 2 | Round 1 (v1 contracts, station paying with a temporary copy of the operator key) | faucet 970 → 1,970 test USDC; browser-signed buy 5 USDC; royalty payout | `0x7960e9cf…b79a` 34,269 gas; `0x7d269515…f1fe` 238,170; `0xe9101e71…74e1` 62,927; 01–08 |
| 3 | Round 1: link a passkey created earlier ("Use my existing passkey", two assertions) | account `0x0E50…5c07` recovered | 02–03 |
| 4 | Round 2 (v2): 25 USDC bid in the new aether-land auction, signed in the browser | bid #3 | `0x96ccc5bc…14d4`; 09–11 |
| 5 | Round 2: 結算拍賣 after block 11,781,522 | 4 exits + 4 claims, then graduate; phase → 交易中 | `0xa2dea7fb…61ab` … `0xb59dce00…c903`, graduate `0xac7221df…3f63` 650,770 gas; 12–14 |
| 6 | Round 3: the station on its own key `0xB62C…Fd3D`; a new passkey created on the link page | new account `0xfBaB…8537` | 15 |
| 7 | Round 3: faucet | 0 → 1,000 test USDC | `0x4530bbe2…a55a` 51,369 gas; 16 |
| 8 | Round 3: browser-signed buy of 10 USDC (the account's first action, so it is also deployed) | 528.45 AETHERLAND; 5.338 AETHERLAND owed to the world | `0x89794d10…9344` 373,664 gas; 17 |
| 9 | Round 3: 發放分潤 | owed → 0, paid to the ENS holder | `0xa2efd93f…86bd` 67,203 gas; 18 |

The station's own key sent 5 transactions in rounds 3 and in milestone-lineage-names (faucet, buy,
royalties, record a save, update a save), all successful, for 0.00178 Sepolia ETH (0.05 → 0.04822).

## Not verified here

- The deployed Worker sending a transaction: it has no `RELAYER_KEY` yet. The operator adds it with
  `bunx wrangler@4 secret put RELAYER_KEY -c web/lineage-relay/wrangler.jsonc < .cache/relay/relayer.key`.
- Its rate limit (30 requests a minute per client address) was deployed but not driven to its limit.
- Real Touch ID: the CDP virtual authenticator stood in for it, as in milestone-lineage-demo.
