# E2E · rev 6 · witness names and Apple's 4K context

Two faults from `milestone-rev6-integrated-journey` (steps 3 and 11):

- **(A)** The model named chunk (2,0) "Chunk 2,0". It also gave land residents chapter 1's names
  (Bram, Tilly).
- **(B)** On Apple's on-device model every witness was refused before the call:
  `model-context-too-small`, "needs 4110 tokens of prompt and at least 1280 of answer, but Apple
  on-device holds 4096".

**Verdict: pass.**

- **Apple:** 3 of 3 witnesses were written in the recorded run: the origin, (1,0) and (2,0). They
  took 0, 0 and 1 repairs. The prompts were 2,051 to 2,482 tokens by Apple's own count, schema
  included. The answers were 655 to 865 tokens.
- **OpenAI** (gpt-5.4-mini, full prompt): 2 of 2 witnesses after chapter 1 was written, both with 0
  repairs. No place was named like a coordinate. No resident took a chapter person's name.
- **Earlier attempt:** one Apple attempt failed, and it is kept here. It named (1,0) after its
  neighbour three times. That was fixed, and the run was repeated from a fresh userData.

## What changed

- **(A) The full prompt:**
  - The rule "a place's name is a real name, never a coordinate, "chunk" or an id".
  - A `## Names already in use` section. It lists the places nearby, the residents of the
    neighbouring chunks and the people of every written chapter, nearest first.
  - The prompt no longer says "chunk (x, z)" in the user turn, the output section or the ground
    section.
- **(A) Parser check:** hygiene refuses a place named like "Chunk 2,0", "(2, 0)", 區塊 or an id. It
  also refuses a new resident who takes a name in use. Both go into the repair loop.
- **(B) Apple on a context under 8,192 tokens, the guided route:**
  - **Compact prompt:**
    - The bible's short lines: Premise, Tone, the first 3 rules, Naming, Voice and Look.
    - 4 hot lore lines and 1 old tale.
    - No flags or inventory.
    - Short witnessing rules and no Chunk spec.
  - **Chunk answer schema** (`src/dsl/chunkAnswer.ts`, made with `z.toJSONSchema`): the bridge's
    `chat` decodes against it.
  - **Writer:** `writeChunkProgram` checks the JSON with the same zod schema and writes an OpenUI
    Lang Chunk program. `parseChunk` then checks that program like any other.
  - **Repair:** a round asks again with only the complaints (`repairNote`). A 4K context cannot hold
    the rejected program twice.
  - **Budget:** max 1,500 answer tokens, min 1,100.
  - **Other routes:** big models keep the full prompt.

## Replay

See `run.json` (env, snapshot and launch commands). Each step file replays with:

```bash
CDP_PORT=9340 bun scripts/cdp-drive.ts "$(cat docs/e2e/milestone-rev6-witness-names-4k/run-NN-….json)"
```

The run used two apps, each on a fresh userData: the Apple run (steps 01–04) and the OpenAI run
(steps 11–15). New game rolls the seed, so names differ on a replay. Every model call is in
`model-calls.txt`.

## Apple on-device (in-app afm-bridge, no `fm serve`), UI and world in zh-TW

The zh-TW world is the harder case for 4K, because CJK text is longer in tokens.

