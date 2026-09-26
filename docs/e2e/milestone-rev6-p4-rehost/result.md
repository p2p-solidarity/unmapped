# E2E · rev 6 phase 4 · `p4-rehost` (D5, done statement 2)

Plan row (`docs/plans/rev6-phase4.md`, E2E 6): A shares a Create world with a `pack` event and an
otherworld, invites B and makes B a co-owner; both witness and leave notes. S1 and A's userData
are removed. B exports a `.world` that verifies offline. S2 imports it as a mirror and refuses a
submit. B's `sequencer` for S2 is receipted under S2's key while every older receipt still verifies
under S1's. B invites C with `&o=`, C joins, sees A's land and enters the otherworld from the file's
work pack with no model call. B witnesses a new chunk and C sees it. The chain up to the old head is
the same on S2, B and C.

**Verdict: pass.** Every item held. One item needed a second device: C's own walk to the otherworld
witnessed the entrance's chunk (A had never been there), so C made one `witness` call. C2, a fresh
device that joined later, did the same walk with **0** `[inference]` chat lines (see check 13).

One UI bug was found and fixed: after a move, the World files row still showed the old service. The
fix was checked by a second move, to S3, which also exercised the service's CLI export and a plain
member following a move link.

## Replay

```bash
SCR=<scratch dir>; R=<repo root>; D=docs/e2e/milestone-rev6-p4-rehost
# the tree: origin/main 8813246 + the files in run.json env.build (a git archive snapshot)
git archive 8813246 | tar -x -C $SCR/tree && ln -s $R/node_modules $R/.env $SCR/tree/
printf '{"v":1,"provider":"qwen-image-2512"}\n' > $SCR/udA/images.json      # no picture is ever drawn
cd $SCR/tree && UNMAPPED_SERVICE_TEST=1 bun run service -- --port 8797 --data $SCR/s1 &
AETHER_TEST_USER_DATA=$SCR/udA node_modules/.bin/electron-vite dev --remoteDebuggingPort 9344 &
AETHER_TEST_USER_DATA=$SCR/udB AETHER_TEST_WORLD_PATH=$SCR/files/b.world node_modules/.bin/electron-vite dev --remoteDebuggingPort 9345 &
AETHER_TEST_USER_DATA=$SCR/udC node_modules/.bin/electron-vite dev --remoteDebuggingPort 9346 &
cd $R; step() { CDP_PORT=$1 bun scripts/cdp-drive.ts "$(cat $D/$2)"; }
step 9344 run-05-a-settings.json; step 9345 run-06-b-settings.json; step 9346 run-07-c-settings.json
for s in 08-a-create-world 09-a-create-look 10-a-create-build 11-a-otherworld-write 12-a-otherworld-save 13-a-share; do step 9344 run-$s.json; done
# run-14 … run-44 in order, substituting __INVITE__ literally (python) with the link the step before it read;
# the command steps (quit A, kill S1, rm udA + s1, verify-world, service import, world:probe, S2/S3) are in run.json.
```

`run.json` holds the env, the model and all 45 steps, in order. There are 31 cdp-drive steps, each
also in its own `run-NN-*.json`, and 14 command steps. The world id, keys and hashes below are the
ones this run made; a replay makes new ones.

## Checked

Keys in this run: S1 `kxccio7d3agoewexptub2rdehodztmzqmrgpif2yqnuesp5etcpea`, S2
`kz5ctdhpyy4rd7q2hfed6jjuqbuephrqstkrmaylqkjmya3mxelpq`, S3 (fix check)
`ksxbyjk5y6jerbxmnok36wewhzdvcfcaaxo6d442qhfr26wzqn3la`; A `k6i3mbstsa…`, B (Bea)
`khjqwqxgvotpetna673pluom726wj4oolytp3juukeufop3erntcq`, C (Cy) `kkjp27zhlj…`, C2 (Cyd)
`k7hkmwaz2i…`. World `hmurplfsx6wzlxrwysnkkkb4htxpdr7as5ufqwmk2k6hdkdio44ga` "Lantern Delta".

