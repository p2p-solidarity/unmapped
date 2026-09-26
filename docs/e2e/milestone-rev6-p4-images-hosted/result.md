# E2E · rev 6 phase 4 · p4-images-hosted (D4 key order step 3: pictures through the gateway)

Plan item 3 of `docs/plans/rev6-phase4.md`: with no image key of the player's own, a picture goes
through the gateway's `test-image` and is metered; the gateway's ledger names purpose `image`, main
logs the picture, its licence record names `apache-2.0`, and the stored picture exists and
decodes. **Pass**, through Create's look step (the plan names an AI-world asset; no AI world can be
made while the model is the fixture, and the look step is the same `selectImageProvider()` →
`hostedImageProvider` path).

Model: pictures by `test-image` through the fixture upstream, which now answers a real 64 × 64
PNG (this run's fixture fix; before it, an 8-byte signature `resizeToPng` could not decode). No key
anywhere: `OPENAI_API_KEY` empty, no saved key, the repo `.env` blocked.

**Test data written by hand:** the look step needs world cards, and the fixture model (it only says
"Hello.") never writes them. The first action of `run-a1-sketches.json` saves draft
`81e0650a3a32abcd`'s seven cards and `step: "look"` through `window.seed.createDrafts.save`, the
app's own IPC. Nothing else was written outside the UI.

## Replay

```bash
# SP, services and app A as in milestone-rev6-p4-account (A signed in); blank() and drive() there.
blank bun run gateway -- grant <accountId> 40000 --data $SP/gw      # a picture holds 10,000 credits
D=docs/e2e/milestone-rev6-p4-images-hosted
drive 9340 $D/run-a1-sketches.json        # needs a Create draft whose name contains "A river delta"
drive 9340 $D/run-account-after.json
```

Environment: the snapshot tree (`git archive 51817a3` + this run's fixes, no `.env`), A restarted
with every key empty; gateway on the same `SP/gw` (granted 60,000 for 2026-09, 18,984 used before).
`looks/` holds one stored picture and the three licence records; `gateway-ledger-image.jsonl` the
six image lines.

## What was checked

| # | Expected | Observed |
| --- | --- | --- |
| 1 | No own key: pictures would go through the gateway | Settings → Images: OpenAI "In use", "Key: none", commercial mode off (`a-00`); route "Next call: OpenAI · no key → free allowance · test-chat" |
| 2 | The look step draws through the gateway's image model | Create → Continue (draft at the look step, `a-01`) → "Draw sketches" → three 512 × 512 sketches on screen (`a-02`); main `[look] done 1c4d30c2… · hosted · test-image · 276 ms · licence apache-2.0`, `done 687cc743… · 263 ms`, `done f2c6873a… · 265 ms` (the `[look]` line is Create's; `[image]` is the AI-world asset path) |
| 3 | A gateway line with purpose `image`, metered per picture | Ledger: 3 × `reserve … purpose "image" … model "test-image" credits 10000` at 03:46:49.275–.287Z, 3 × `settle … purpose "image" … input 50 output 4000 … credits 10000 charged "usage"` with `scope: null` at 03:46:49.503–.505Z; gateway log `settle … d6244533… test-image in 50 out 4000 credits 10000/10000 (usage)` (and `f3eeaaa4…`, `ec50aaaf…`) |
| 4 | Main's own usage ledger records them on the hosted route | `udA/usage.jsonl`: 3 lines `purpose "image"`, `scope {kind: "create", id: "81e0650a3a32abcd"}`, `provider "hosted"`, `model "test-image"`, `input 50, output 4000`, `outcome "done"` at 03:46:49.513–.520Z |
| 5 | The picture's licence record names `apache-2.0` | `looks/39824283d46c2b9b.json` (and `3fe7925e8b6f1bcb`, `86af815f25c0ce90`): `{"v":1,"sha256":"sha256:5d6492a2…ea6f","licence":"apache-2.0","provider":"hosted","model":"test-image"}`; `apache-2.0` is the gateway model's licence from `/v1/models`. Published: milestone-rev6-p4-licence's `e2e-look@1.0.2` carries this sketch and its hashed `assets/licences.json` says `"licence":"apache-2.0","inherited":false` |
| 6 | The picture file exists and decodes | three `looks/<id>.png`, 1,832 bytes each; `file`: "PNG image data, 512 x 512, 8-bit/color RGB"; `sips`: 512 × 512; `shasum -a 256` = `5d6492a2…`, the hash in each record; in the page `naturalWidth/Height` 512 × 512. One is kept here as `looks/39824283d46c2b9b.png` |
| 7 | The allowance moved by the picture price | `GET /v1/quota` 48,984 of 60,000 used (+30,000 = 3 × `perImage 0.01` = 3 × 10,000 credits); Account: "18% of the allowance left · 48,984 of 60,000 … · This computer this month: 4 calls through the gateway, 150 input and 12,000 output tokens · 1 call without reported tokens" (`a-03`: 3 pictures × 50 / 4,000 plus the charged-hold chat call of p4-quota) |

## Found on the way

1. **The fixture's picture could not be decoded** (fixed): the fake upstream answered
   `b64_json: "iVBORw0KGgo="`, a bare PNG signature, so `resizeToPng` (Electron's `nativeImage`)
   threw and no hosted picture could be stored. `tests/fixtures/gateway/upstream.ts` now answers a
   deterministic 64 × 64 RGB PNG (`solidPng()`, a tiny encoder in the fixture: IHDR, one deflated
   IDAT, IEND, CRC32); `file` and `sips` read it as 64 × 64, and main scales it to 512 × 512.
2. **Main's picture id and the gateway's request id differ.** `[look] done <id>` uses the
   renderer's request id, while `hostedImageProvider` sends a fresh `X-Request-Id` per picture, so
   a picture's gateway line cannot be matched by id the way chat calls can; above they are matched
   by time (the same 20 ms) and count. Passing the caller's id through `ImageOptions` would fix it;
   that touches `works/ipc.ts` and `workspaces/createDraftsIpc.ts`, outside this run's files, so it
   is left as a proposal.

## Not run

- An AI-world asset (the `[image]` path in `works/ipc.ts`, `licences.json` beside the work): an AI
  world needs model-written code, and the fixture only answers "Hello.".
- `images.edit` with a reference picture through the gateway: the look step draws without a
  reference; a world's later pictures would use one.
