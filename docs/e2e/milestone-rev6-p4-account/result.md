# E2E · rev 6 phase 4 · p4-account (D1 accounts, D2's 401 rule)

Plan item 1 of `docs/plans/rev6-phase4.md`: A signs in with its device key; B joins A's account by
pairing code (A types only the code, looks it up, compares fingerprints, approves); A removes B, B's
next hosted call gets a 401, main forgets exactly that saved token and B says it is signed out; a
token made by the gateway CLI and put in B's `UNMAPPED_GATEWAY_KEY` signs B back in (".env") and the
next call settles. **Pass.**

Model: `test-chat` through the fixture upstream (`tests/fixtures/gateway/serveUpstream.ts`); it
only ever answers "Hello.", so Create's "Write the world" is used to make real hosted calls and its
`dsl-parse` errors afterwards are expected. No call left this machine; every route line read
hosted before a call.

## Replay

```bash
SP=$(mktemp -d); mkdir -p $SP/gw $SP/udA $SP/udB
cp docs/e2e/milestone-rev6-p4-quota/gateway-upstreams.json $SP/gw/upstreams.json
cp docs/e2e/milestone-rev6-p4-quota/gateway-costs.json $SP/gw/costs.json
blank() { env OPENAI_API_KEY= THESYS_API_KEY= UNMAPPED_GATEWAY_KEY= "$@"; }   # the repo .env adds nothing
blank bun tests/fixtures/gateway/serveUpstream.ts --port 8791 &
blank STRIPE_SECRET_KEY= STRIPE_WEBHOOK_SECRET= UNMAPPED_GATEWAY_TEST=1 bun run gateway -- --port 8788 --data $SP/gw &
blank UNMAPPED_GATEWAY_URL=http://127.0.0.1:8788 AETHER_TEST_USER_DATA=$SP/udA bun run dev --remoteDebuggingPort 9340 &
blank UNMAPPED_GATEWAY_URL=http://127.0.0.1:8788 AETHER_TEST_USER_DATA=$SP/udB bun run dev --remoteDebuggingPort 9341 &
D=docs/e2e/milestone-rev6-p4-account
drive() { CDP_PORT=$1 blank bun scripts/cdp-drive.ts "$(cat $2)"; }
# A: Settings → English first (Settings open), then:
drive 9340 $D/run-a1-signin.json
drive 9341 $D/run-b1-pairing-code.json                                  # note the code B shows
drive 9340 <(sed "s/__CODE__/<code>/" $D/run-a2-approve.json)
sleep 6; drive 9341 $D/run-b2-paired.json
blank bun run gateway -- grant <accountId> 20000 --data $SP/gw
drive 9341 $D/run-b3-call-paired.json
drive 9340 $D/run-a3-remove-b.json
drive 9341 $D/run-b4-after-removal.json
blank bun run gateway -- token <accountId> --data $SP/gw --label e2e-b-env > $SP/token.env   # never printed
# stop B; start it again with "$(grep ^UNMAPPED_GATEWAY_KEY= $SP/token.env)" instead of UNMAPPED_GATEWAY_KEY=
drive 9341 $D/run-b5-env-token.json
```

`run.json` holds the env, the model and every step's exact actions in order (its top-level
`actions` are step 1's, so `cdp-drive` replays it as-is).

Environment: macOS 27, Electron dev (`electron-vite dev`), the shared working tree at 12:25–12:34 JST
(main `51817a3` plus other sessions' uncommitted edits, plus this run's fixture fix). B's restart ran
`./node_modules/.bin/electron-vite dev --remoteDebuggingPort 9341` directly, because `bun run dev`'s
first step (`scripts/build-afm-bridge.mjs`) failed on another session's half-edited
`native/afm-bridge/.../Bridge.swift` (`cannot find 'chat' in scope`); the bridge is not used here.

## What was checked

Account `ajbsvnshdt6okxovaszfrreh63m`; A's key fingerprint `JFIH-KZEK-4U5P-HYTC`, B's
`SVS7-H6HD-LU7Z-3VVQ`. Times are UTC (JST − 9 h). Main lines are from `main.log.txt`, gateway lines
from `gateway.log.txt` (settle/release) and the gateway's `ledger.jsonl` / `accounts.jsonl`.