| # | Check | Observed | Verdict |
| --- | --- | --- | --- |
| 1 | A makes a world with Create, so it has a `pack` event | Create (idea words + name, Explore, English): the world card was ready in 2,338 ms; the look step drew nothing (3 × `[look] fail … qwen-image-2512 … 2–3 ms · image-server-unreachable`); "Continue without a picture". The story was ready in 3,327 ms (5 chapters). Build → Play took 5,901 ms. Fold: head 5, `pack` = cartridge `sha256:d16ea4ab…`, pack `sha256:5988a7bd…` (5,863 B), cartridge `lantern-delta-9c19fd@1.0.0`; log #2 is `pack` (`a-01`…`a-05`) | pass |
| 2 | A places an otherworld | Tweak rules → Add a place → Otherworld → "Write a new otherworld" (CSS shapes only, no assets). c001 was playable first try in 13.4 s (model 6.8 s, 813 + 1,919 tokens, 0 repairs). Save version → `place` #6 `{kind: otherworld, at: (0,-1), work: w-2b6d821f@1.0.0 sha256:17a5554d…, pack sha256:a5121aad…}` (`a-06`, `a-07`) | pass |
| 3 | A shares on S1 | Door → "Share on 127.0.0.1:8797" → Online in 250 ms. S1: `attached world hmurplfs… (7 entries)`. `blobs.txt` lists `5988a7bd… 5863` and `a5121aad… 2743` (`a-08`) | pass |
| 4 | A invites B; B joins | Invite from the door; B's preview read "0 members · 7 entries". Join and play took 630 ms; B's head was 8 (`member.join` #8) (`b-01`, `b-02`) | pass |
| 5 | A makes B a co-owner through the door's people rows | Bea's row → Make co-owner → Make them a co-owner. `owner.add` #9 by A with key B; the row reads "co-owner since entry 9"; `owners` = {A #1, B #9} (`a-10`) | pass |
| 6 | Both witness and leave notes | A: note #10; witness (1,0) "Second Reed Bend" #11. B: note #12; witness (0,1) "Second Reed Landing" #13. Old head **13**, chain `sha256:3319b6af7ed75923b153f15e8e5f36865c8af55e21ce00651bdde89101d1ffcc` (`a-11`, `a-12`, `b-03`, `b-04`) | pass |
| 7 | S1 and A's userData removed | A closed (Browser.close); S1 SIGINT ("stopped (SIGINT), snapshots written"); `rm -rf udA s1`. S1's log was copied first, as evidence only | pass |
| 8 | B exports a `.world`; `verify-world` passes offline | Worlds → World files → Export .world: "Wrote b.world (19 KiB)", 18,734 B, sha256 `9ceac7f7…`. `bun run verify-world`: 13 entries by 2 keys; 2 owners; services `ws://127.0.0.1:8797 (kxccio7d3a… from #7)`; 0 beats; 2 packs (1 AI world), 31,597 B; signature valid; "OK — every check passed", 123 ms, exit 0 (`verify-b-export1.txt`, `b-05`) | pass |
| 9 | S2 imports it as a mirror | `service -- import`: "imported as a mirror … 13 entries, head 13 … verify: ok". `imported.json` holds head 13 and the file's sha256 `9ceac7f7…`. S2 started with "worlds 1 (0 not served)" (`service-cli.txt`) | pass |
| 10 | A submit to the mirror is refused | `world:probe join` against S2, with a fresh invite B signed while offline (`&o=` present): open → `opened:invitee`; submit `member.join` → **`world-mirror-only`**. S2's log stayed at 13 lines (`probe-mirror.txt`; the probe exits 1 because its `join` scenario expects acceptance) | pass |
| 10b | A move link before any rehost | B pasted `unmapped://world?w=…&svc=ws://127.0.0.1:8798` → **`move-not-rehosted`** "That service holds this world, but no owner has moved it there yet." Nothing was written; S2 stayed at 13 (`b-06`) | pass |
| 11 | B (co-owner) rehosts to S2; the receipt key switches from #14; older receipts still verify under S1 | World files → Move to another service → Move to 127.0.0.1:8798: "The world now lives on 127.0.0.1:8798" in 273 ms. S2's log has 15 entries: #14 `sequencer` by B, #15 B's `visit`, which had waited in the outbox while S1 was down. `receipts.ts`: #1–#13 verify under **S1**, #14–#15 under **S2**; `verifyLog` ok; schedule `[{n:7, S1}, {n:14, S2}]`. The second export (19,396 B) verifies: head 15, services `…8797 from #7, …8798 from #14`, OK (`receipts-s2.txt`, `verify-b-export2.txt`, `b-08`, `b-09`) | pass |
| 12 | B sends C a co-owner invite (`&o=`); C joins with the proof | B's link: 1,170 chars, `svc` `ws://127.0.0.1:8798`, `&o=` present. C's preview read "1 member · 15 entries". Join 1,999 ms; `member.join` #16 by C; C's owners = {A, B} (`b-10`, `c-01`, `c-02`) | pass |
| 13 | C sees A's land and enters the otherworld (work pack from the file) with 0 `[inference] chat` lines | C: (1,0) "Second Reed Bend" drawn from the history. C walked to the entrance at (16.5, −15.5) in chunk (0,−1), which nobody had witnessed, so C **witnessed it (#17, 1 call)**. E opened `ulwork://…`, `sandbox="allow-scripts"`, `allow="gamepad"`, 1440 × 785. `received-works.json` lists w-2b6d821f with pack `a5121aad…`; that blob reached S2 only through the file. 0 `work` calls. **C2** (fresh, joined at head 19 with a second `&o=` invite; preview "2 members · 18 entries"; join 1,428 ms) walked (1,0) → the entrance → entered the otherworld (`ulwork://…`, allow-scripts, the lantern room drawn) → (−1,0): **0** `[inference] chat` lines in C2's log (`c-03`…`c-05`, `c2-01`…`c2-06`) | pass (on C2) |
| 14 | B witnesses a new chunk and C sees it | B on S2: (−1,0) "West Reed Mouth" #18 (1 call + 1 repair, `dsl-invalid-chunk`). C walked there: `written`, live n = 18, author B, no new call (`b-11`, `c-06`) | pass |
| 15 | The chain up to the old head is identical on S2, B and C | sha256 of `log.jsonl` lines 1–13, byte for byte: `00b6d595602a70d4…` on the S1 copy, S2, B, C and C2. chain(13) = `sha256:3319b6af…` on all five. Heads: S2, B, C and C2 are all at 19, `sha256:7ed2f8c0…` (`chain-compare.txt`) | pass |

### Fix check (after the fix to `WorldBundleActions.tsx`, B relaunched on the fixed tree)

| # | Check | Observed | Verdict |
| --- | --- | --- | --- |
| F1 | The service's CLI export | `service -- export` from S2's data dir (S2 stopped): 22,643 B, signed by S2's key; `verify-world` OK, 19 entries by 4 keys, services S1 #7 and S2 #14 (`verify-s2-export.txt`) | pass |
| F2 | After a move, the row shows where the world now lives, and the move link stays | S3 (`service -- import` of that file, on :8797). B: Move to 127.0.0.1:8797 took 357 ms. The row now reads "**20 entries · on 127.0.0.1:8797**". The move link is still shown; the only service button left is "Move to 127.0.0.1:8798" (before the fix, the row kept "13 entries · on 127.0.0.1:8797" beside "The world now lives on 127.0.0.1:8798", see `b-08`). S3 #20 `sequencer` by B, receipt under **S3**; schedule has 3 keys (`b-14`, `receipts-s3.txt`) | pass |
| F3 | A plain member follows a move link | C (link.json → S2, which is stopped) pasted B's move link → "The world now syncs with 127.0.0.1:8797 (1 new entries)". `link.json` → `ws://127.0.0.1:8797`, key S3. Lines 1–19 are identical (`fdd8daba…`) on S2, S3, B, C and C2; S3, B and C are at head 20 `sha256:84d7258e…` (`c-08`, `chain-compare.txt`) | pass |

### Model use

`openai · gpt-5.4-mini` (the Settings → Model default; key from `.env` in main). There were 12
chat calls, 35,483 input (16,384 cached) and 12,621 output tokens, about US$0.08 at the list price
the Create quote cites. By device:
- A 8 calls: bible, story, origin + 1 repair, chapter 1, 2 witnesses, the AI world.
- B 3 calls: 2 witnesses, plus 1 repair.
- C 1 call: the witness of (0,−1).
- C2 0 calls; the fix-check relaunches 0 calls.

No picture was drawn. Every `[inference] done` line is in `model-calls.txt`.

## Not run

- **Gateway:** the plan also removes "the gateway". This run used no gateway (direct OpenAI key),
  so there was none to remove.
- **HTTP export:** `GET /v1/worlds/<id>/export` was not called. The CLI export (F1) and two app
  exports were.
- **Service export of a built-in-genesis world:** a service exporting a built-in-genesis world it
  got from a file (`heldGenesisPack`) was not exercised. This world has a `pack` event.

## Found here

1. **Fixed: after a move, the World files row showed the old service.** `WorldBundleActions.tsx`
   re-read the list only when the move block was closed. It did so through a `loading` state that
   unmounts the rows, which is why it waited. Until then the row said "13 entries · on
   127.0.0.1:8797" under "The world now lives on 127.0.0.1:8798". It also still offered "Move to
   127.0.0.1:8798", the service the world was already on (`b-08`).

   Now the list is re-read in place: no `loading` in between, and the rows stay mounted by
   `worldId`. `MoveBlock` calls it after a successful move, so the open block keeps its move link.
   Verified by F2.
2. **English plurals in the `.world` strings.** The report and the move result say "1 entries, up
   to #1", "1 owners · 1 writers", "1 problems — …" and "(1 new entries)" (`a-01` of
   p4-import-physics, `c-08`). `bundle.reportEntries`, `reportOwners`, `reportProblems` and
   `moveFollowed` in `src/renderer/i18n/strings/bundle.ts` have no `{n|…|…}` forms. That file is
   outside this run's fix list, so it is reported, not changed.
