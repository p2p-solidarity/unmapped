# E2E · 2026-09-25 · play loop and continent entry

## Replay

From this worktree on macOS, start with an **empty** throwaway data directory and the configured
`openai · gpt-5.4-mini` provider. The UI language was zh-TW. The script is
[`run.json`](run.json); its complete CDP output from a fresh run is [`replay.log`](replay.log).

```bash
mkdir -p /tmp/unwritten-d-full-replay-20260925
AETHER_TEST_USER_DATA=/tmp/unwritten-d-full-replay-20260925 bun run dev --remoteDebuggingPort 9441
CDP_PORT=9441 bun scripts/cdp-drive.ts "$(cat docs/e2e/2026-09-25-play-loop/run.json)"
```

The final run used a newly empty `/tmp/unwritten-d-full-replay-20260925`. It took about 32 seconds
of scripted actions, including 25 seconds waiting for the model to write a dungeon. The model's
exact name and dialogue vary on replay.

## Observed

| Step | Result |
| --- | --- |
| Title | `加入大陸` appeared. With no saves, its panel said to create or start a game. [Title](01-title.jpg) · [panel](02-continent-title.jpg) |
| New game | `TEST2E2E` became `TEST-2E2E`; open land rendered in HD-2D. [Screenshot](03-land-hd2d.jpg) |
| Home door | `E` opened the four dials, this world's door number and the keepsake shelf. [Screenshot](04-door.jpg) |
| Look | After closing the door, `V` changed the HUD to `畫面：16-bit` and drew the pixel land. [Screenshot](05-land-pixel.jpg) |
| Title join | Returning to the title listed the saved world. Choosing it and dialing `ABCD23` reopened it; the HUD showed `大陸 ABCD23 · 已連線 · 0 位夥伴`. [Selection](06-title-saved-world.jpg) · [joined land](07-continent-joined.jpg) |
| Place | The tweak panel wrote a dungeon named `青苔洞窟` at chunk `(0, -1)`. The saved place had one NPC dialogue program (`keeper_a`, 154 characters). [Generation](08-place-generation.jpg) |
| Resident | The script teleported to the generated gate to avoid a long walk, pressed `E` to enter, then called the same `talkInPlace` handler that an NPC interaction uses. A dialogue card showed the stored NPC line and two choices. [Entry](09-place-entered.jpg) · [dialogue](10-place-resident.jpg) |

The main log contained four model requests during the run (land witnessing and place writing or
repair); it contained **zero** `[renderer:ERR]` lines. The dialogue handler reads the stored
program and does not call the model. The 3D renderer emitted two dependency deprecation warnings
when entering the dungeon.

`bun run check` passed after the run: typecheck, Biome, line limit, 93 test files and 385 tests.
Biome reported three existing `!important` warnings in `game.css`.

## Limits

The run did not obtain a keepsake, so it did not visually verify a nonempty shelf in either look.
No second peer joined the continent. Story chapter background generation, cancellation and gate
adoption were not exercised in this run. The gate setup teleport and NPC handler call use the real
renderer modules, but bypass the walking distance and NPC proximity controls.
The later guard against a model reply crossing into a different save was checked by `bun run check`
but was not exercised by this UI replay.
