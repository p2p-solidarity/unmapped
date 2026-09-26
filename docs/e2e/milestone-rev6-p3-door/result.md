# E2E · rev 6 phase 3 · `door` (D8)

Plan row (`docs/plans/rev6-phase3.md`, "E2E flows"): `private` and `friends`-without-invite are
refused. Used, expired and revoked invites are refused, and a replayed `member.join` from another
key is refused (`invite-proof-invalid`). After `member.remove`, B can neither read nor write and
B's past events stay. In a `public` world, C leaves a note and a signpost, and C's claim to
witness is refused.

**Verdict: pass**, with one client bug found and fixed (finding 1). The replayed `member.join`
was checked with `world-probe.ts door` (the app has no path to replay another key's join).

## Setup

World F is the continent flow's migrated fixture world, attached to the service in continent
run-10 (world `hvzo7xyfjriqowwc36fvq7vyvvjxr6pwpvipwzkipog6zo3qecmbq`, service key
`kgcwtuo35ge3…`, ws://127.0.0.1:8802, test mode). A = its owner (9356), B = a second device (9357),
C = a third device (9358) whose only way in is A's `.spire-backup` of the save (restored, C's key
is not a member: the D7 "restored on another device, attached" case). A and C run with
`AETHER_TEST_BACKUP_PATH=$SCR/f-world.spire-backup`.

## Replay

```bash
D=docs/e2e/milestone-rev6-p3-door; step() { CDP_PORT=$1 bun scripts/cdp-drive.ts "$(cat $D/$2)"; }
sub() { python3 -c "import sys; print(open(sys.argv[1]).read().replace('__INVITE__', open(sys.argv[2]).read().strip()))" "$1" "$2"; }
link() { tail -1 | python3 -c "import json,sys; open('$1','w').write(json.loads(sys.stdin.read()))"; }
step 9356 run-01-a-backup.json
(cd $SNAP && AETHER_TEST_BACKUP_PATH=$SCR/f-world.spire-backup AETHER_TEST_USER_DATA=$SCR/ud-cf bun run dev --remoteDebuggingPort 9358) &
step 9358 run-02-c-restore-friends.json; step 9356 run-03-a-private.json; step 9358 run-04-c-private-refused.json
step 9356 run-05-a-friends.json; step 9356 run-06-a-invite-1.json | link $SCR/i1
CDP_PORT=9357 bun scripts/cdp-drive.ts "$(sub $D/run-07-b-join-1.json $SCR/i1)"
CDP_PORT=9358 bun scripts/cdp-drive.ts "$(sub $D/run-08-c-used-invite.json $SCR/i1)"
step 9356 run-09-a-invite-2.json | link $SCR/i2
curl -s -X POST http://127.0.0.1:8802/v1/test/advance -H 'content-type: application/json' -d '{"days":2}'
CDP_PORT=9358 bun scripts/cdp-drive.ts "$(sub $D/run-11-c-expired-invite.json $SCR/i2)"
step 9356 run-12-a-invite-3.json | link $SCR/i3   # run-13 names that invite's nonce: regenerate it for a replay
step 9356 run-13-a-revoke-3.json; CDP_PORT=9358 bun scripts/cdp-drive.ts "$(sub $D/run-14-c-revoked-invite.json $SCR/i3)"
step 9356 run-15-a-public.json; step 9358 run-16-c-public-visitor.json
step 9358 run-17-c-signpost.json; step 9358 run-17b-c-note.json; step 9358 run-18-c-claim-refused.json
# … the gift-race flow …
step 9356 run-19-a-remove-b.json; step 9357 run-20-b-removed.json; step 9357 run-21-b-removed-after-fix.json
step 9356 run-22-a-b-past-events.json
# fresh service dir: (cd $SNAP && bun run world:probe -- --service ws://127.0.0.1:8802 door)
```

## What was checked

| # | Check | Observed | Verdict |
| --- | --- | --- | --- |
| 1 | `friends` without an invite is refused | C restored A's backup (33,944 bytes, head 32) → "Restored 無界之地 · 23QC-6PQS" · "Joined from player-7JCQ · 127.0.0.1:8802". Resume: link **refused**, role visitor, writable false, error **`access-members-only`** "Only members read this world." (`c-00`, `c-01`) | pass |
| 2 | `private` is refused | A → Private (access n=34). C: Home → Continue → link refused, **`access-private`** "This world is private." (`a-01`, `c-02`). The probe adds a *member* refused by a private world: `access-private` | pass |
| 3 | A used invite is refused | A → Friends (n=35), invite 1 `vouvin4p…` (1 use, 7 days). B joined with it as "Bea" in 828 ms (member.join **n=36**). C with the same link: preview "Error · **invite-used-up** This invite has been used up."; `world.join` (what "Join and play" calls) → `invite-used-up` (`a-03`, `b-00`, `b-01`, `c-03`, `c-04`) | pass |
| 4 | An expired invite is refused | Invite 2 `zle45tzq…`, 1 day (until 2026-09-27T04:33:04Z). `advance {days: 2}` → service now 2026-09-28T04:33:05Z. C: preview and `world.join` → **`invite-expired`** "This invite has expired." (`a-05`, `c-05`, `c-06`) | pass |
| 5 | A revoked invite is refused | Invite 3 `q7dnog6e…` → Revoke → `invite.revoke` **n=39**, row "· revoked". C: preview and `world.join` → **`invite-revoked`** "The owner withdrew this invite." (`a-07`, `a-08`, `c-07`, `c-08`) | pass |
| 6 | A replayed `member.join` from another key is refused | `world-probe.ts door` on a fresh service: "C opens with Bea's invite and the proof copied from her logged member.join" → **`invite-proof-invalid`**; "C submits a member.join replaying Bea's invite and proof under C's key" → **`invite-proof-invalid`**; Bea's signed join verbatim → `event-not-yours`. The scenario: **45/45** steps ok, incl. used / expired / revoked / forged / non-owner invites at the open and in a join, visitor quotas, removal and private (`probe-door.out.jsonl`) | pass |
| 7 | In a `public` world C leaves a note and a signpost | A → Public (n=40). C: Resume → online, role visitor, writable true, error null (`c-09`). Signpost "Visitors' lane" **n=41**; note "A visitor passed through here on a public day." **n=42** (name player-RTXE) (`c-10`) | pass |
| 8 | … and C's claim to witness is refused | C walked into the unwritten (0, -1): chunk status `failed`, **`claim-refused`** "Only members write this world." — "Ask the world's owner for an invite; walking and reading still work."; HUD "FAILED · Only members write this world. …"; C's stdout: **0** `[inference] chat` lines, one `[world] hvzo7xyfjriq… refused one frame: access-visitor-kind` (`c-11`) | pass |
| 9 | After `member.remove`, B can neither read nor write | A → People → Bea → Remove → Remove them: `member.remove` **n=47** (after the gift-race flow) (`a-10`). B: link **refused**, error **`access-removed`** "The owner removed this key from the world.", head stuck at **46** (entry 47 never reaches B); after Home → Continue the same. Nothing of B's after 46 is in the service log. Writing: see finding 1 (after the fix: "Error · access-removed") (`b-02`, `b-03`, `b-04`) | pass (after fix) |
| 10 | … and B's past events stay | A's log after the removal: B's key `k6zrlcc2r2so…` wrote **36 member.join, 44 gift.take, 46 gift.take**, all still there; gifts 43 and 45 still "taken by Bea"; the key is in `members` and `removed` | pass |

Calls in this flow: A's rumor batch for the beat the +2-day advance made (n=37, 1 slot, B's
`member.join`): `a5d5fec7`, 2,564 ms, 1,553+81 tokens → n=38. B and C: 0.

