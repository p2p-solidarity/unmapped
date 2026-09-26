# E2E milestone · Create a game with Apple's on-device model

The previous run ([apple-in-app](../milestone-apple-in-app/result.md)) moved Apple's chat into the
app but Create stopped at the world step: the model grew the rules list until the token cap, and
the repair was refused by main's token estimate. This run checks the fix — the bible answered under
guided generation, and every Apple call budgeted with the model's own token counter — through
Create's five steps and into the built world.

## Replay

```bash
mkdir -p "$TMPDIR/ud-apple-create"   # then write run.json's env.seed there as inference.json
AETHER_TEST_USER_DATA="$TMPDIR/ud-apple-create" bun run dev --remoteDebuggingPort 9361
CDP_PORT=9361 bun scripts/cdp-drive.ts "$(cat docs/e2e/milestone-apple-create/run.json)"
```

## Before the app: the bible call alone

`bible-bench` (a scratch script, not in the repo) assembled Create's exact bible request through the
harness — 1,231 input tokens, identical to the app's log — and sent it straight to the helper:

| Mode | Runs | Parsed | Output tokens | Time |
| --- | --- | --- | --- | --- |
| Text, temperature 0.9 (before) | 4 | 0 | 1,400 each (cap); longest repeat of one item 1–96 | 41–68 s |
| Text, nucleus 0.9 / top-40 sampling | 3 + 3 | 0 | 1,400 each | 40–52 s |
| Text, prompt says "exactly 4 rules, then close the list" | 3 | 0 | 1,400, 203, 1,400 | 10–44 s |
| Guided program (`program: BIBLE_SHAPE`) | 4 + 3 | 7 | 237–305 | 9.3–19.9 s |

In the guided runs the streamed deltas joined to exactly the final program text (3 of 3 checked).
Budget check on one prompt: the bridge counted 818 tokens and refused a 4,000-token minimum with
"needs 818 tokens of prompt and at least 4000 of answer, but Apple on-device holds 4096"; sent with
a minimum of 1 it answered with usage `input: 818` and gave the answer 3,254 tokens
(4,096 − 818 − 24 template reserve). Main's estimate for the same prompt is about 1,040.

## Observed in the app

| Step | Result |
| --- | --- |
| 世界 (bible) | 7 cards after 15,246 ms in one call: `bible · apple-fm system · 14000 ms · max 1400 · 1554+291 tokens` — no repair (`01-world-cards.jpg`). Rules and taboos are lists the model wrote; the name came from the idea. |
| 重寫這張卡片 (tone, note "更溫暖一點，提到傍晚的燈。") | Rewritten in 3,539 ms, 477+51 tokens; the new line mentions the evening lamps (`02-card-rewritten.jpg`). |
| 看樣子 + story in the background | Story plan done after 14,836 ms: logline and 5 chapters, one call `story · 14610 ms · max 3420 · 652+447 tokens` (the 3,420 is the bridge's own room). Three concept pictures from the image provider in 9.0–10.0 s (`03-look-and-story.jpg`). |
| 故事 → 重寫這章 (chapter 2) | 4,046 ms, `story-edit · 3880 ms · max 700 · 970+85 tokens` (`04-story.jpg`). |
| 建立 → quote → 建立並開始玩 | Quote shows the Apple origin call and "免費" (`05-build-quote.jpg`). Origin scene from the Apple scene bridge: 25,000 ms, 4,549 in / 510 out, 2,023 cached; the world was published and entered (`06-in-play.jpg`). |
| Draft total | 7 calls · 4,227 in / 1,690 out, every chat call answered on the first try. |

## Not yet: play after Create, on Apple

Once in the world, the first land calls still fail on Apple's 4,096-token context:

- **Witnessing** (`witness`, the land around the player): the prompt alone counts 3,494 tokens; the
  task's minimum answer is 1,280 (40 % of its 3,200 cap) and only 578 remain, so the bridge refuses
  with `model-context-too-small`. OpenAI's witnessing answers run about 1,500 tokens, so this does
  not fit a 4K model without a smaller prompt.
- **Chapter 1** (`chapter`, in the background): the first answer (2,241 + 271 tokens) was only the
  root line — `root = Chapter("霧島航程", "…", [老漁夫, 小蓮, 古織物, 古織物圖示])` — naming four
  children it never wrote. Its repair round counts 3,223 tokens and needs 960, with 849 left:
  refused. The HUD says "下一章尚未預先寫好" with the refusal's numbers.

Both are outside Create's steps. The chapter dialect is a tree (NPCs, their Talk and Choices,
monsters, treasures joined by statement names), so a guided answer for it needs a larger shape than
the bible's single call; witnessing needs a prompt that fits 4K. Not attempted in this run.

## Checks

- `swift test` (native/afm-bridge): 21 tests, 0 failures (4 new: literal escaping, prefix-stable
  streaming, the loop guard leaving a program alone, the loop guard cutting before the second copy).
- `bun run typecheck`, `bun run lint`, `bun run lines`: pass. `bun run test`: 159 files, 810 tests,
  all pass (one new: a bible written with JSON escapes reads back as the model's words).
- The loop guard was not triggered in this run (no free-text Apple answer looped).
