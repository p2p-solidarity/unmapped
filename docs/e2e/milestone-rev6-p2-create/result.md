# E2E · rev 6 phase 2 · Create: a few words → cards → look → story → quote → build (D1, D2)

The real-app run of the phase-2 Create flow (`docs/plans/rev6-phase2.md` D1, D2 as far as Create
uses it): a world from words only, a locked card, three concept pictures while the story writes
itself, a quote before Build, the chosen picture published in the cartridge, and the land within
seconds of Build. Every item on the list passed; no code was changed. Four findings are recorded
below for their owners.

## Replay

```bash
mkdir -p "$TMPDIR/ud-p2-create-replay2"   # must be empty
AETHER_TEST_USER_DATA="$TMPDIR/ud-p2-create-replay2" bun run dev --remoteDebuggingPort 9333   # background
bun scripts/cdp-drive.ts "$(cat docs/e2e/milestone-rev6-p2-create/run.json)"          # ~45 s, writes b-*.jpg

# no-key variant (its own launch, see run-nokey.json → env.why)
rm -rf "$TMPDIR/ud-p2-nokey" && cp -R docs/e2e/milestone-rev6-p2-create/nokey-userData "$TMPDIR/ud-p2-nokey"
OPENAI_API_KEY= AETHER_TEST_USER_DATA="$TMPDIR/ud-p2-nokey" bun run dev --remoteDebuggingPort 9333
bun scripts/cdp-drive.ts "$(cat docs/e2e/milestone-rev6-p2-create/run-nokey.json)"
```

Environment: macOS 27, dev build (main d84cfde → 7a04adf during run A, the uncommitted phase-2
tree), UI zh-TW (system default), window 1440 × 827. A fresh userData defaulted to System → Model
`openai · gpt-5.4-mini` with the key from `.env`, so no switch was needed. Pictures:
`gpt-image-1-mini` (the `ImageProvider` default), quality low, 1024² resized to 512². Timings and
tokens are the `[inference]` / `[look]` lines of the dev log and the `usage.jsonl` ledger.

Four runs, each on its own throwaway userData:

- **A** (`ud-p2-create`): the steps driven one cdp-drive call at a time (shots `00`–`15`), then a
  second world for the cancel variant, a redraw and a second Build.
- **B** (`ud-p2-create-replay`): `run.json` split at the quote to measure the prompt (no shots kept).
- **C** (`ud-p2-create-replay2`): `run.json` replayed whole in one call (shots `b-00`–`b-13`).
- **No key** (`ud-p2-nokey`): `run-nokey.json` (shots `16`, `17`), run twice.

## Checked

