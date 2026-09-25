# Rev 6 phase 2 — Genesis, controls, one 2D (創世、操作、收斂)

Status: design for the phase-2 implementation run (2026-09-26). Direction: `docs/rev6-ai-brief.md` §4
and `docs/rev6-engineering.html` ("後面三段"). Phase 1 (§3.1–3.11) is done and verified.

## Done looks like (from the direction doc)

1. A new player goes from a few words to walking in a few minutes, and always has something to do
   while the model works.
2. With no keyboard and no mouse, a gamepad plays from the title through the first chapter.
3. Inside the game there is only one 2D engine: places run on engine2d, AI Worlds are places on the
   land (異界), R3F / Rapier are frozen for legacy bounded scenes only.

## Decisions

### D1. Create: a few words → cards → look → story → confirm with a quote → build
- **Idea** needs only the words. The name is optional; an empty name is taken from the first clause
  of the words and stays editable on the world step (editing the name alone never makes the world stale).
- **World cards**: each card can be edited, rewritten alone, or **locked**. A locked card is never
  overwritten; "rewrite the unlocked cards" rewrites the rest in one call with the locked cards as
  fixed context. Draft field: `world.locked: BiblePart[]` (absent in old drafts = none locked).
- **Look (看樣子)**: three low-quality concept pictures drawn from the Look card + premise. The player
  picks one, redraws, or continues without one. No image provider / no key is an `error` with a hint,
  and the step can still be passed (the world then has no look picture). Candidates live in the
  draft's workspace folder; the chosen one is published in the cartridge as the asset `assets/look.png`
  (the pack format accepts only core/style/story under `bible/`), hashed with everything else (Rule 9).
  Draft fields are optional so older drafts parse: `world.locked`, `look` (candidates, chosen,
  skipped). While the pictures draw, the story plan streams in the background, so the player is
  never just waiting.
- **Confirm with a quote**: the build step shows, before the button, the calls Build will make
  (origin: 1, plus up to 2 repairs), the estimated input tokens measured from the actual prompt text,
  the output cap, what this draft has already used (usage ledger), and money only when the selected
  model has a price entry in `src/shared/pricing.ts` (dated, with its source); a local model is free;
  an unknown model says "price unknown" — never a made-up number. It is labelled an estimate. Every
  price carries the official pricing page URL and the date it was read. The background write of
  chapter 1 that Build starts is listed as its own line.
- **Build**: the origin is written and published, and the player is let in at once; the first
  chapter is written in the background at its gate (existing chapter jobs) with a visible status.

### D2. The look picture is the reference for later pictures
`ImageProvider.generate(prompt, signal, options?: { reference?: Uint8Array; quality?: "low" | "medium" })`.
With a reference, the OpenAI provider uses `images.edit` with the picture as input. Every picture a
world asks for later (its otherworld assets, D6) passes the world's look picture when it has one
(main reads it with `readLookPicture(cartridgeId, version)`; the renderer only sends ids).
Per-world sprite sheets are **not** in this phase (the fixed `actors.png` rule stands).

### D3. Title: Continue · Worlds · Create World · Settings
**Worlds** is one library screen: start the built-in world (New game), every save, cartridges
(import/export/ENS names), join a continent, and the legacy archive when there is one. **Settings** is
today's System panel. AI Worlds leave the title (D6).

### D4. One action map for keys and pads; menus by focus
- `src/shared/input.ts`: menu actions (`nav_up|down|left|right`, `confirm`, `back`, `menu`) beside
  the gameplay `INPUT_ACTIONS`, and the standard-mapping pad layout: left stick / D-pad move,
  A interact / confirm, B back, X fire, Y door / notes, RB sprint, Start menu.
- `src/renderer/input/`: one rAF poll of `navigator.getGamepads()`. In play it feeds the same held set
  every keyboard consumer already reads (a pad button becomes the key its action is bound to), so
  bindings and movement code stay one path. In menus it moves focus spatially among the focusable
  elements of the top-most layer (a dialog before the page), A clicks, B is Escape. Every focusable
  primitive has a visible focus ring; hint rows show pad glyphs after the last pad input.
- `scripts/cdp-drive.ts` gains a `pad` action that installs a virtual gamepad in the page, so the
  gamepad E2E is replayable.

