# E2E milestone · release check (model → Create four steps → relaunch → build → land → combat)

The first run after the six workstreams were merged into main. It walks the whole path a new
player takes, on a fresh userData, and it is where three of this session's fixes were found.

## Replay

```bash
mkdir -p "$TMPDIR/ud-release"   # must be empty
AETHER_TEST_USER_DATA="$TMPDIR/ud-release" bun run dev --remoteDebuggingPort 9333   # background
CDP_PORT=9333 bun scripts/cdp-drive.ts "$(cat docs/e2e/milestone-integration/run.json)"
# stop the app completely (electron-vite and Electron), start it again on the same userData, then:
CDP_PORT=9333 bun scripts/cdp-drive.ts "$(bun -e 'console.log(JSON.stringify(require("./docs/e2e/milestone-integration/run.json").afterRestart))')"
```

Environment: macOS 27, dev build, UI zh-TW (system default), model `openai · gpt-5.4-mini` chosen in
System → Model (key from `.env`). Waits are generous; model timings below are from the dev log.
The combat clicks are screen positions for a 1440 × 841 window and this world's seed: another
world or window size needs its own path to the monsters.

## Checked

| Step | Expected | Observed |
| --- | --- | --- |
| System → Model | cloud and local modes, real status | Cloud: OpenAI, key "from .env", sent only to `https://api.openai.com/v1`, online in 1,444 ms (`01`). Local: Apple on-device "detected on this computer", Ollama "not installed or started" (`02`); nothing saved by browsing |
| Title | one working Join | 修正前 both 加入房間 (legacy room: refuses every open-land world) and 加入大陸 were listed; 修正後 only 加入大陸 |
| Create · idea | gun world, zh-TW | name 霧港巡禮, one sentence, 冒險 · 槍, no story text (`04`) |
| Create · world | six cards, one call | 1 call, 4,584 ms, 1,123 + 461 tokens; cards: premise, tone, rules, never-appears, naming, voice (`05`); the rules say the fog monsters are real (fits a gun world) |
| Card edits | hand edit kept, one card rewritten | a line added to tone by hand stayed; naming rewritten from a note in 1,782 ms (612 + 147); the other four cards identical (`06`) |
| Create · story | always produced | no story text given → logline + 4 chapters (meet / search / fight / maze), 5,916 ms, 807 + 648 (`07`) |
| Chapter edits | rewrite, insert, move, lock | chapter 1 rewritten from a note (dusk, a lying old fisherman) 2,605 ms, 1,313 + 198; one chapter inserted before the last 3,236 ms, 1,340 + 267; chapter 1 moved down; the fight chapter locked (`08`) |
| Story-wide note | unlocked only | 4,373 ms, 1,568 + 699; the locked 堤上來的東西 kept its title and brief exactly; the other chapters changed (`09`) |
| Relaunch | draft survives | after killing the app: 霧港巡禮 · 故事 · 5 章 listed; same order, chapter 3 still locked (`10`) |
| Build review | real rules | "damage 22, range 22; 100 HP; monsters 30 HP + 10 per level" read from the compiled rules; route openai (`11`) |
| Build (修正前) | origin through the chat path | **failed**: 3 calls (4,825 / 3,502 / 3,893 ms) all without a Floor → `dsl-missing-floor` after 2 repairs; shown with its hint, draft kept, nothing published |
| Build (修正後) | lands in the world | 2 calls (3,940 ms 2,820 + 479; 3,307 ms 3,771 + 496, one repair) → the land; origin witnessed as 潮石角; chapter 1 started writing in the background (`12`) |
| Land | HD-2D, generated props | 120 FPS; generated windmill, utility pole, bus stop and rail track sprites in both looks; night lighting in HD-2D and 16-bit (`13`, `14`, `21`) |
| Combat | real-time foes fight back | a level-2 wisp and slime (at 33,31 / 34,31, computed from the seed) chased and hit: HP 100 → 94 → 40 → 34 → 0, then "本局結束 · 你倒下了 · 擊倒 0 · 分數 0"; "繼續四處看看" put the player home at 100 / 100 (`16`, `17`, `18`, `20`). The defeat screen was captured but its image was deleted by mistake |
| HD-2D foes | sprites follow the fight | **bug** 修正前: sprites stayed at spawn about 5 tiles from their level labels (`16`, `17`); 16-bit drew them together next to the player (`18`). 修正後, the pair at rest shows labels over sprites (`22`) |
| Health | no renderer errors | `[renderer:ERR]` lines in both dev logs: 0 |

Origin prompt, measured outside the app with the same prompt and this draft's world: before the
example 1 of 2 calls parsed (the other wrote `Scene("潮野", countryside_scene)` with no Floor);
修正後 4 of 4 parsed and 3 of 4 were fit on the first try (one had no residents, a normal repair).

## Not verified

- HD-2D foes **while moving** 修正後 (only at rest).
- Why HP fell ~54 in about 3 s once (the tuning allows at most one blow per 0.8 s, 6 HP at level 2,
  so ≤ 7.5 HP/s from any number of foes); a second approach to the same pair took 1 blow in 6 s.
  Needs a controlled repro before any fix.
- A kill and the felled ledger (no shot landed before the defeat), respawn after 600 s.
- Chapters played, places, backup export/restore, the continent, AI Worlds, Apple on-device /
  Ollama / llama.cpp generation, a packaged build.
- The player got wedged between rocks and bushes in the origin village several times.
