# E2E · 2026-09-25 · New Game and land lighting

## Replay

Start the app with a fresh, throwaway `AETHER_TEST_USER_DATA` directory and debugging port 9360,
then run `CDP_PORT=9360 bun scripts/cdp-drive.ts "$(cat docs/e2e/2026-09-25-takeover-land/run.json)"`.
The recorded actions drive the background app over CDP; they do not use the player's real save.

## Observed

| Flow | Observation |
| --- | --- |
| Title → New Game | Title offered New Game; Seed screen showed zh-TW, ja-JP and en-US language choices. |
| Start | `TEST2E2E` normalised to `TEST-2E2E`; land opened at chunk `0 · 0` in HD-2D. |
| Morning | Day clock reported 9.15. The player, door, terrain and HUD were visible in `01-day-hd2d.jpg`. |
| Dusk and night | Dev clock holds at 19.5 and 23 changed the land's light in `02-dusk-hd2d.jpg` and `03-night-hd2d.jpg`. |
| Look switch | `V` changed the dock to `畫面：16-bit`; `04-night-pixel.jpg` shows the same land with the night colour wash. |
| Performance | On the fresh replay, the HUD displayed 44 FPS after loading and 56 FPS after switching looks. |

The model witnessed the origin chunk during the replay (`已記 · 新見崗`, one karma entry).
This run did not evaluate the generated content, combat, distant landmark visibility or a full
day cycle. The lighting hours were set using a development-only clock control so they can be
photographed without waiting sixteen minutes.

`bun run check` after integration: typecheck, lint, line limit and 95 test files / 396 tests
passed. Lint emitted the three existing `game.css` `!important` warnings.