3. **An otherworld placed on unwritten land costs its first visitor a witness.** A placed the
   entrance at (0,−1), a chunk nobody had walked into, so the first member to reach it (C) wrote
   that chunk. This follows from walking into unwritten land. Zero calls holds once the chunk is
   written (C2).
4. **No app could submit to the mirror, so a probe did.** B's `link.json` names S1 until the
   rehost, and no one else was a member, so no app could send a `submit` to S2. The refusal was
   shown with `world:probe join` over S2's real socket, using an invite B signed while offline.
   The move-link refusal (10b) is the app-side counterpart.
5. **Services log no rehost or join.** Only S1 printed a line (`attached world …`); S2 and S3
   printed nothing for the rehost or the joins. That is only an operator-visibility note.
6. **Bun prints an error on exit.** Every Bun script in the snapshot tree ended with
   `Internal error: directory mismatch for directory ".../tsconfig.node.json", fd 3`. Exit codes
   and outputs were unaffected.

## Files

- `run.json`: env, model, and all 45 steps with exact actions or commands. `run-NN-*.json`: each
  cdp-drive step on its own.
- `a-*`, `b-*`, `c-*`, `c2-*.jpg`: screenshots, named by device.
- `b-export1.world`, `b-export2.world`, `s2-export.world`: the files, replayable with
  `bun run verify-world -- <file>`. `verify-*.txt` hold their outputs.
- `receipts.ts.txt`: the evidence script (which service key verifies each receipt).
  `receipts-s2.txt` and `receipts-s3.txt` hold its output.
- `chain-compare.txt`, `probe-mirror.txt`, `service-cli.txt`, `model-calls.txt`: raw evidence.
