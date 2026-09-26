# E2E · rev 6 phase 3 · `presence` (D17)

Plan row: interpolated steps stay under 0.3 tiles per frame at 60 Hz for 2 s. The emote bubble
shows in both looks on both machines.

**Verdict: pass.** Largest interpolated step at 60 Hz: **0.1287 tiles**. Bubbles showed in HD-2D
and 16-bit, on A and B, for both players' emotes. No model call was made in this flow.

## Replay

This flow starts where `milestone-rev6-p3-together` ended: world `hryt3f2x…d4bgq`, A (CDP 9353)
and B (CDP 9354) in Play in chunk (-1, 0), online. The environment is the same as in
`milestone-rev6-p3-offline-visit`.

```bash
D=docs/e2e/milestone-rev6-p3-presence
step() { CDP_PORT=$1 bun scripts/cdp-drive.ts "$(cat "$D/$2")"; }
step 9354 run-01-b-presence-b-record.json      # B records every presence frame it receives
step 9353 run-02-a-presence-a-walk.json        # A sprints 20 tiles west, then walks 15 back
step 9354 run-03-b-presence-b-replay.json      # replay at 60 Hz through engine2d/remoteMotion.ts
step 9353 run-04-a-presence-emote-A.json & step 9354 run-05-b-presence-emote-B.json; wait
```

Step 3 contains A's author key as a literal (`k7a2usubb4…`). On a replay, put the other device's
key there.

**How the 60 Hz check is measured.** B records each presence frame main relays
(`window.seed.world.onPresence`), stamped with `performance.now()` on arrival. B then feeds those
arrivals, at their real arrival times, through the app's own pure `receiveSample` /
`advanceMotion` (`engine2d/remoteMotion.ts`, the functions `sampleRemotePlayers` runs each frame)
on an exact 1000/60 ms clock. For every frame it records the distance the drawn figure moves. The
page's own draw loop is not sampled: calling `sampleRemotePlayers` from outside would advance the
tracks a second time per frame.

## What was checked

| # | Check | Observed | Verdict |
| --- | --- | --- | --- |
| 1 | Presence arrives | B received **30** frames from A in **7,496 ms**: mean gap **258 ms**, largest gap **501 ms** (the sender ticks every 250 ms and sends only on change). A went from x = -8.52 to -28.0 (sprint), then back to -13.19 (walk) | pass |
| 2 | Interpolated steps < 0.3 tiles/frame at 60 Hz for 2 s | **485** frames simulated at 60 Hz. Largest step over the whole walk: **0.1287** tiles. The busiest 2 s window (120 frames from 1,050 ms) covered **14.097** tiles in total, with a largest step of **0.1287**. Frames with a step ≥ 0.3: **0**. B's live frame rate during the walk was **32 fps** (rAF deltas) | pass |
| 3 | Emote bubble in HD-2D on both machines | At the same moment A picked wave (T, 1) and B picked heart (T, 5). A's roster read `own: wave`, others `[{name: "Bea", emote: "heart"}]`. B's read `own: heart`, others `[{name: "player-B7WR", emote: "wave"}]`. Both bubbles are drawn over the right heads (`p-a-00`, `p-b-00`) | pass |
| 4 | Emote bubble in 16-bit on both machines | V switched both to `pixel`. A picked cheer (T, 3) and B picked laugh (T, 4). A: `own: cheer`, Bea `laugh`. B: `own: laugh`, player-B7WR `cheer`. Both bubbles are drawn (`p-a-01`, `p-b-01`) | pass |
| 5 | No model call | No `[inference]` line on A or B during steps 1–5 | pass |

## Found here

1. **In the 16-bit look a remote player's name sits on their head and is hard to read.**
   `p-a-01-zoom-remote-label.png` is a crop of `p-a-01`. "Bea" is drawn in light text across the
   top of the sprite, under the emote bubble. The HD-2D look puts the name above the figure,
   readable (`p-b-00`: "player-B7WR"). The label comes from `engine2d/canvasRenderer.ts`
   (`pushActor(…, { text: other.name, color: LAND_2D_PALETTE.remote })`), the continent-era drawing
   of other players. Not changed here.

## Files

- `run.json` plus one `run-NN-*.json` per step (ports as listed).
- `p-a-00-emote-hd2d.jpg`, `p-b-00-emote-hd2d.jpg`, `p-a-01-emote-pixel.jpg`,
  `p-b-01-emote-pixel.jpg`; `p-a-01-zoom-remote-label.png`, a crop of `p-a-01` made with PIL.

## Fixes after the run

**The 16-bit remote name is legible now (fixed).** `pushActor` in
`src/renderer/engine2d/canvasRenderer.ts` draws a label (a remote player's name, a foe's level)
on a plate above the head. The plate uses the emote bubble's look: `LAND_2D_PALETTE.markerSurface`
fill, with edge and text in the label's colour (`remote` for players), in a 600-weight
0.3-tile font. The label no longer sits across the sprite. The pixel emote bubble
(`engine2d/presenceLayer.ts`) moved from 0.8 to 1 tile over the tile centre, so it clears the
plate. No new colours.

**Re-check** (origin/main `6949a97` snapshot plus the change). This used the door re-check's
shared world: A (9348) owns it, and B (9349, "Bea") joined through the UI. Both were in Play and
online, about 3 tiles apart. No model was used.
- `fix-run-01`: A pressed V (16-bit). The roster read `[{"name":"Bea","x":12.22,"z":10.22}]`,
  with A at 9.32, 11.43. "Bea" sits on a dark plate above the sprite and reads clearly on the
  light grass (`fix-a-00`, crop `fix-a-00-zoom-name-plate.png`).
- `fix-run-02` then `fix-run-03`: B emoted laugh (T, 4), and A's roster read
  `[{"name":"Bea","emote":"laugh"}]`. The bubble stands above the plate, and nothing overlaps
  (`fix-a-01`, crop `fix-a-01-zoom-name-plate-emote.png`).