### D5. Places on engine2d (the open engineering question "地點改 2D")
- `src/renderer/engine2d/place/`: `PlaceView2D` (loop, input, targets, combat), a top-down dungeon
  renderer, a side-view renderer, and pure motion (`placeMotion.ts`: grid walking with wall
  collision; side-on walking with gravity, jump, platforms and walls, using the kit's tuning).
- Shared with the land: the sprite atlases and actor cells, `targets` / `nearestTarget`, the
  `engineStore.setNearby / interact` path into `useInteractions` (exits → `leavePlace`), and
  `combatLoop` — still the only combat logic; the place view only feeds it an aim and a clock.
- The ground is still `buildPlace` from the stored seed; nothing about saves changes. Places are drawn
  in the 16-bit look (the HD-2D look is the land's); chapter climbs and mazes use the same view.
- `GameCanvas` stays only for legacy bounded cartridges and legacy worlds, frozen.

### D6. AI Worlds become otherworld places (異界)
- `PlaceKind` gains `"otherworld"`. Its `LandPlace` carries `work: { workId, version, contentHash }`
  and its own play id. It is save-owned like every place; the work stays in `works/` (Rule 12).
- Made from the in-world place maker: pick one of this device's published AI worlds, or write a new
  one in the workshop opened over Play; the entrance appears a short walk away (`placeSpot`).
- `land.places` (renderer and main schemas) becomes a discriminated union; saves from before parse
  unchanged.
- Entering opens the sandboxed player (same Rule 12 frame, same guard) as its own layer over the land
  — it never sets `sessionStore.place`; leaving returns to the entrance; `host.complete` marks the
  place crossed and the host writes the karma line from the stored title (frame text is untrusted).

### D7. A cozy default world
- The built-in world 1.3.0 gains a gentle three-chapter story plan (meet / search / meet), so New game
  has chapters from the first minute; it stays without combat. 1.0.0–1.2.0 keep shipping.
- In a world with combat, home is safe: no foe spawns, pursues or strikes inside the home chunk.
  `wildMonsters` already returns nothing at home, so the rule lives only at the roster / pursuit /
  strike layer and **`PHYSICS_VERSION` is not bumped** (a bump would keep 1.3.0 worlds from ever
  merging with 1.x saves on a continent).

## Work packages (one owner each; others only append to shared registries)

| Package | Owns |
| --- | --- |
| create (D1, D2) | `app/create/**`, `shared/createDraft.ts`, `narrative/{newWorld,worldDraft,openLandCartridge}.ts`, `main/workspaces/createDrafts*`, look pictures in main, `main/works/images.ts` (options only), `shared/pricing.ts` |
| library (D3) | `app/WorldsScreen.tsx`, `app/SeedScreen.tsx`, `app/title/**`, `app/library/**` |
| input (D4) | `renderer/input/**`, `shared/input.ts`, `engine/useKeys.ts`, `app/shell/**`, `app/hotkeys.ts`, `App.tsx` keys, `ui/Button.tsx` focus, `scripts/cdp-drive.ts` |
| places2d (D5) | `engine2d/place/**`, `PlayScreen.tsx` place branch |
| otherworld (D6) | `shared/places.ts`, `main/instances/schemas.ts` (land.places), `app/land/places.ts`, `PlaceMaker.tsx`, `works/**` embedding, place markers in `placeLayer` and both renderers |
| cozy (D7) | `scripts/build-base-game.mjs`, `main/game/**`, `engine2d/useLandCombat.ts`, combat safe zone |

Shared registries (`shared/ipc.ts`, `preload/index.ts`, `main/ipc.ts`, `i18n/strings/index.ts`,
`game.css`) take small appended edits from any package.

## Verification
Implementation runs in parallel without launching the app. Then `bun run check`, then one E2E per
flow, one at a time, each on a throwaway userData (`docs/e2e/milestone-rev6-p2-*`): create, library,
places, otherworld, and last the gamepad-only run from the title through chapter 1 of the built-in
world. Then a review of the whole diff, fixes, the progress page, and CLAUDE.md (Create, Places on
the land, AI worlds, input, the base game list) so it describes the new code.
