# E2E · rev 6 phase 4 · p4-licence, commercial mode on (D4)

Plan item 5, the commercial-on half: with `UNMAPPED_COMMERCIAL=1`, Qwen-Image-2.1 cannot be
selected in Settings → Images; a revision that adds a picture whose licence is `unknown` is refused,
while a picture inherited unchanged from its parent is only listed; and the gateway refuses to start
with `GATEWAY_COMMERCIAL=1` while it serves a non-commercial model. **Pass**, with one honest
limit: no screen reaches a publish with a picture while the model is the fixture, so the publish
steps were driven through `window.seed.cartridges.publish` — the IPC Create's Build ends with — and
main's own publish-time audit decided them.

The commercial-off half (Qwen-Image-2.1 drawing a look through vLLM-Omni) is **not run (needs a
person's GPU endpoint)**.

## Replay

```bash
# App A as in milestone-rev6-p4-images-hosted (its draft 81e0650a3a32abcd holds the hosted sketches).
D=docs/e2e/milestone-rev6-p4-licence
drive 9340 $D/run-a1-base-commercial-off.json            # commercial mode off
# stop A; start it again with UNMAPPED_COMMERCIAL=1
drive 9340 $D/run-a2-commercial-on.json
# The gateway half (no app): the fixture upstream plus qwen-image-2.1 under qwen-research
mkdir -p $SP/gw-commercial; cp $D/gateway-commercial-upstreams.json $SP/gw-commercial/upstreams.json
cp $D/gateway-commercial-costs.json $SP/gw-commercial/costs.json
blank STRIPE_SECRET_KEY= STRIPE_WEBHOOK_SECRET= GATEWAY_COMMERCIAL=1 bun run gateway -- --port 8788 --data $SP/gw-commercial
```

Environment: the snapshot tree (`git archive 51817a3` + this run's fixes, no `.env`); A on `SP/udA`
with the gateway configured; `run-a2` after a restart with `UNMAPPED_COMMERCIAL=1` (build switch).
The publishing eval makes an open-land revision `e2e-look@<version>` from the built-in world's
origin scene with `openLandCartridge` (the renderer module Create uses) and a `look.png`:
`unknownA` = the fixture's 64 × 64 PNG (sha256 `56b99fb0…`, never drawn through this app, so no
licence record), `unknownB` = a 64 × 64 canvas fill, `hosted` = a p4-images-hosted sketch
(`apache-2.0`).

## What was checked

| # | Expected | Observed |
| --- | --- | --- |
| 1 | Commercial off: an unknown picture publishes, named `unknown` | `e2e-look@1.0.0` published (`sha256:3c7b4142…`); its hashed `licences.json`: `look.png` `unknown`, `inherited: false`, sha256 `56b99fb0…`; main `[licence] cartridge e2e-look@1.0.0 · look.png · unknown · non-commercial · added` |
| 2 | Commercial on: the Images panel says so | "Commercial mode is on (this build): only providers whose licence allows commercial use can draw." (`a-01`) |
| 3 | Qwen-Image-2.1 cannot be selected | Its row: "Licence: Qwen Research License · Commercial use: not allowed … Not available in commercial mode"; "Use for pictures" `disabled: true` (`a-01`); a click on it (at the eval's [742, 418]) changed nothing and logged nothing (`a-02`); main's own check, `window.seed.images.choose('qwen-image-2.1')` → `image-licence-noncommercial` "qwen-image-2.1 draws under Qwen Research License, which does not allow commercial use, and commercial mode is on (build)."; `[images] choose qwen-image-2.1 · image-licence-noncommercial`. `images.settings()` → selectable: `openai` (openai-terms) true, `qwen-image-2512` (apache-2.0) true, `qwen-image-2.1` (qwen-research) false |
| 4 | An inherited picture is listed, not blocked | `e2e-look@1.0.1` (lineage revision of 1.0.0, same `look.png`) published (`sha256:b7ddeefb…`); `licences.json` `unknown`, `inherited: true`; `[licence] cartridge e2e-look@1.0.1 · look.png · unknown · non-commercial · inherited`; `images.audit(1.0.1)` → rows `[{look.png, unknown, commercial: false, inherited: true}]`, `commercial {on: true, source: "build"}`, `blocked: []` |
| 5 | Adding an `unknown` picture blocks publishing | `e2e-look@1.0.2` with `unknownB` → refused `image-licence-redraw`: "Commercial mode is on (build): redraw these pictures before publishing, their licence does not allow commercial use: look.png." / "Draw them again with an image provider whose licence allows commercial use (Settings → Images), or replace them with your own files."; `[licence] cartridge e2e-look@1.0.2 · look.png · unknown · non-commercial · refused`; nothing written for 1.0.2 |
| 6 | A commercial picture publishes in commercial mode | `e2e-look@1.0.2` with the hosted sketch → published (`sha256:60b6c46f…`); `licences.json` `apache-2.0`, `inherited: false`, sha256 `5d6492a2…`; `[licence] … · apache-2.0 · commercial · added` |
| 7 | The gateway refuses to start commercial with a non-commercial model | `GATEWAY_COMMERCIAL=1 bun run gateway -- --port 8788 --data $SP/gw-commercial` → "gateway: GATEWAY_COMMERCIAL=1, but qwen-image-2.1 (qwen-research) may not be sold." / "Stop serving those models, or unset GATEWAY_COMMERCIAL.", exit 1, never listened (`gateway-commercial-refused.txt`) |

## Found on the way

1. **My first publish sent an empty picture, and main published it.** A shell mistake left the
   picture's base64 empty: `e2e-licence@1.0.0` went out with a 0-byte `assets/look.png`
   (sha256 `e3b0c442…`, the empty string's), audited as `unknown · added` with commercial mode off.
   The run then used the id `e2e-look`. The publish path does not refuse a 0-byte (or non-PNG)
   picture asset; worth a check where assets are validated (cartridges code, outside this run's files).
2. **A mis-click during the check:** `clickText "Use for pictures"` picked the smallest matching
   button, Qwen-Image 2512's (enabled), so the device choice became `qwen-image-2512`
   (`[images] choose qwen-image-2512 · ok`); it was set back to OpenAI (`[images] choose openai · ok`).
   The Qwen-Image-2.1 button was then clicked by position.
3. The refused commercial gateway had already written `admin-secret` and `gateway-key.json` into
   its data dir before refusing. Harmless (a later start reuses them), noted only.

## Not run

- Commercial mode off: Qwen-Image-2.1 drawing a look picture through vLLM-Omni — needs a person's
  GPU endpoint.
- Refusal through a screen: Create's Build (the one screen that publishes a picture) needs a
  model-written story and origin scene, which the fixture cannot give; covered via the same IPC.
- The gateway's `/v1/status` `commercial: true` as the switch (only the build switch was used).