| # | Expected | Observed |
| --- | --- | --- |
| 1 | Words only, blank name → 撰寫世界; the name is derived; renaming it is not stale | A: the name field was empty; 7 cards in 4,496 ms (bible 4,412 ms, 1,167 + 355 tokens); the world step's name was `霧散後才浮現的漂流群島` (the first clause); renamed to `風箏群島` → no 構想已變更, 前往看樣子 enabled, saved draft name `風箏群島` (`02`, `03`). C: the same, 2,775 ms (`b-02`, `b-03`) |
| 2 | Lock the look card; "重寫 N 張未鎖定的卡片" streams and keeps the locked card byte-identical | A: lock → `world.locked = ["look"]`, button `重寫 6 張未鎖定的卡片`; `[data-stream-preview="world"]` had text at 1,157 ms, done at 4,690 ms (666 + 501 tokens) (`04`); look card identical (58 chars); premise, tone, rules, naming, voice changed; taboos came back unchanged from the model (unlocked, so allowed) (`05`). C: preview at 937 ms, done 3,810 ms; look identical, all six others changed |
| 3 | 前往看樣子: three pictures; the story streams meanwhile; three `[look] done`; usage counts the images | A: at 3 s the drawing counter and `[data-stream-preview="story"]` (logline, chapter 1, half of chapter 2) were both on screen (`06`); `[data-look-pictures] img` ×3 at 9.3 / 10.6 / 10.8 s; `[look] done … gpt-image-1-mini · 9045 / 10400 / 10697 ms`; image tokens 258 + 272, 254 + 272, 257 + 272; story done in 7,870 ms (861 + 860); usage line `6 次 · 輸入 3,463 / 輸出 2,532` = 3 text + 3 image calls, to the token (`07`). C: 8,526 / 9,097 / 9,215 ms; story 3,770 ms |
| 4 | Pick one → story present → quote with calls, tokens, cap 2,200, worst case, dated price, chapter-1 line, draft usage, estimate note | A: sketch 2 chosen (`08`); 5 chapters there at once (`09`); quote (`10`): `1 次呼叫，需要修正時最多再 2 次 · openai · gpt-5.4-mini` · `約 2,617 個輸入 token … 最多 2,200 個輸出 token` · `3 次呼叫，最多約 16,651 … 6,600` · `約 0.02 美元 … 最多約 0.05 美元（gpt-5.4-mini 於 2026-09-26 的公開價格）` · the chapter-1 background line (2 repairs, 2,400 cap) · `這份草稿：6 次 · 輸入 3,463 / 輸出 2,532` · the estimate note. Arithmetic checks: 3 × 2,617 + 2 × 2 × 2,200 = 16,651; 2,617 × $0.75/M + 2,200 × $4.50/M = $0.0119 → 0.02 |
| 4 | Estimate vs what the origin really used | first origin call, estimate → real input: A 2,617 → 2,990; A world 2 2,449 → 2,791; B 2,561 → 2,929; C 2,618 → 3,008 (1.140–1.149 ×). Real answers 581–755 tokens against the 2,200 cap. Origin calls: A 1 (5,634 ms), A world 2 2 (one repair, 4,818 in, 2,304 cached), B 2, C 1 (3,319 ms). See finding 1 |
| 5 | 建立並開始玩 → on the land; timings; chapter-1 status; `assets/look.png` published intact | A: Build → HUD in 6,122 ms; `正在撰寫下一章… · 燈下改單` on screen (`12`); HUD usage `7 次 · 6,453 / 3,272` = draft + origin (the draft's calls were linked to the world). C: Build 3,632 ms; words → land **24.1 s**, words → walked **27.1 s** (`samplePlayer()` x 8.5 → 12.97 after 1.5 s of D) (`b-11`, `b-12`); chapter-1 status gone 3.0 s after entering (chapter 2,932 ms, 2,415 + 535). `cartridges.list()`: `assets/look.png` in every published manifest; bytes identical to the chosen picture: A world 2 sha256 `7e78d789…` (217,565 B), B `6ae28259…` (302,960 B), C `9c743448…` (282,181 B) — hashed in the page before Build, equal to the manifest hash; A world 1: a 512 × 512 PNG, 256,628 B, file hash = manifest hash |
| 5 | Time with nothing to do | C: writing the world 2.8 s + Build 3.6 s = **6.4 s** (+ 3.8 s for the optional rewrite). A: 4.5 s + 6.1 s = 10.6 s (+ 4.7 s). On the look step the story streamed for 3.9 s (C) / 7.9 s (A) and then 2.9–5.5 s of the draw showed only the counter (finding 3). A's words → land wall clock was 125.6 s, most of it this agent's own pauses between calls |
| 6 | 停止繪製 while drawing → `[look] abort`, ledger `aborted`, nothing saved | A: cancel at 2.5 s → 3 × `[look] abort`, then `fail … · 2506 / 2507 / 2507 ms · cancelled`; ledger 3 × `image … "outcome":"aborted"` with no tokens; no `looks/` folder, `readLooks` = 0, draft `look = {pictures: [], chosen: null}`, no error shown, the button reads 畫草圖 (`14`); the story kept writing (5,607 ms). Drawing again worked (8,532–9,460 ms). C: aborts at 2,544–2,545 ms, 0 saved (`b-13`) |
| 7 | No key: the look step shows `no-api-key` with the hint; 不選圖片，繼續 still goes on | Launched with `OPENAI_API_KEY=` on a userData with no saved key: `keyStatus().openai.set = false`; 3 × `[look] fail … 0–2 ms · no-api-key`; the error block with the English hint + 請到「系統 → 模型」輸入金鑰… and the "continue without a picture" line (`16`); 不選圖片，繼續 → step 4, draft `look.skipped = true` (`17`). Ran twice, same result |
| 8 | No renderer errors | `[renderer:ERR/WARN]`: runs B, C and both no-key runs 0. Run A 2, both caused by this agent's own probe (a `fetch()` of a `data:` URL, blocked by CSP `connect-src`), not by the app; the hash eval was rewritten with `atob` and runs B/C are clean |

## Findings (not fixed here)

1. **The quote's input estimate reads about 14 % low.** Four builds, 1.140–1.149 × real. Run B
   measured the assembled prompt in the page with the quote's own code path (`estimateTokens` =
   2,561 = the quote): 9,115 characters, 376 CJK and 8,739 others; with ~1 token per CJK character
   the rest came to ~3.4 characters per token, not the 4 `estimateTokens` assumes (the prompt is
   mostly the DSL spec, which tokenizes denser than English prose). The money line is still on the
   safe side because it charges the whole 2,200-token cap (real answers: 581–755). Suggest
   calibrating `estimateTokens` in `src/shared/pricing.ts` to ~3.3 characters per token for
   non-CJK text (and the `create.quoteEstimate` wording in three languages). Not changed: the line
   says 約 and is labelled an estimate, and the number is only off by the tokenizer ratio.