## Found here

1. **A removed member's app kept accepting writes it can never send (fixed in the renderer; the
   main side remains).** After n=47, B's status was `role: "member", writable: true` with
   `error.code: "access-removed"`: B's copy ends before its removal, so its fold still says member,
   and main's `status().writable` (`src/main/histories/core.ts`) ignores the refusal. The notes
   panel took a note and showed "Not shared yet — waiting for the world's service.", and a direct
   `window.seed.world.append` was queued (`{"id":"husnah6v…","n":null}`): B's outbox reached 3
   events that can never be sequenced (`b-02`). Fix: `writeBlocker()`
   (`src/renderer/history/write.ts`) returns the status error when it is `access-removed`. Check
   (reload, Continue): the note now answers "Error · access-removed · The owner removed this key
   from the world." and `writeBlocker()` = `access-removed`; pending stays 3 (`b-04`). **Not
   fixed (outside this session's files):** main still signs and queues a removed key's IPC drafts,
   and the 3 events queued before the fix stay in B's outbox "waiting" for good.
2. A's door lists invite 2 as "open" after the service called it expired: A's door judges expiry
   with A's own clock, which did not move with the service's test clock. A test-clock effect, not
   a bug (`UNMAPPED_TEST_CLOCK_DAYS` exists for this).
3. The visitor's signpost shows its author as `krz3sidbd…`: a visitor device writes no `profile`,
   so the world knows no name for it (its note carries the name "player-RTXE" in its body).
