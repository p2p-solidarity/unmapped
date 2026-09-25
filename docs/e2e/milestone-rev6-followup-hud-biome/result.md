# E2E · rev 6 follow-up · the HUD biome row (hud-biome)

The player card used to show the scene's engine biome id in capitals ("COUNTRYSIDE") everywhere,
including on open land. The change under test removes the row on open land and shows a
translated biome name in bounded scenes. This run checks both cases in the real app, in all three UI
languages, on a fresh throwaway userData.

## Replay

```bash
mkdir -p "$TMPDIR/ud-followup-hud-biome"                      # empty
AETHER_TEST_USER_DATA="$TMPDIR/ud-followup-hud-biome" bun run dev --remoteDebuggingPort 9337 &
CDP_PORT=9337 bun scripts/cdp-drive.ts "$(cat docs/e2e/milestone-rev6-followup-hud-biome/run.json)"   # `actions`
# stop the app, start it again on the same userData, then:
CDP_PORT=9337 bun scripts/cdp-drive.ts "$(bun -e 'console.log(JSON.stringify(require("./docs/e2e/milestone-rev6-followup-hud-biome/run.json").afterFix))')"
```

`actions` starts a New Game with the fixed seed `V6AU-HW5A`, asks for two places (one model call
each, plus repairs) and walks into them. `afterFix` is a new process on the same userData, so it
makes no model calls. The `eval` steps only read state. Every step that changes the game is a click
or a key. The walking holds depend on this seed's land and on where the model put the places. Model:
`openai · gpt-5.4-mini`. Window: 1440 × 868. The renderer ran on localhost:5174 because the user's
own dev server holds 5173.

## Checked

| Item | Expected | Observed |
| --- | --- | --- |
| Open land, zh-TW | no biome row; SEED / LAND, land status, divider, quests still there | card innerText: `無界之地 · V6AU-HW5A / 種子 V6AU-HW5A / 大地 0 · 0 / 已記 · 零零口 / 因果 1 筆 / 背包 … / 上次選擇：零零口 / 這一層沒有進行中的任務。`. No 地貌, Biome, バイオーム or COUNTRYSIDE. The 1 px divider sits on the column wrapper (`borderTop 1px`, `gap 4px`), above the quest line (`01`) |
| Open land, en / ja | no biome row | en at chunk 1 · 0: `SEED / LAND 1 · 0 / WRITTEN · 風停站邊 / KARMA …`, no Biome (`05`). ja: `シード / 大地 1 · 0 / 記録済み · 風停站邊 / カルマ …`, no バイオーム (`07`). After the fix, zh-TW at chunk 2 · 0: no row (`11`) |
| Side-scroller place 東沙丘 (written `countryside`) | translated name in every language | chunk `null` inside the place. zh-TW `地貌 鄉間` (`04`), en `Biome Countryside` (`06`), ja `バイオーム 田園` (`08`). After the fix: `地貌 鄉間` (`13`) |
| Dungeon place 冰洞迷迷宮 (written `snowfield`), code as handed over | the place's biome | **`バイオーム 田園`**, which is the land's origin biome (`worldStore.scene.biome` = `countryside`), not the place's `snowfield` (`10`). **FAIL** |
| Dungeon place, after the fix | `snowfield`, translated | zh-TW `地貌 雪原` (`12`), en `Biome Snowfield` (`14`), ja `バイオーム 雪原` (`15`) |
| `bun run check` after the fix | green | typecheck ok. biome: 657 files, no fixes. Line check: all ≤ 600. vitest: 102 files, 430 tests passed |

## Found and fixed during this run

- **Inside a place, the row named the land's biome, not the place's.** `HudSummary.biome` comes from
  `worldStore.scene`. While a place is played (`sessionStore.place`), that is still the land's
  origin scene. The first place happened to be written `countryside`, the same as the origin, so it
  looked right. I asked for a snowy dungeon to tell the two apart, and the snowfield dungeon showed
  田園. Fix, in `src/renderer/app/hud/PlayerCard.tsx`: the row now uses
  `useSessionStore(state => state.place?.graph.biome ?? null)` and falls back to `summary.biome`
  (a legacy bounded floor, where `worldStore.scene` is the scene played). `summary.ts` and its test
  are unchanged.

## Seen, not changed (reported)

- **The fix exposes a React dev warning, logged each time the player leaves a place through its exit:**
  `[renderer:ERR] Cannot update a component (`PlayerCard`) while rendering a different component
  (`LandView2D`). To locate the bad setState() call inside `LandView2D`, …`. It was logged twice in
  process 2, once for each exit through `E · 回到大地` / `E · 大地へ戻る`. To confirm the cause,
  I temporarily removed the new `place` subscription (HMR) and repeated enter and exit. No new line
  was logged. With the subscription restored, it comes back. The root cause is in
  `src/renderer/engine2d/LandView2D.tsx`: `useState(() => initialPlayer(graph))` calls
  `useSessionStore.getState().takeLandReturn()`, which writes to the session store *during
  render*. Before the fix, no component that renders after LandView2D subscribed to a session
  value that changes on leave. It is dev-only and the card updates correctly, but LandView2D should
  take `landReturn` outside render. That file is not part of this task, so I did not edit it.
- In a place, the quest line and the floor badge also come from the land's scene and the save's
  floor (`第 1 層` / `FLOOR 1`), and the dungeon card said "no active quests". The dungeon's stored
  program lists a `quest_1`. I did not check what the running graph held. This task did not cover
  either.
- The dock's camera readout shows raw engine ids in capitals (`鏡頭：SIDE · 場景鎖定`,
  `Cam: FPS · scene locked`), the same kind of problem this task fixed for the biome.
- At 01:51:31 in process 2 the log shows `[vite] .env changed, restarting server...` and the renderer
  reloaded to the title. This run did not touch `.env`. I continued the save and repeated the step.

## Numbers (dev log)

- Process 1: 6 model calls, `renderer:ERR` 0.
  - witness `零零口`: 6,463 ms, 3,304 + 813 tokens
  - place 東沙丘: 4,200 ms, 2,968 + 474 tokens, then a repair round of 2,633 ms, 3,794 + 378 tokens (2,816 cached)
  - witness `風停站邊` (1 · 0): 6,453 ms, 3,494 + 788 tokens
  - place 冰洞迷迷宮: 5,894 ms, 3,123 + 678 tokens
  - witness `高桿口` (2 · 0): 9,459 ms, 3,631 + 1,510 tokens
  - The HUD total matched: 6 calls · 20,314 in / 4,641 out · 7,936 cached.
- Process 2: 0 model calls. `renderer:ERR` 2, the warning above, both on leaving a place.
- The place entrances stood at chunk 1 · 0 and 2 · 0, as the wishes' "東" asked. The way back put the
  player at (80.5, 17.9) = gate + 1.4 south.

## Not verified

- A legacy bounded floor (not a place). There, `summary.biome` is the played scene's biome, which
  is the path the fallback keeps. It was not reached in this run.
- A scene whose biome did not parse (`hud.sceneNotParsed`).
- Any biome other than `countryside` and `snowfield`. Their names come from the same
  `hud.biome_<id>` keys, and typecheck keeps one key per `BIOMES` value.
