# E2E · rev 6 · chapters on Apple's 4K model, and chapter names of their own

Two findings of `milestone-rev6-witness-names-4k`:

- **(A) Name clash.** At New game the origin and chapter 1 are written at the same time and neither
  saw the other: "Sumi" was in both. The chapter prompt was never given the names in use.
- **(B) Apple could not write a chapter.** It wrote actions "look" / "pass" and the role "農夫", and
  its second repair did not fit in 4096 tokens.

**Verdict: pass.**

- **Apple** (recorded run, zh-TW): chapter 1 was written by Apple in **16.8 s, 1,515 + 597 tokens,
  0 repairs**, beside the origin witness. The player walked to its gate, met its 3 people and opened
  its 3 finds, and the host **cleared it** (a `chapter.cleared` deed). Chapter 2, started by the
  clear, was refused once for taking an origin resident's name and written in the repair.
- **Names**: no name is shared by any two of the origin, (1,0), (2,0), chapter 1 and chapter 2
  (14 names). On OpenAI, chapter 1 and the origin share none either.

## What changed

- **Names in use for chapters.** A chapter's prompt lists the names near its gate and in the
  story: the residents of the origin and of the land within two chunks of the gate, and the people
  of every other written chapter, nearest first (`app/land/names.ts`, `chapterNamesSection`). The
  parser sends back a chapter person who takes one, through the witness's own hygiene check, into
  the repair loop (`ChapterContext.names`; `PlaceContext.names` for a climb or maze chapter).
- **New game: each gets the other's names once known, nothing is sequenced.** The names are read
  again at every check (`namesNow`), for the chapter and for the witness. Whichever of the origin
  and chapter 1 lands second is held to the first one's names, and a clash costs one repair.
  Neither waits for the other, so the first walk is not slowed. On Apple both calls ran at once:
  chapter 1 in 16.8 s, the origin in 33.2 s.
- **Guided chapters on Apple** (route `apple-fm` and a window under 8,192 tokens, `narrative/route.ts`):
  - **Schema:** `src/dsl/chapterAnswer.ts`, one zod shape. Roles, moods, actions
    (`WITNESS_ACTIONS`), monster kinds and levels come from the shared vocabulary. The answer has
    1–3 people with 1–2 answers each, 1–3 finds with 1–2 things each, and 2–4 foes only when the
    game has combat. The schema has no slot for a foe otherwise.
  - **Writer:** `writeChapterProgram` checks the JSON with the same shape and writes a Chapter
    program, which `parseChapter` then checks.
  - **Prompt:** `prompts/chapterCompact.ts`, plus the bible's short lines (`compactBibleSection`)
    and the compact lore around the gate.
  - **Compact assembly:** it now also drops the authored scene's floor, cast, monsters and quests,
    for any purpose (`worldContext.ts`).
  - **Repair:** a brief repair with the complaints alone (`repairNote`).
  - **Budget:** max 1,300 answer tokens, min 900. Big models keep the full prompt.
- **No `gives` in a guided answer.** The first schema let each answer hand over "[] or one thing"
  (an array with at most one item). Every guided call that carried it failed at once with
  `LanguageModelError -1`, 7 of 7 (attempt 1). It also failed the witness written beside it.
  Without it the same schema answered. A guided chapter now gives through its finds.
- **Witness side.** The chunk answer's resident name lists the names in use, as the chapter's does.
  In attempt 2, with the list only in the prompt, Apple copied 建國 (chapter 1) twice at (1,0) and 立國
  (a neighbour) twice at (2,0), and (2,0) failed. Shared helpers moved to `src/dsl/answer.ts`.
  `uniqueId` no longer writes ids the parser cuts back into one (a name longer than 32 ascii
  characters, twice).
- **Place chapters.** A climb or maze is not in the Chapter dialect. It is a Place program
  (`placeLibrary`, shared with Tweak → Add a place), so it is not guided here. It gets the names in
  its prompt and check on every route. It was not run: the built-in story (meet / search / meet)
  has none.

## Replay

See `run.json` (env, snapshot, launch). Each step replays with:

```bash
CDP_PORT=9340 bun scripts/cdp-drive.ts "$(cat docs/e2e/milestone-rev6-chapter-apple/run-NN-….json)"
```