| # | Expected | Observed |
| --- | --- | --- |
| 1 | A signs in with its device key; a key in no account starts one | "Sign in with this device" → `[account] signed in · ajbsvnshdt6okxovaszfrreh63m (new account)`; panel `data-account="signed-in"`, route `data-route="hosted"` "Next call: free allowance · test-chat" (`a-01`); `accounts.jsonl` token line 03:26:47.022Z for A's key |
| 2 | B asks for a pairing code, shown beside its fingerprint; B does not sign in | "Get a pairing code" → `HPND VJBC` (until 12:38:42 PM), "Fingerprint: SVS7-H6HD-LU7Z-3VVQ", "Waiting for approval…" (`b-01`) |
| 3 | A types only the code, looks it up and sees B's fingerprint before approving | "Look up this code" → "The device asking with this code: SVS7-H6HD-LU7Z-3VVQ" — the same as B's screen (`a-02`) |
| 4 | Approving adds B to the same account; B's poll picks it up | A: `[account] device add · SVS7-H6HD-LU7Z-3VVQ`, "Device added to the account.", two device rows (`a-03`); `accounts.jsonl` `key.add` 03:29:47.661Z by A's key, then a token for B's key 03:29:47.856Z; B: `[account] signed in · ajbsvnshdt6okxovaszfrreh63m`, `[account] pairing approved`, "Signed in · account ajbsvnshdt6okxovaszfrreh63m", its row "this computer" (`b-02`). No `data-co-owner-offer` (A owns no shared world) |
| 5 | A paired device's hosted call is metered on the account | After `grant … 20000`: B "Write the world" → 3 calls. Main `done f82e229d…`, `done 9accb98f…`, `done 11f4dc05…` (each `20+30 tokens (5 cached)`); gateway `settle … f82e229d… credits 335/16964 (usage)`, `9accb98f… 335/17260`, `11f4dc05… 335/17260` (`b-03`, its `dsl-parse` is the fixture's "Hello.") |
| 6 | A removes B | "Remove" on B's row → `[account] device remove · SVS7-H6HD-LU7Z-3VVQ`, one row left (`a-04`); `accounts.jsonl` `key.remove` 03:31:12.522Z |
| 7 | B's next call is a 401; main clears exactly that saved token; B says signed out | B "Write the world" → `[account] token refused · saved · saved token cleared`, `[inference] fail aca5dd3a… · bible · hosted test-chat · 6 ms · account-signed-out`; screen `Error · account-signed-out` (`b-04`); `udB/provider-keys/` empty afterwards (it held `hosted.key`); Settings: `data-account="signed-out"`, "The gateway no longer accepts this device's sign-in (revoked or expired)…", route "cannot go anywhere yet: This device is not signed in…" (`b-05`). No gateway settle/release line for `aca5dd3a` (refused before any hold) |
| 8 | A CLI token in `UNMAPPED_GATEWAY_KEY` signs B in as ".env" | `bun run gateway -- token ajbsvnshdt6okxovaszfrreh63m --data $SP/gw --label e2e-b-env` → token id `tdsztg3szyppte4py` (`accounts.jsonl`: `device: null`, label `e2e-b-env`, 03:31:43.212Z); the token went to a 0600 file and B's env only. B restarted: "Signed in with UNMAPPED_GATEWAY_KEY from .env · account ajbsvnshdt6okxovaszfrreh63m. Remove it from .env to sign out.", no "Sign out" button, quota "94% of the allowance left · 1,005 of 20,000 gateway credits used · 0 held" (`b-06`) |
| 9 | …and the next call settles | Main `done f868839a…`, `done 41a5f53d…`, `done 59602275…`; gateway `settle … f868839a… credits 335/16964 (usage)`, `41a5f53d… 335/17260`, `59602275… 335/17260` (`b-07`) |

## Found on the way

1. **Refused calls were counted as "calls through the gateway".** B's panel in step 8 read "4 calls
   through the gateway, 60 input and 90 output tokens · 1 call without reported tokens": the 401 of
   step 7 counted as a call with unreported tokens, though the gateway ran and charged nothing (A's
   two `quota-exhausted` refusals did the same). Fixed in `src/main/account/hostedUsage.ts`: only
   finished (`outcome: done`) hosted lines count, since the gateway releases every refused, failed
   or cancelled call. B ran before the fix (its numbers above are as shown); the fix is verified in
   milestone-rev6-p4-quota (A: 2 refusals + 1 error + 1 cancel → "0 calls through the gateway").
2. **B with an `.env` token still lists A's key with a "Remove" button** and "Add another device",
   although B's own key is no longer in the account. Approving or removing needs a statement signed
   by a key in the account, which the gateway refuses (`tests/gateway/auth.test.ts` item 5); not
   driven here. Not changed; worth hiding those controls when `session.source === "env"` and this
   device's key is not listed.
3. **Other sessions' edits reload the dev renderer.** A page reload (Vite HMR, `i18n/strings/*.ts`
   edited elsewhere) threw A back to the title twice; the affected steps were re-run from the title
   (the run files start there). Later flows ran from a snapshot tree for this reason.

## Not run

- Pairing's co-owner offer (`data-co-owner-offer`): A owns no attached world in this run, so it is
  correctly absent; offering it is part of the phase-3/D5 flows.
- A passkey on the gateway's web page (desktop `file://` builds cannot run WebAuthn; not in this
  plan item).
