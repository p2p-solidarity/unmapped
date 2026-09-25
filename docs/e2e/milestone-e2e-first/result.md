# E2E milestone · test prune (boot → New Game → walk → switch look)

Session change: low-signal unit tests deleted (no app code changed), testing rules added to
CLAUDE.md Rule 0. This run checks the app still boots and plays after the change.

## Replay

```bash
mkdir -p "$TMPDIR/ud-e2e"   # must be empty: the run expects a fresh title menu
AETHER_TEST_USER_DATA="$TMPDIR/ud-e2e" bun run dev --remoteDebuggingPort 9333   # background
bun scripts/cdp-drive.ts "$(cat docs/e2e/milestone-e2e-first/run.json)"      # from repo root
```

Environment: macOS, dev build, empty userData, UI language zh-TW (system default, so the
`clickText` steps use 新遊戲 / 開始), inference preset `openai · gpt-5.4-mini` from `.env`.

## Checked

| Step | Expected | Observed |
| --- | --- | --- |
| Title | menu with New Game | 繼續遊戲 · 新遊戲 · 創作遊戲 · AI 世界 · 加入房間 · 卡帶 · 系統 |
| Seed | typed `TEST2E2E` is normalised | field read back `TEST-2E2E` |
| Start | land at the origin with the seed in the HUD | HUD `未記之地 · TEST-2E2E`, 大地 `0 · 0`, COUNTRYSIDE, door prompt `E · 開門` (`01-land-hd2d.jpg`) |
| Walk | Shift+D for 2.5 s moves the player east | origin door now west of the player, plateau and lake in view (`02-walked-east.jpg`) |
| Look | `V` switches HD-2D → 16-bit | dock reads `畫面：16-bit`, pixel land drawn (`03-land-pixel.jpg`) |
| Health | no renderer errors | `[renderer:ERR]` lines in the dev log: 0; HUD 60 FPS throughout |

Not verified: the model's first chunk witness was still running (`顯影中…`) when the run ended;
this run does not wait for or judge model output.

## Unit tests after the prune

`bun run check`: typecheck + lint (3 pre-existing `game.css` warnings) + line limit + vitest.
Vitest: 119 files / 834 tests → 93 files / 384 tests, all passing.