Two apps, each on a fresh userData: Apple (steps 01–05) and OpenAI (step 11). New game rolls the
seed, so names differ on a replay. Every model call is in `model-calls.txt`.

## Apple on-device (in-app afm-bridge), UI and world zh-TW

| # | Step | Observed | Verdict |
| --- | --- | --- | --- |
| 01 | Settings → 模型 → 這台電腦 → Apple 裝置端 → 使用這個模型 → 檢查連線 | "已連線 · 27 毫秒 · 4096 token 上下文（model）"; config `apple-fm` / `system` (`01-apple-model.jpg`) | pass |
| 02 | 世界 → 開始 (New game); origin and chapter 1 written at once | **Chapter 1**: done 17.6 s after Play. Call 16,842 ms, **1,515 + 597 tokens**, max 1,300, **0 repairs**. **最後站**: 志明 (farmer, calm), 美玲 (elder, wary), 大三 (child, joyful), each with a line and 2 answers; finds: 破舊的行李箱 / 縫補過的燈泡, 褪色的帳篷碎片 / 帶有紋理的紙張, 鐵匠的工具圖 / 舊日的紙幣印記. **Origin**: done 33.7 s; 33,160 ms, 2,038 + 587, 0 repairs. **鐵塔**: 明雄 (farmer), 芳芳 (child). Shared names: **none**. The chapter landed first, so the origin's check included 志明, 美玲 and 大三 (`02-apple-*.jpg`) | pass |
| 03 | Walk the z=16 ford east to the gate (80.5, 16.5) | **(1,0)** 松枝谷: 文文, 桂桂, 志成. 21,969 ms, 2,281 + 815, 0 repairs. **(2,0)** 羅麻地: 建建, 雅雅, 志遠. Round 1 (17,853 ms, 2,382 + 641) was refused: "resident_1 is called "文文", like someone who already lives nearby". Round 2 (19,412 ms, 2,467 + 695) was written. At the gate the HUD reads "故事 0/3 · 下一章：The Twice-a-Day Bus（Last Stop）… 交談 3 · 尋找 3", and the 3 people and 3 finds stand around the gate (`03-apple-*.jpg`) | pass |
| 04 | Play chapter 1 through (walk up, A to talk or open, A through the lines) | Met 美玲, 大三, 志明 and opened find_2, find_1, find_3 in 13.7 s. **The host cleared e1**: `cleared: true`, a `chapter.cleared` deed at (2,0) (not pending), and the 6 things carried under "The Twice-a-Day Bus". HUD: "章節通關：The Twice-a-Day Bus", "故事 1/3 · 下一章：What the Wind Took"; usage 本世界 5 次 · 輸入 10,683 / 輸出 3,335 (`04-apple-chapter-cleared.jpg`) | pass |
| 05 | Chapter 2 (written ahead once e1 cleared); every name of the run | Round 1 (18,967 ms, 1,838 + 653) was **refused**: "person_2 is called "芳芳"" (the origin's). The brief repair (18,520 ms, 1,923 + 631) wrote **風車台地**: 永信, 麗萍, 國華. `sharedNames: {}` over the 5 groups (`05-apple-end.jpg`) | pass |

- **Tokens:** the largest chapter prompt was 1,923 tokens (brief repair, schema included, Apple's
  count). That leaves 4,096 − 1,923 = 2,173 for the answer, above the 1,300 cap. The answers were
  493 to 653 tokens. None reached the cap.
- **Before this change** (witness-names-4k run) Apple's chapter prompt was 2,288 tokens, and its
  repair needed 2,854 to 2,905 or was refused (`model-context-too-small`).

## OpenAI gpt-5.4-mini (full prompts), UI and world zh-TW

| # | Step | Observed | Verdict |
| --- | --- | --- | --- |
| 11 | Model check; 世界 → 開始 | Config `openai` / `gpt-5.4-mini`, probe context `null` (the full prompts). **Origin** 風車田: 紀 (farmer), 小紗 (child). Round 1 (6,953 ms, 3,400 + 1,129) was refused ("Lore id "" is empty"); round 2 (3,368 ms, 5,249 + 893, 2,816 cached) was written; done 10.8 s. **Chapter 1** 末班車站: 田吉, 美代, 小春; find 木頭車牌. Round 1 (6,354 ms, 2,167 + 880) was refused (CJK statement names); round 2 (4,427 ms, 4,232 + 751, 1,792 cached) was written; done 11.3 s. Shared names: **none** (`11-openai-origin-and-chapter.jpg`) | pass |

- **Calls:** 4 OpenAI calls. Both repairs were for faults unrelated to names, the same two this model
  showed in the witness-names run.
- **Timing:** going by the call times, chapter 1's second check ran after the origin was drawn, so
  it was held to 紀 and 小紗.

## Earlier attempts (kept)

- **a1** (`a1-*`, `run-a1-*`), with the first chapter schema:
  - **02:** chapter 1 and the origin failed together at 31 s (`bridge.generation_failed`,
    `LanguageModelError -1`).
  - **02b:** both retried together, and both failed at 22.7 s.
  - **02c:** the origin alone was written: 火炭山, 阿明 and 小麗, 1 repair.
  - **02d:** the chapter alone failed in 909 ms.
  - **Diagnosis:** calls straight to the same bridge binary.
    - Plain chats, two at once, and two small guided chats at once all answered.
    - The chapter schema failed with and without `minLength`. It answered with `gives` removed.
    - `gives` with `minItems: 0`, or kept while `loot` changed, still failed.
- **a2** (`a2-*`), with `gives` removed:
  - **Chapter 1:** 15,484 ms, 1,515 + 525, 0 repairs; 建國, 文珍 and 茂珍. The origin (龍尾場: 阿明,
    小梅, 老張) shared none of them.
  - **(1,0):** Apple reused 建國 in rounds 1 and 2 and was written in round 3.
  - **(2,0):** it reused 立國 twice, and round 3 ran to the 1,500 cap ("props: Too small"). The
    chunk failed.
  - **Chapter 1 cleared:** after the helper stood where 建國 was nearer than 茂珍 nine times,
    `run-a2-04b` walked round to her.
  - **Chapter 2:** 14,581 ms, 0 repairs; 建豪, 美玲 and 李志.
  - **What changed after a2:** the chunk schema's resident name got the names in use, and step 04
    got a stricter standing spot.

## Findings

1. **Apple copies listed names.**
   - With the names only in the prompt, Apple reused one in 4 witness rounds of a2.
   - Named in the schema too, it reused one in 1 witness round and 1 chapter round of the recorded
     run, and each was written in the next round.
   - The parser's check is what keeps names apart. The schema description only makes a clash rarer.
2. **Apple's guided decoder fails on an array that may be empty** (`LanguageModelError -1`, before
   generating). The chapter and chunk answers now have none. The bridge does not refuse such a
   schema up front.
