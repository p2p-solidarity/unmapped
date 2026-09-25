# E2E · rev 6 phase 1 · Create a non-countryside world (3.1–3.6)

The first real-app run of the rev 6 phase-1 work (`docs/rev6-ai-brief.md` §3): a world that is not
countryside, built on the chat route, with its model calls streamed to the screen, counted in the
usage ledger, and cancelled mid-request. It found two bugs, both fixed in this session and re-run.

## Replay

```bash
mkdir -p "$TMPDIR/ud-rev6a"   # must be empty
AETHER_TEST_USER_DATA="$TMPDIR/ud-rev6a" bun run dev --remoteDebuggingPort 9333   # background
CDP_PORT=9333 bun scripts/cdp-drive.ts "$(cat docs/e2e/milestone-rev6-create/run.json)"
```

Environment: macOS 27, dev build (main 70f5eba + the uncommitted phase-1 tree), UI zh-TW, window
1440 × 841, model `openai · gpt-5.4-mini` (System → Model default, key from `.env`). `/usr/bin/fm`
exists on this Mac; OpenAI is selected, so the Apple bridge is never asked. Model timings and
tokens below are the `[inference]` lines of the dev log (main writes one per call, purpose included).

## Checked

| Item | Expected | Observed |
| --- | --- | --- |
| 3.4 world streaming | cards fill in while the model writes | at 2.5 s the preview showed premise and a half-written tone ("城裡的人習… 正在寫…"); at 5 s all seven cards (`01`, `02`) |
| 3.5 look card | the bible has its own art direction | 7th card 外觀風格: "城牆是發黃的石磚與銅板…拱形遮沙棚…大型鐘面與齒輪管線…沙金、銅綠、灰白與油黑" (`03`); style.md of the published cartridge ends with that `Look:` line |
| 3.5 no Shōwa | bible, origin, witnessing | bible: brass/sand/clockwork, taboos include weapons; origin 醒沙地: `Floor(16,16,"sand")`, desert sky `#d8c29a`, props `steel_tower`, `signpost`, residents 阿時／銅伯; witnessed chunk 沙角: windmill, house, chimney, signpost, 5 rocks, custom 先掃門前沙. A grep of the save for 昭和／電線桿／自動販賣機／公車／巴士／鐵道／澡堂: 0 hits |
| 3.4 story streaming | chapter cards appear one by one | at 3 s: logline + chapter 1 half written; at 5.5 s: chapters 1–3 whole, chapter 4 cut mid-sentence (`04`, `05`) |
| 3.6 cloud origin | chat model writes the origin | build readiness says the chat model writes the start (`07`); origin = 2 calls (5,192 ms 2,824 + 716; 3,903 ms 4,243 + 698, one repair) → land (`08`); no Apple scene call in the log |
| 3.2 usage per call | purpose, model, in/out/cached, ms | e.g. `bible · openai gpt-5.4-mini · 5280 ms · 1159+443 tokens (0 cached)`; the origin repair was served 2,304 cached tokens, the second witnessing 2,816 |
| 3.2 draft → world | Create's calls count toward the world built from it | draft line after world + story: 2 calls · 1,862 in / 1,090 out; HUD right after build: 5 calls · 11,146 / 3,079 · cached 2,304 = bible + story + origin ×2 + first chapter, to the token |
| 3.2 usage screen | the world's total and its breakdown | panel (`11`): 10 calls · 17,952 in / 5,746 out · cached 5,120; by purpose 世界卡片 1, 故事計畫 1, 起點 2, 章節 1, 顯影 5; 3 calls marked "未回報 token" (cancelled), not counted as 0 |
| 3.3 witness cancel | request aborted in main, nothing written | 修正後: cancel 3.0 s in → `fail … · witness · … · 3017 ms · aborted`; HUD 已取消顯影 + 重新顯影 (`09`); the save had no `chunks/`; retry → 沙角 written (`10`) |
| 3.3 chapter cancel | request aborted in main, nothing written | second world 潮間燈塔: the background writer's 取消 clicked 1.5 s after the card appeared → `fail … · chapter · … · 1688 ms · aborted`; card: "chapter-cancelled · nothing was changed" (`12`) |
| 3.1 shared harness | witnessing and a chapter at once | 修正後: the chapter write and the origin witnessing ran together; the witnessing finished (潮石一角, 9,745 ms) — see bug 1 |
| Health | no renderer errors | `[renderer:ERR]` lines in the last run's dev log: 0 |

## Bugs found and fixed in this run

1. **修正前** the world harness (now mounted in Play, 3.1) was shared, and a DSL turn registered its
   `dsl-spec` section on it: the background chapter write and the first witnessing registered it at
   the same time, the second threw `prompt section "dsl-spec" is already registered` as an unhandled
   rejection, and the chunk stayed 顯影中 forever — so Cancel had no request to abort. 修正後 turn
   sections are passed into assembly for that turn only (`SystemPromptService.assemble(a, turn)`),
   a narrative turn never rejects, and a witnessing that throws shows the error with Retry.
   Regression test: `tests/harness/worldPrompt.test.ts` (4).
2. **修正前** an aborted OpenAI stream sometimes ended quietly instead of throwing, and main logged
   it `done` with no tokens. 修正後 main checks the signal after the stream and logs `aborted`.
3. **Not a regression, fixed anyway:** the second world's origin failed once after 2 repairs with
   "0 residents". Reproduced outside the app with the same prompt: the model named its statements in
   Chinese (`阿潮 = NPC(...)`), which the OpenUI parser skips without an error, and the repair round
   only said "0 residents". 修正後 such a program is refused as `dsl-invalid-name`, naming the
   statements; the next build of that draft succeeded (3 origin calls). Test: `tests/dsl/names.test.ts`.

## Not verified here

- 3.3 image cancel (AI Worlds) and 3.7–3.11: see `docs/e2e/milestone-rev6-land/`.
- The first cancelled witnessing logged 8,709 ms: the cancel was clicked later than it looked (the
  witnessing started only once the land had loaded). The timed retry (3.0 s → 3,017 ms) is the
  measurement.
- The biome vocabulary has no desert: the model picked `countryside`, and the HUD's 地貌 prints
  COUNTRYSIDE for this desert city. The engine's `steel_tower` sprite (a pylon) stands in for the
  clock tower. Sprites and biomes are one fixed set until phase 2's style references.