| # | Step | Observed | Verdict |
| --- | --- | --- | --- |
| 01 | Settings → Model → 這台電腦 → Apple 裝置端 → 使用這個模型 → 檢查連線 | "已連線 · 40 毫秒 · 4096 token 上下文（model）". Config `apple-fm` / `system`, `sidecar: null` (`01-apple-model.jpg`) | pass |
| 02 | Worlds → Start: origin (0,0) witnessed on entry | Written in 42.9 s wall; the call was 42,539 ms, run beside chapter 1's call. **2,051 + 697 tokens**, max 1,500, ctx 4096, **0 repairs**. **小山腳**: 阿明 (farmer), 小芳 (child), 老張 (merchant). Custom 留空地. All three stand east of the village, x 24–27 (`02-apple-origin-*.jpg`) | pass |
| 03 | Walk the z=16 ford into (1,0) | Written in 40.4 s wall; call 37,769 ms. **2,271 + 865**, max 1,500, **0 repairs**. **青竹旁**: 志雄 (farmer @28,17), 麗珍 (merchant @7,17), 建華 (elder @28,6). Props: chimney, utility_pole, rail_track, house, vending_machine. Custom 留土角 links `custom@0,0`. It varies the origin's 留空地 (`03-apple-1-0-*.jpg`) | pass |
| 04 | Walk on into (2,0), chapter 1's gate chunk | Round 1 was 25,261 ms, 2,365 + 655. It was **refused by the new name check**: "3 problem(s) … resident_1 is called "志雄", like someone who already lives nearby" (志雄 was (1,0)'s). One brief repair: 23,782 ms, 2,482 + 695. Written in 51.9 s wall. **松葉溪**: 俊彥 (smith), 雅婷 (merchant), 承志 (farmer). Custom 留鐵 links `custom@1,0` (`04-apple-2-0-*.jpg`, `04-apple-end.jpg`) | pass |

- **Usage panel:** "本世界：7 次 · 輸入 17,216 / 輸出 3,473 · 快取 0". That is 4 witness calls and
  3 chapter calls.
- **Room left for the answer:** the largest prompt was 2,482 tokens. That leaves 4,096 − 2,482 −
  24 = 1,590 for the answer. The bridge granted the full 1,500 every time. No answer ended by
  `length`.

**Attempt 1** (screenshots `a1-*`, before the fix):