2. **Hints still point to 「系統 → 模型」 / "System → Model"**, but the title menu is now 設定 /
   Settings (D3). 21 files under `src/` carry the old path (i18n hint tables, `create.ts`,
   main-side English hints). Seen here on the look step's `no-api-key` error. For the library
   package or the final review sweep.
3. **The finished story is invisible on the look step.** In every run the story finished before
   the pictures (3.6–7.9 s vs 9.2–10.8 s); then `StoryAheadPanel` disappears and nothing says the
   story is ready, so the rest of the draw shows only the counter. The forward button stays
   enabled, but while drawing it reads 不選圖片，繼續, which suggests giving up the pictures. A
   "story ready (N chapters)" line would close the gap in done-looks-like #1. For the create
   package.
4. Another session committed feac2d3…7a04adf and vite hot-reloaded `BuildStep.tsx`,
   `CreateGameScreen.tsx` and `TweakPanel.tsx` at 03:10:53, just before run A's first Build. The
   flow was unaffected; runs B and C ran on the new tree from the start.

## Checks

`bun run typecheck` 0 errors · `bun run lines` ok · `bunx vitest run` 108 files / 453 tests passed
· `bun run lint` 6 errors, all in untracked files of another agent's work in progress
(`src/shared/history/{admit,beat,decay,rumor}.ts`, `src/shared/worldProtocol.ts`); none in Create.

## Not verified here

- D2's reference path (`images.edit` with the world's look picture) is used by otherworld assets
  (D6), not by Create; it is left to the otherworld run.
- Redrawing with a chosen picture kept (重新繪製（保留已選的那張）) and unchoosing a picture were not
  run; the cancelled draft was redrawn from zero.
- The quote's `free` (local model), `price unknown` and Apple-bridge lines: only OpenAI
  gpt-5.4-mini was selected. The quote shows the price date; the pricing page URL is carried in
  `src/shared/pricing.ts` but not shown on screen.
- The no-key variant hides the key through the launch environment, not through Settings → Model:
  pictures always use the OpenAI provider, so choosing another chat provider never makes the look
  step key-less (run-nokey.json → env.why). `.env` and saved keys were not touched.
- With no key the default chat model is Apple on-device, which was not served, so the story could
  not be written in that variant (expected, `connection-refused`).

> Commit ids in this record were updated after the 2026-09-26 rewrite of main, which changed only test date strings (7a04adf was ca6394b, d84cfde was f59d7c3, feac2d3 was 8e2fa8d).