3. **Apple's words are flat and sometimes slip.**
   - a2's chapter 2 wrote "醃 plum 罐子", Latin inside zh-TW, which hygiene does not catch.
   - The recorded chapter 2 copied three of chapter 1's carried things as its finds.
   - The chapter 1 brief asks for "a keepsake for listening". With no `gives`, it is a find.
4. **A small race is left.** If two answers land within one append (main's append and the fold),
   neither check sees the other. This was not seen in 3 runs.
5. **Not run:**
   - A climb or maze chapter, on any route.
   - A combat chapter in the app. The combat schema answered once from the bridge directly: 860 +
     635 tokens.
   - llama.cpp or Ollama on a small window still get the full prompt.

## Checks

- `bun run check` on the snapshot (origin/main + this change): typecheck, biome, line limit and
  vitest all pass (163 files, 837 tests). This includes `tests/dsl/chapterAnswer.test.ts`: 6 tests,
  the writer's untrusted-input failures, with 400 seeded answers, of which 210 are written and
  190 refused.
- **The shared working tree fails.** Its `bun run check` fails at typecheck on
  `tests/dsl/modelMistakes.test.ts`. That untracked file is another session's work in progress and
  imports `parseOrigin` and `refuseRedefined`, which do not exist yet. It is not part of this change.
- **No Swift changed**, so `swift test` was not needed. The bridge was only built in the snapshot.