- The origin was written: 翠峰, 26.5 s, 2,038 + 617, 0 repairs.
- **(1,0) failed.** All 3 rounds (2,241 + 811, 2,297 + 969, 2,297 + 773) named the place **翠峰**,
  the neighbour's name. The error read `dsl-invalid-chunk … "翠峰" is already the name of something
  the world remembers (still invalid after 2 repair rounds)`, after 93.8 s.
- **Why:** the repair hint said "link to the existing node", which a guided answer cannot do. The
  prompt never said this is another place.
- **Fix:**
  - The names section lists "Places nearby: … This is another place".
  - The schema's `name` says "a new name, not 翠峰".
  - A clash on a place name now reads "already the name of another place. This is a different
    place: give it a name of its own".

**Attempt 2** (`a2-*`) was abandoned. Step 01 clicked 設定 before the title was ready, so the model
stayed openai, and step 02 ran on it: 4 openai calls. Step 01 now waits for the title.

**Chapter 1 on Apple** (not this change): 3 calls, all invalid.

- Round 1: `/action` "look". Round 2: "pass". In attempt 1, `/role` "農夫".
- In attempt 1 the chapter's repair was refused before calling (`model-context-too-small`, 179 ms).
  Its repair holds the rejected program twice.
- No chapter was written on Apple, so there were no chapter people to avoid. The name check still
  worked against the neighbours (step 04).

## OpenAI gpt-5.4-mini (full prompt; UI and world en-US)

| # | Step | Observed | Verdict |
| --- | --- | --- | --- |
| 11 | Settings → English; model | `openai` / `gpt-5.4-mini`, probe context `null`: the full prompt (`11-openai-model.jpg`) | pass |
| 12 | Worlds → Start | **Origin**: 5,381 ms, 3,402 + 1,164 (2,304 cached), 0 repairs. **Windmill Field**: Raiko, Sumi. **Chapter 1** "The Twice-a-Day Bus": 5,851 ms, 2,157 + 892. Its people are **Mio, Ken, Sumi** (`12-openai-origin-and-chapter.jpg`) | pass (see finding 1) |
| 13 | Into (1,0) | 4,791 ms, 3,592 + 1,016 (2,304 cached), **0 repairs**. **Shore Stop**: Haru, Nori, Emi. Names in use were Raiko, Sumi, Mio and Ken; place nearby was Windmill Field. Custom "The pole gets the first nod" links `field_wind_rule@0,0` (`13-openai-1-0-*.jpg`) | pass |
| 14 | Into (2,0), the chapter gate | 6,157 ms, 3,739 + 1,381 (2,816 cached), **0 repairs**. **Stone Shore**: Sawa, Tetsu. Names in use were Haru, Nori, Emi, Mio, Ken and Sumi; places nearby were Shore Stop and Windmill Field. Custom "The bus gets the first wave" links `pole_first_nod@1,0` (`14-openai-2-0-*.jpg`) | pass |
| 15 | Check | Place names: Windmill Field, Shore Stop, Stone Shore. `bookkeepingNames: []` and `witnessResidentsReusingChapterNames: []` (`15-openai-end.jpg`) | pass |

- **Prompt size:** the full prompt with the new names section was 3,402 to 3,739 tokens. The
  integrated journey measured 3,389 to 3,709.
- **"Names in use":** the list for (1,0) is how the land stood when (1,0) was witnessed. The list
  step 15 printed also held (2,0)'s residents, which came later.

## Design measurements (bridge-direct prototype, before the app run)

These are not app numbers. They were measured by driving the rebuilt `afm-bridge` over stdio from a
scratch script, with the built-in bible. Prompt counts use the bridge's own `tokenCount`: a request
with `minTokens` 32,768 is refused, and the refusal states the count before anything is generated.

- **Pattern guide:** a JSON Schema `pattern` guide fails: "An unsupported generation guide was
  used". Clothes colour is therefore a hue (0..359), written as a fabric-tone hex.
- **Guardrail:**
  - The prompt with the bible's "Never:" list plus our "No heroes, no assistant voice, no vague
    mystery words" line was refused 4 of 4 times as "Detected content likely to be unsafe".
  - Without either line it was refused 0 of 4 times.
  - The compact prompt leaves out the Never list. The schema has no slot for what it forbids, and
    hygiene still reads every word.
- **Schema size:** the schema cost 1,448 tokens at first, 1,130 after trimming descriptions, and
  1,202 in the final version.
- **Tile coordinates:** asked for x/z tiles, the model put every resident on tiles 0–1. The answer
  now names one of 9 parts (north-west … south-east), and the writer places each thing on a tile of
  its part.
- **Results after tuning** (answers were 525 to 827 tokens):
  - English at (1,0): 3 of 3 written in 19 to 27 s, with 0 repairs.
  - Origin: 1 of 1.
  - zh-TW at (1,0): 1 of 1, 2,258 + 825 tokens.
- **Before tuning:** one answer ran to the 1,800 cap. The cap is now 1,500.

## Findings

1. **Chapter 1 and the origin share a name.** At New game, the origin witness and chapter 1 are
   written at once. Neither can see the other's people, so "Sumi" is in both (OpenAI run). A witness
   written after a chapter sees the chapter's people (steps 13–14). The chapter prompt is not given
   names in use. That is outside this change (`src/renderer/narrative/chapter.ts`).
2. **Apple cannot write chapter 1.** Its words fall outside the vocabulary: actions "look" and
   "pass", role "農夫". A second repair does not fit in 4K. A guided chapter, like this witness,
   would fix both.
3. **Apple's words are flat.** For example, every answer label repeated the place sentence at
   (2,0). The parser accepts them. Only a larger model improves this.
4. **A guided witness streams no words to viewers.** Its JSON is not a program until it is written,
   so on a shared world viewers get each round's written program at once, when the round ends. With
   no relay (a local world), nothing is streamed anyway.
5. **Not run:** llama.cpp or Ollama on a small window still get the full prompt, and the budget
   refuses it as before. Neither is installed with a 4K setup here. Only Apple's route is guided.

## Checks

- `bun run check`: typecheck, biome, line limit and vitest all pass (162 files, 831 tests). This
  includes `tests/dsl/chunkAnswer.test.ts` (5 tests, the writer's untrusted-input failures).
- `swift test` in `native/afm-bridge`: 21 tests, 0 failures.
