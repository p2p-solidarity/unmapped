# UNMAPPED — 《無界之地》: An Autonomous Open World (Electron engine for player-owned, LLM-generated worlds)

**Name.** Every player-visible name is 《無界之地》 (zh-TW) / UNMAPPED (en, ja), with the tagline
`common.tagline` ("An Autonomous Open World" · 自主開放世界). The old name survives only as
identifiers that must not change without a migration: `productName` / `appId` in package.json (they
decide the userData folder and the macOS keychain entry that wraps saved keys), the `unwritten.*` /
`aether.*` localStorage keys, `UNWRITTEN_*` env vars, `UnwrittenLedger`, the frozen ENS text keys
`unwritten.*`, and the built-in cartridge id `aether-land` (its revisions ≤ 1.1.0 keep the old name).

Desktop-first (Electron) implementation of `plan.md`: the model writes a tiny **OpenUI Lang
dialect** (our game DSL), a parser is the source of truth, Three.js renders it, published content
lives in immutable cartridges, and progress lives in cartridge-pinned instances. A random Data Key
encrypts portable player data and is wrapped by passkey PRF or the OS keychain. Friends join a
shared document room over WebRTC signaling. Read this file before editing anything.

## Quick start

```bash
bun install                 # deps (Electron binary is fetched by its postinstall)
bun run dev                 # electron-vite dev: main + preload + renderer with HMR
bun run check               # typecheck + biome + line limit + vitest — must be green before "done"
```

Local model (recommended for a 16 GB Apple Silicon machine):

```bash
brew install llama.cpp
# Qwen3.5-4B, Apache-2.0, 2.74 GB — from https://huggingface.co/unsloth/Qwen3.5-4B-GGUF
llama-server -m ~/models/Qwen3.5-4B-Q4_K_M.gguf --port 8080 --ctx-size 16384 --jinja
```

Any OpenAI-compatible endpoint works (llama.cpp, Ollama `qwen3.5:4b`, vLLM serving
`thesysdev/OUI-1`, OpenUI Gateway `https://api.thesys.dev/v1/embed`, OpenAI). Provider presets:
`src/shared/llm.ts`. Keys entered in Settings → Model are encrypted with the OS keychain and only
read by the main process; `.env` keys are also read in main as a fallback.

## Rules (each one exists because the previous version of it caused a bug)
### Rule 0. Do not over-engineer, and test end to end
- **Never write unit tests after you write code.** A test written to fit code that already exists
  only restates it, and it breaks on every refactor.
- **E2E is the preferred and normally the only testing mechanism.** Use it to verify every complex
  feature: drive the real app (see "Verify before claiming done"). Every E2E run ends with a
  verifiable, repeatable artifact in `docs/e2e/milestone-<flow>/`: `run.json` (the exact
  `scripts/cdp-drive.ts` actions, the env, and the model), `result.md` (what you checked, the
  outputs you observed, the numbers from dev logs), and the screenshots it took. Someone else can
  replay `run.json` against a throwaway userData and compare.
- **If you must test a system in isolation, first write down all the ways it could fail, then
  write the code.** Put that list at the top of the test file before the code exists; every
  isolated test names the failure it guards. Only failures E2E cannot reach earn one: untrusted
  input (IPC, frames, peers, mods), malformed model output, silent data loss (hashes, pins,
  compare-and-set, legacy saves), crypto, invariants over many seeds, and on-chain encoding.
  No tests of prompt wording, constants, defaults, palettes, getters or rendering math.
- **After the E2E run passes, every session updates the progress page**: Page 03 (`#progress`) of
  `docs/architecture/afm3-dsl-architecture.html`. Add or update the stage row, write only numbers
  you measured, and link that session's `docs/e2e/` artifact. Nothing unverified goes in (Rule 2).

### Rule 1. Every source file ≤ 600 lines — enforced by `bun run lines`
Split by responsibility (parser / prompt / repair), never by "part 1 / part 2".

### Rule 2. No fake data — ever
- Anything data-driven renders exactly one of `idle | loading | ready | error` (`Loadable<T>` in
  `src/shared/result.ts`, `<StatePanel>` in `src/renderer/ui`). Never a plausible placeholder.
- No hard-coded sample worlds, NPC lines, items, peers, ENS names or model outputs in app code.
  If a backend is missing (no model reachable, no peer, no PRF), show the `error` state with an
  actionable `hint`. Test fixtures live under `tests/fixtures/` and are only imported by tests.
- Never claim a feature works that you have not run (`bun run dev` + the actual flow).
- HUD gauges and counters must be backed by real state (floor, karma, inventory, peers, fps).
  There is no HP/MP/combat system yet, so there are no HP/MP bars. No "starter" platforms,
  props or items seeded into a new world "so it feels alive" — the model generates the world.
- Durable state lives only in the cartridge / instance / workspace files in Rule 9. `localStorage` is for per-device
  preferences only (player name, character class/theme, credential id).

### Rule 3. UI primitives + tokens only
`src/renderer/ui/{Text,TextField,Button,Surface,StatePanel}` are the only text/input/button/surface primitives.
Hex colour literals are allowed **only** in `src/renderer/ui/tokens.ts` (UI) and
`src/renderer/engine/palette/` (3D palettes: biomes, props, monsters). Interactive targets are
≥ 44 px (`HIT_TARGET`). No per-screen button components — extend the variant instead.

### Rule 4. State ownership
- Per-frame data (positions, velocity, camera) → refs / R3F `useFrame`. **Never** in zustand.
- World + session + inference + low-frequency engine state → the four stores in
  `src/renderer/state/`. Only add fields there when two modules need them.
- Local UI state (expanded, hovered, draft text) → `useState` in the smallest component.

### Rule 5. Errors are values
Cross-boundary calls (IPC, LLM, chain, peers, filesystem) return `Result<T>`; never throw across
IPC and never swallow. `code` is machine-readable, `hint` tells the user how to fix it.

### Rule 6. Electron security
`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. The renderer talks to main
only through `window.seed` (preload `contextBridge`) using channels from `src/shared/ipc.ts`.
Secrets (`OPENAI_API_KEY`, `THESYS_API_KEY`) never reach the renderer. Validate every IPC payload
in main (zod) — the renderer is untrusted once mods/P2P exist.

### Rule 7. DSL is the truth, the model is a guest
- The model only ever writes OpenUI Lang programs against our libraries (`src/dsl`). No JSON
  blobs, no JS, no `eval`, no `new Function`.
- Parse with `@openuidev/lang-core` (`createParser(library.toJSONSchema())`), convert with
  `toSceneGraph / toDialogue / toItem`, and **repair** by re-prompting with `OpenUIError[]` at
  most twice (`src/dsl/repair.ts`). Unparseable after that → `error` state, not a fallback scene.
- Every numeric prop is clamped to the ranges in `src/dsl/limits.ts` so a hallucinated `x=9000`
  cannot break the engine.

### Rule 8. Import direction
`shared ← dsl ← { main, renderer }`. `renderer` never imports `main`; `main` never imports
`renderer`. `dsl` has no React/Electron imports (it must run in vitest and in main).

### Rule 9. Cartridge content, instance progress, and workspaces have separate owners

- `<userData>/cartridges/<cartridgeId>/<version>/` is an immutable published revision:
  `manifest.json`, `rules.oui`, and declared `scenes/<sceneId>.oui`. Its content hash is its exact
  identity. Play and model tools never write here.
- `<userData>/instances/<instanceId>/` owns `instance.json` plus the active
  `saves/<saveId>/{save.json,karma.jsonl}`. The save pins an exact cartridge id, version, and hash;
  flags, inventory, mutation, current scene, and completion live here.
- `<userData>/workspaces/<workspaceId>/` is the mutable authoring copy. Structural scene/rule edits
  go here, then full validation publishes a new immutable revision with explicit lineage.
- `<userData>/worlds/<id>/` is the legacy five-dotfile format. Keep it readable and recoverable;
  migration creates a cartridge plus pinned instance and never deletes the source automatically.

A `.cartridge` contains content only. A `.spire-backup` contains one instance and active save only,
and restore requires its exact cartridge revision. Encrypted portable data uses a random AES-GCM
Data Key; PRF/keychain-derived keys only wrap that Data Key, with one validated wrapping record per
credential. Installed mods remain outside saves in `<userData>/mods/<name>/` (docs/harness.md).

### Rule 10. Language is the player's (Babel)
- UI chrome is translated (en / zh-TW / ja) and every player-visible word goes through
  `t("ns.key")` / `translate()` from `src/renderer/i18n`. Each screen owns one table in
  `i18n/strings/<ns>.ts`, and every key must have all three languages (the type enforces it; a
  test checks placeholders and keeps Simplified characters out of zh-TW). Dates and numbers go
  through `formatDateTime` / `formatNumber`. The UI language is a device preference (System menu)
  that also sets `<html lang>` and orders the CJK font faces.
- AppError `message` / `hint` stay English at their source (the model reads them in repairs).
  The screen shows them through `ErrorBlock` / `errorLine()`, which translate known codes from
  `i18n/strings/errors.ts`.
- Everything the model says (NPC lines, choices, item names) is generated in `genesis.language`.
  A new world defaults to the UI language (`contentLanguage()`), and the player can pick another in
  Create. Prompts name it with `languageName()` (`@shared/language`), which spells out Traditional
  or Simplified Chinese. Never translate model output client-side, and never translate prompts,
  ids or text persisted into saves.

## Layout & ownership

```
src/
├── shared/        contracts — result.ts, world.ts (vocabulary + SceneGraph), llm.ts, ipc.ts, events.ts
├── dsl/           OpenUI Lang game dialect: schemas, libraries, prompts, parse, repair, grammar, limits
├── main/          Electron main: cartridges/, instances/, workspaces/, legacy worlds/, vault/, inference/
├── preload/       contextBridge → window.seed (SeedApi)
└── renderer/
    ├── app/       screens: title (WorldsScreen), library/ (Worlds), create/, Play (HUD), Console (F12)
    ├── engine2d/  the land and places in 2D (the one engine players see); hd2d/ is the land's HD-2D look
    ├── engine/    R3F scene (frozen: legacy bounded scenes only), shared targets, combat, keys, palettes
    ├── input/     gamepad poller + focus navigation (one action map with the keyboard, @shared/input)
    ├── narrative/ generateScene / generateDialogue / generateItem (prompt → chat → parse → repair)
    ├── llm/       renderer-side streaming client over IPC
    ├── identity/  passkey PRF unlock + keychain fallback, AES-GCM, ENS resolve
    ├── net/       yjs + y-webrtc rooms: shared dotfiles + presence
    ├── state/     zustand stores (world, engine, session, inference)
    └── ui/        primitives + tokens
tests/             vitest — only failures E2E cannot reach (Rule 0); fixtures in tests/fixtures/
docs/e2e/          one folder per E2E run: run.json + result.md + screenshots (Rule 0)
```

### Rule 11. Extensions are prompt + tools, never code (docs/harness.md)
The harness (`src/harness`, Cordis-based like deepseek-harness) is how anything talks to the
model: prompt **sections** with an `order`, **tools** defined with `defineTool`, **skills**, and
a **GameEffect** seam (`src/shared/effects.ts`) that is the only way a tool changes the world.
Mods (`<userData>/mods/<name>/mod.yml`) contribute sections, declarative tools (effect templates)
and skills. No mod ever ships JavaScript; no plugin bypasses `ctx.effects`. Every registration
is a reversible `ctx.effect()` so mods can be mounted/unmounted while a world is open.

### Rule 12. AI worlds (`interactive-web@1`) are code — only inside the work sandbox
Rule 7 and Rule 11 still hold for cartridges, the Scene DSL and mods. The one place a model may
write JavaScript is an `interactive-web@1` world (`docs/plans/interactive-web-player.md`), and it
runs **only** in `<iframe sandbox="allow-scripts">` (plus the `allow="gamepad"` permissions policy
on played frames — a permission, not a sandbox token) served by main from a fresh
`ulwork://<token>/` host with the nonce CSP in `src/main/works/frame.ts`. Never add
`allow-same-origin`, never serve a world from the app origin, never pass `window.seed`, paths or
secrets into a frame, and treat every frame message as untrusted (`src/renderer/works/frameGuard.ts`).
Worlds are stored beside cartridges, not inside them: `works/` (immutable, hashed),
`work-plays/` (pinned progress), `work-drafts/` (candidates; head moves only by compare-and-set).

### Rule 13. A story is content; the chain is optional
A world made from a story keeps its episode plan in the cartridge (`bible/story.json`, hashed with
everything else); what each chapter wrote, how far the player got and the carried items live in the
save (`land.episodes[id].stage`, `land.storyCarry`). A chapter is played **in the game itself**,
never on a separate page (`@shared/chapter`): on the land around its gate (the Chapter dialect —
people with their words, finds, foes; no coordinates, the host sets them on walkable ground), or as
a place when its kind is a climb or a maze. Only the next chapter is written ahead (or at its gate),
never all up front. The host — not the model — decides where a gate stands, clears a chapter once
every person is met, every treasure opened and every foe felled (or a place's far end reached), and
merges what it gave into the carry. Saves from before keep `draftId/work/playId`; they are read,
never written.

On-chain provenance (`contracts/src/UnwrittenLedger.sol`) is optional and additive: content never
goes on chain, only the sha256 hash the app already computes, its author, its lineage and short
player notes. `UNWRITTEN_*` env vars live in main only (Rule 6). With nothing configured every
screen must still work and say plainly that no ledger is set up.

## Module contracts (what each module MUST export)

### `src/harness` (framework-agnostic; `@deepseek-ai/cordis` + zod + js-yaml; no React/Electron)
```ts
export function createHarness(): Harness;   // { ctx: Context; dispose(): Promise<void> } with systemPrompt/tools/skills/effects/world services mounted
export const ORDER: { PERSONA: 100; WORLD_RULES: 200; DSL_SPEC: 300; MOD_MIN: 400; MOD_MAX: 600; CONTEXT: 700; EXAMPLES: 800; OUTPUT: 900 };
ctx.systemPrompt.section({ name, order, text: string | ((a: AssembleContext) => string) }): () => void
ctx.systemPrompt.variable(name, provider): () => void;   ctx.systemPrompt.assemble(a, turn?: PromptSection[]): { text: string; sections: string[] }
// `turn` sections belong to one turn only and are never registered: the loaded world's harness is
// shared, so a witnessing and a chapter written at once must not collide or read each other's.
ctx.tools.register(def: ToolDefinition): () => void;   ctx.tools.schemas(): ToolSchema[];   ctx.tools.execute(call: ToolCall, exec): Promise<ToolExecutionResult>
export function defineTool<P>(config: { name; description; parameters: ParamSpecMap; execute(args: P, exec): Promise<JsonValue> }): ToolDefinition
events (waterfall unless noted): "tools/pre-execute"(exec, next) → { kind: "allow" } | { kind: "deny"; reason }, "tools/execute"(exec, next), "tools/post-execute"(exec, result, next), "tools/result"(result) emit
ctx.skills.provider(p: SkillProvider): () => void;   ctx.skills.catalog(): SkillSummary[];   ctx.skills.load(name): Promise<Result<string>>
ctx.effects.provider(apply: (e: GameEffect) => Promise<EffectOutcome>): () => void;   ctx.effects.apply(e): Promise<EffectOutcome>   // validates e with zod first
ctx.world.set(snapshot: WorldSnapshot | null) / ctx.world.get()   // { genesis, meta, scene, karma, inventory, floor }
export function runTurn(input: { ctx; chat: ChatFn; messages: ChatMessage[]; sections?: PromptSection[]; maxSteps?: number; useTools?: boolean; onDelta? }): Promise<Result<TurnResult>>
// ChatFn gets `{ signal }` as its third argument (the assemble signal aborts the call in flight);
// TurnResult.usage sums every step's tokens.
export function parseModManifest(yaml: string): Result<ModManifest>;   export function modPlugin(bundle: ModBundle): Plugin   // sections + tools + skills, all reversible
export const builtins: { persona, worldContext, worldTools, skillTool }: Plugin[]
```

### `src/renderer/harness`
```ts
export function useWorldHarness(): Harness | null;   // mounted by PlayScreen; one harness per loaded run; model effects become typed Change Proposals and approved save-owned effects checkpoint the instance. `narrate` is a toast and applies at once. A filed proposal answers the model `ok: true` with a "proposed, not applied" message; leaving Play discards unapproved proposals.
export function ModsPanel(): JSX.Element;            // list/install/remove installed mods, toggle per-world enablement (writes meta.mods)
```


### `src/dsl` (framework-agnostic, uses `@openuidev/lang-core` + zod v4)
```ts
export const sceneLibrary: Library;      // root "Scene"    — components: Scene, Floor, Patch, Platform, Wall, Prop, NPC, Monster, Treasure, Exit, Light, Sky, Trigger, Quest
//   NPC(id, name, x, z, role, mood, color, body?, hat?, held?, accent?)   — look defaults derive from role (src/shared/world.ts BODY/HAT/HELD_KINDS)
//   Monster(id, kind, x, z, level, weakness, size?, color?)
//   Light(kind, color, intensity, x?, z?)      — x/z only for point lights
//   Platform(x, z, width, depth, y, height, tile, bounce?)   — raised/floating block (jump puzzles)
//   Patch(x, z, width, depth, tile)            — floor tile override: paths, ponds, lava pools
export function serializeScene(graph: SceneGraph): string;   // deterministic; parseScene(serializeScene(g)) deep-equals g. Used by the visual platform editor ("Apply" bakes drafts into world.oui)
export const dialogueLibrary: Library;   // root "Dialogue" — components: Dialogue, Choice(label, action ∈ DIALOGUE_ACTIONS, effect, gives[]), Mutation
export const itemLibrary: Library;       // root "Item"     — components: Item
export const sceneSpecs / dialogueSpecs / itemSpecs: ComponentSpec[]   // { name, description, props } so the renderer can bind React renderers to the same schemas
export function parseScene(source: string): Result<SceneGraph, DslError>;
export function parseDialogue(source: string): Result<DialogueGraph, DslError>;
export function parseItem(source: string): Result<ItemSpec, DslError>;
export interface DslError extends AppError { errors: OpenUIError[]; unresolved: string[]; orphaned: string[] }
export function scenePrompt(ctx: ScenePromptContext): string;       // system prompt from sceneLibrary.prompt() + biome/archetype/language rules
export function dialoguePrompt(ctx: DialoguePromptContext): string;
export function itemPrompt(ctx: ItemPromptContext): string;
export function repairPrompt(source: string, error: DslError): string;   // user turn asking the model to patch only failing statements
export function sceneGrammar(): string;   // GBNF for the Scene dialect (llama.cpp `grammar` field)
export const LIMITS: { floor: {min,max}, coord: {min,max}, scale, level, intensity, fogDensity, power, maxProps, maxNpcs, ... }
```
Components take **positional** args in zod key order (required first). Enums come from
`src/shared/world.ts` — never redefine them. Colours are `#rrggbb` strings validated by regex.

### `src/main`
- `index.ts` creates the window, loads `.env` (dotenv) before anything else, registers all IPC via
  `registerIpc()` in `ipc.ts`, which calls `registerInferenceIpc()` from `main/inference/ipc.ts`.
- `cartridges/` publishes, verifies, lists, and imports/exports immutable content revisions.
- `instances/` owns pinned progress, explicit compatible upgrades, and `.spire-backup` restore.
- `workspaces/` owns mutable rules/scenes, full validation preview, and publishing with lineage.
- `worlds/` is the legacy five-dotfile store + watcher and migration source; migration never deletes it.
- `vault/` keeps the keychain fallback secret and validated Data Key wrapping records in userData.
- `inference/` owns `InferenceConfig` persistence (`inference.json` in userData), the OpenAI-SDK
  client (`baseURL` from config, key from `process.env[apiKeyEnv]`), streaming → `inference:event`,
  abort, `/v1/models` probe, and the `llama-server` sidecar (spawn, health poll, kill on quit).
- `usage/` owns the usage ledger `<userData>/usage.jsonl` (@shared/usage): one append-only line per
  model call — purpose, world scope, provider, model, input / output / cached tokens, ms, outcome —
  written where each chat, Apple scene or image request settles (never by the renderer); numbers
  only, never a prompt, answer or key. A world's total folds in the Create draft linked to it.
- `works/images.ts`: every picture goes through an `ImageProvider` (swap the model = swap the
  object); its look comes from the world (its maker's words, its library art), never a house style.
  `generate(prompt, signal, { reference?, quality?, kind? })`: with a `reference` PNG the OpenAI
  provider calls `images.edit`. Keys only through `resolveApiKey` (saved → `.env`), never
  `process.env` directly. A world's look picture is the cartridge asset `assets/look.png`
  (`LOOK_PICTURE_ASSET`); main reads it with `readLookPicture(cartridgeId, version)`
  (`cartridges/look.ts`) and passes it as the reference for every picture that world asks for.
- `game/base.ts` installs every shipped `aether-land-<version>.json`, oldest first; never drop one
  (a save pinned to it must still open on a new machine). New Game starts on the newest (1.3.0: the
  built-in world's gentle three-chapter story, meet / search / meet, no combat).

### `src/renderer/llm`
```ts
export function chat(request: Omit<ChatRequest, "id">, onDelta?: (text: string) => void, options?: { signal?; timeoutMs? }): Promise<Result<{ text: string; usage: ChatUsage | null }>>;
// Every request carries `usage: usageTag(purpose)`; the scope is the world whose screen set it
export function usageTag(purpose: UsagePurpose): UsageTag;   useUsageScope(scope): void;   // Play: instance, Create: draft, Workshop: work draft
export function useUsageSummary(scope): Loadable<UsageSummary>;   // re-read on usage:changed
export function abortChat(id: string): Promise<void>;
export function useInferenceSync(): void;   // hydrates inferenceStore (config, probe, sidecar) and subscribes to sidecar events
```

### `src/renderer/narrative`
```ts
export function generateScene(input: { genesis: Genesis; floor: number; karma: KarmaEntry[]; previousExit: string | null; inventory: Inventory }): Promise<Result<{ source: string; graph: SceneGraph }>>;
export function generateDialogue(input: { npc: NpcSpec; scene: SceneGraph; genesis: Genesis; karma: KarmaEntry[]; inventory: Inventory }): Promise<Result<{ source: string; graph: DialogueGraph }>>;
export function generateItem(input: { wish: string; materials: string[]; genesis: Genesis; inventory: Inventory; floor: number }): Promise<Result<{ source: string; item: ItemSpec }>>;
```
Each: build prompt (dsl) → `chat` → parse → on `DslError` send `repairPrompt` (≤ 2 rounds) →
`Result`. Never return a hand-written fallback program.

### `src/renderer/engine`
```tsx
export function GameCanvas(): JSX.Element;   // full-viewport R3F canvas; reads useWorldStore.scene + useEngineStore
```
- Renders `SceneGraph` with instanced meshes (floor tiles + patches, platforms, walls, props) and
  parametric humanoids for NPCs (`body`/`hat`/`held`/`color`/`accent`), scaled/tinted monsters,
  Treasure/Exit primitives; lights (point lights at their x/z) + fog from `Sky`.
- `usePlatformStore.drafts` are unsaved editor **drafts**: rendered translucent (with colliders
  so they can be test-jumped) until the editor's "Apply" bakes them into the scene via
  `serializeScene`. The engine never reads world state from localStorage.
- **Open land** (`plan.md` §4): a kit whose `GameplayKitBehavior.open` is true (`tps_exploration@1`)
  has no floor edge. `<ChunkField>` streams 32 × 32-tile chunks around the player (5 × 5 drawn,
  3 × 3 with colliders) from `@shared/chunks` — deterministic from `seedFromText(cartridgeId)` +
  chunk coordinates, never stored, never the model. The authored scene is chunk (0, 0). The sun
  follows the player and fog has a floor that hides the rim. `engineStore.chunk` is the HUD's
  `LAND cx · cz`; it is null in a bounded scene.
- The scene contract locks the kit and camera: TPS orbit, FPS pointer-lock + reticle + flashlight,
  2.5D side movement, and top-down board movement. Players cannot cycle away from the contract.
- Movement and interaction ignore input while `inputLocked`.
- Proximity (≤ 2 tiles) publishes `setNearby`; interact publishes `interact(target)`.
- `mutationSeq` change → 0.5 s shader dissolve/crossfade of palette + fog (hot-swap).

### `src/renderer/engine2d` + `src/renderer/hd2d` (open land as players see it today)
```ts
export function LandView2D(props): JSX.Element;   // movement, collision, targets, story gates; draws through a LandSurface
export function createHd2dRenderer(canvas, overlay, atlases, view?): { render(frame: Hd2dFrame): void; dispose(): void };
export function TitleDiorama({ seedText }): JSX.Element;   // App's MenuBackdrop: the land behind every menu
```
- Two looks of the same land, switched by `V` / the dock's Look button (`engineStore.landLook`,
  a device preference): `hd2d` (three.js diorama: painted chunk floors, plateaus/basins, upright
  shadow-casting sprites, bloom + tilt-shift, all from `three/examples` — no postprocessing dep) and
  `pixel` (the 16-bit canvas). Only the drawing differs; never put game rules in a renderer.
  Colours: `engine/palette/hd2d.ts`. Sheet rects: `hd2d/assets.ts` (a test keeps them inside the sheets).
- Residents and monsters are image-model sprites: one 64 px cell per NPC role (row 0) and monster
  kind (row 1) of `src/assets/generated/actors.png` (`engine2d/actorSprites.ts`). They are drawn
  once by `bun scripts/gen-sprites.ts`, a dev step that spends the OpenAI key (ask first); raw
  pictures stay in `.cache/sprites/`, provenance in `actors.json`. Never generate sprites at runtime.
- Physics is versioned (`@shared/physics`): the ground and wildlife (`@shared/chunks`), the fight
  formulas (combat, progression, foes), lore heat and dungeons. A new world pins
  `runtimePin.physicsVersion` (absent = 1); a build opens only `PHYSICS_SUPPORTED`, and worlds on
  different physics never merge on a continent. Changing that output without bumping
  `PHYSICS_VERSION` (and recording its fingerprint) fails `tests/shared/physics.test.ts`.
- Other players on the continent are drawn by both looks with their name, facing and walk
  (`remoteRoster`, the pose from `registerPoseProbe`); presence is awareness, never saved.
- Reachability is the host's: every chunk's centre row/column is a ford (`isFord` in
  `@shared/chunks` — water there is sand, nothing grows) and the origin chunk is dry; written chunks
  pass through `clearFords` when they enter the land store. Story gates stand at chunk centres, so
  spawn and every gate are always joined by land. Don't place gates anywhere else.

### Combat and mods (one combat model; mods never refuse a missing module)
- `src/renderer/engine/combat/combatLoop.ts` is the only combat logic (trigger, cooldown, aim
  preview, turns, `strike`). `CombatControl` (3D) and `useLandCombat` (open land) only feed it an
  aim and a clock; places use `engine2d/place/usePlaceCombat.ts` the same way. On land the roster is
  `wildMonsters` of the 3 × 3 chunks around the player plus the current chapter's foes (only when
  `rules.combat !== null`; kind + level, never names or lines); an endless roster never "clears" a
  run, only defeat ends it.
- Home is safe (`@shared/safeGround`: `isSafeGround`, the origin chunk): no foe stands, walks or
  pursues into it and no blow lands there. It lives at the roster / pursuit / strike layer, outside
  the physics fingerprint (`wildMonsters` already returns nothing at home) — do not move it into
  fingerprinted code without bumping `PHYSICS_VERSION`.
- `src/main/mods/modules.ts`: a proposal that needs a capability the cartridge lacks gets the module
  (and its requirements) locked, its rules turned on with fresh tuning, and a reason line — never an
  error. The only refusal is a module the engine does not have. A mod revision carries the bible,
  story, dialogues and assets of its base unchanged.

### Places on the land (`@shared/places`, `app/land/places.ts`)
- A place (side-scroller `platformer_2_5d@1`, grid dungeon `dungeon_grid@1`, or an otherworld 異界)
  is **save-owned** (`land.places`, validated by `landPlaceSchema` — a union of `WrittenPlace` and
  `OtherworldPlace`), not a cartridge scene: adding one never makes a new version or a new run.
- The model writes only the life in it (`dsl/prompts/place.ts`); `buildPlace` builds the ground from
  the stored seed on every entry (course / `generateMaze`) and moves every entity onto open ground.
  Never trust model coordinates in a place, never store its walls in the program.
- Entrances stand at chunk centres chosen by `placeSpot` (reachable thanks to the fords). A written
  place (and a chapter's climb or maze) is played on engine2d by `PlaceView2D({ graph, rules, title })`
  (`engine2d/place/`: pure `placeMotion.ts`, a side view and a top-down dungeon view in the 16-bit
  look) while `sessionStore.place` is set; its exits call `leavePlace` (far end = crossed) and the
  land resumes at the entrance via `landReturn`. Play never mounts `GameCanvas` for open land.
- An otherworld (`OtherworldPlace`: `work` ref + optional `playId`) is an entrance into one published
  AI world; placing one asks no model. Entering opens `OtherworldLayer` (the sandboxed `PlayerView`
  over the land; it never sets `sessionStore.place`); leaving returns to the entrance; `host.complete`
  marks it crossed, and the host writes the karma line from the stored title (frame text is untrusted).
  The place maker (Tweak → Add a place → 異界) lists this device's AI worlds or opens the workshop.

### Create a game (`app/create/`, `narrative/newWorld.ts`)
- Five steps: idea (only the words are required — an empty name comes from their first clause and
  renaming never makes the world stale; optional story material, language, `PlayStyle`: fights none
  | gun | blade) → world (seven editable bible cards, each independently rewritable or **locked**; a
  locked card is never overwritten, "rewrite the unlocked cards" is one call; the seventh, the look,
  is the world's own art direction) → look (three low-quality concept pictures drawn in main, kept in
  the draft folder `looks/`; pick one, draw again, or go on without one — the chosen picture is
  published as `assets/look.png`; the story plan streams in the background meanwhile) → story (3–8
  editable chapters,
  even without player story material; rewrite, insert, move, remove, lock, or revise the unlocked
  chapters; ids and gates re-derived by `episodePlaces`) → build, which first shows a quote (calls,
  input tokens estimated from the real origin prompt, output cap, the draft's usage, money only from
  the dated `@shared/pricing` table or "price unknown", local models free, chapter 1's background
  call on its own line), then `buildWorld` (origin scene, `openLandCartridge` with play style as
  capability requirements, publish, new save) and lets the player in at once. Only building
  publishes. Autosaved drafts live in `<userData>/workspaces/create.<draftId>/draft.json`, not in
  published cartridges. Changing the idea marks dependent world/story content stale.
- Style is the world's (rev 6): prompts read the bible's `Look:` and `Props:` lines
  (`worldPropKinds` in @shared/bible) — biome, ground and props for the origin, props for every
  witnessing, enforced by the parsers. A bible from before the look keeps `LEGACY_PROP_KINDS`. No
  prompt names a period or genre of its own. Create's world and story steps stream into previews
  (`StreamPreview`); nothing streamed is kept.
- The legacy six-step Create (scene bases, Genre Matrix, capability report, its authoring
  workspaces and IPC) was deleted; do not bring it back.

### Title, Worlds and input (`app/WorldsScreen.tsx`, `app/library/`, `@shared/input`, `renderer/input/`)
- The title has exactly four entries: Continue · Worlds · Create World · Settings (today's System
  panel, a `role="dialog"` layer). Worlds is the `library` screen: sections New game (the built-in
  world), Saves, Cartridges, Continent, and Archive when legacy worlds exist (`library/sections.ts`
  — a new section is one entry there). Do not add title entries.
- One action map for keys and pads (`@shared/input`: standard-mapping layout, dead zones, menu
  actions). `useGamepad()` (mounted once in App) polls `navigator.getGamepads()`: in Play with no
  layer open it makes the key each pad action is bound to count as held/pressed in the same
  `engine/useKeys.ts` held set (A interact, B jump, X fire, Y notes, RB sprint, Start = Esc), so
  engine code never reads pads; anywhere else it moves DOM focus spatially inside the top-most layer
  (`[data-layer]`, `role="dialog"`), A clicks, B / Start send Escape. Mark new panels over Play with
  `data-layer`, give screens one initial focus (`.g-autofocus` / `data-autofocus`), and never make
  something needed to play reachable only by mouse. Hint rows show pad glyphs after a pad input.
  `scripts/cdp-drive.ts` `{"pad": {buttons, axes, ms}}` installs a virtual pad for E2E. Offer no option the land cannot play
  (companions exist in the rules but are not drawn or followed on the land yet).

### `src/renderer/identity`
```ts
export function unlock(): Promise<Result<UnlockedKey>>;   // PRF/keychain derives a wrapping key, then unwraps or creates the random Data Key
export function wrapDataKey(wrappingKey, dataKey, identity): Promise<DataKeyWrappingRecord>;
export function encryptBytes(key: UnlockedKey, bytes: Uint8Array): Promise<Uint8Array>;   // AES-GCM with the unwrapped Data Key, 12-byte IV prefix, versioned header
export function decryptBytes(key: UnlockedKey, bytes: Uint8Array): Promise<Result<Uint8Array>>;
export function resolveEnsSeed(name: string, network?: EnsNetwork): Promise<Result<{ network; address: string | null; seedUrl: string | null }>>;   // ENSv2: viem Universal Resolver (never hard-code its address), "sepolia" (ENSv2 preview, default) | "mainnet"; text record "aether.seed"
```
- Wrapping records are written one at a time (`vault.putWrappingRecord`, upsert by id); nothing
  can replace the whole list. A passkey unlock also enrols this machine's OS keychain as a
  recovery wrapper and says so in a toast — an accepted same-machine trade-off (plan §七 wants
  more than one way back in). Records carry no AAD and new ciphertext still uses the `ASP1`
  header; both are known follow-ups, not guarantees.

### `src/renderer/works` + `src/main/works` (AI worlds, Rule 12)
```ts
export function WorksScreen(): JSX.Element;   // the AI worlds library (drafts, saved worlds, journeys), reached from the in-world place maker; players meet AI worlds as otherworld places
// WorkFrame: one sandboxed session; validates messages, heartbeat watchdog (kills a hung frame's pid), "check" mode
// runAttempt(draft, "generate" | "edit", request, deps): model reply → @@ line protocol (src/shared/workEdits.ts)
//   → pending candidate → player check (fresh + resume-from-save) → ≤ 2 repairs → settle (compare-and-set)
//   a repair answers with @@edit SEARCH/REPLACE only (a whole-file @@file is refused and counts as the repair)
// window.seed.works.*: list/plays/drafts, createDraft, readCandidate, writeCandidate, settleCandidate,
//   revertDraft, publishDraft, replaceAsset, createPlay/readPlay/changePlay, openSession/closeSession
```
The model-facing contract is `WORK_CONTRACT` in `src/shared/workPrompt.ts`; the host API a world sees
is exactly `host.{root, carry, load, save, loop, complete, status, asset}` (shim: `FRAME_RUNTIME` in
`src/main/works/frame.ts`). `load(fresh)` fills keys the save lacks, `loop(fn)` gives dt in seconds,
and main merges a completion's carry over the incoming one (`mergeCarry`), so worlds need not.

### `src/main/chain` + `src/shared/chain.ts` (optional ledger, Rule 13)
```ts
export function ledgerConfig(env?): LedgerConfig;          // { readable, writable, chainId, address, explorer }
export function lookupRevision(contentHash, clients?): Promise<Result<LedgerRevision | null>>;
export function publishRevisionOnChain(input, clients?): Promise<Result<{ txHash: string }>>;
export function witnessOnChain(input, clients?): Promise<Result<{ txHash: string }>>;
// `bun run contracts:build` recompiles contracts/UnwrittenLedger.json (committed);
// `bun run contracts:deploy` is run by a person — it spends gas.
```

### Cartridge and save ENS names (lineage tree; `src/main/chain/names.ts`, `app/market/EnsNames.tsx`)
```ts
window.seed.market.cartridgeName(cartridgeId, version, key | null): Result<EnsNameStatus>   // what a revision's name says
window.seed.market.saveName(instanceId, label | null, key | null): Result<SaveNameView>     // a save, its cartridge's name, its own name
MarketAction { kind: "name-cartridge"; cartridgeId; version } | { kind: "name-save"; instanceId; label }   // passkey-signed, station-paid
export function lookupEnsName(name): Promise<Result<EnsLookup | null>>;   // renderer, Universal Resolver: revision + a save's checkpoint
export function saveFingerprint(instancesDir, instanceId, cartridgesDir?): Result<{ name, pin, saveHash, progress }>   // main/instances/saveHash.ts
```
- Names live in the lineage market's tree under `UNWRITTEN_LINEAGE_PARENT` (`unmapped.eth`), not the
  `ens:setup` parent: a revision is `<cartridgeLabel(id)>.<root>`, a remix `<label>.<parent's name>` once
  the parent has one, a save `<label>.<cartridge's name>`, held by the player's PasskeyAccount.
- Main reads everything it writes from disk (revision id / version / hash / lineage; the save's
  fingerprint); the renderer only picks which revision or save and the save's label. Content never goes
  on chain. Text keys are frozen: `unwritten.cartridge/version/hash`, plus `unwritten.kind`,
  `unwritten.save`, `unwritten.progress` for saves and `unwritten.token/auction` for a launched world.
- A save's fingerprint is sha256 of canonical JSON of what a `.spire-backup` carries (save state
  without `updatedAt`, karma, written land), never ids or paths, so a restored backup hashes the same;
  Worlds → Saves finds an existing save name by that hash (`SaveRecorded` logs), else the newest one
  this passkey holds. Progress is one English line from real state ("2 chapters cleared · 14 deeds").
- Worlds → Cartridges shows each revision's name (free / this version / the player's, older / someone
  else's, other version / another cartridge) and names or repoints it; "Open by ENS name" follows a
  name back to a revision, and a save's name to its checkpoint.
- The older `ens:setup` path (`src/main/chain/ensNames.ts`, `claimCartridgeName`, a separate parent and
  `UNWRITTEN_ENS_*`, signed with the key in main) is no longer in the UI; `bun run ens:setup` still
  works for a separate parent. `ENSV2_SEPOLIA` (`ensCalls.ts`) is the deployment the Universal Resolver
  walks today (`ens_v2_sepolia_20260916`); this build's resolver takes DNS-encoded names.

### Lineage market (`contracts/src/lineage`, `src/main/chain/lineageCalls.ts`, Sepolia; docs/plans/lineage-market.md)
```ts
LineageRegistry.register({ parent, label, owner, cartridgeId, version, contentHash })   // names first: a cartridge + its children's registry
LineageRegistry.recordSave({ cartridge, label, version, contentHash, saveHash, progress }) / updateSave(node, …)   // held by msg.sender
LineageRegistry.launch(node, { supply, lpReserve, auctionBlocks, floorPriceQ96, tickSpacingQ96, requiredCurrencyRaised })   // holder only
LineageRegistry.registerAndLaunch(nameParams, launchParams)   // the operator's scripts
// launch → WorldToken + Uniswap CCA (LBPStrategy) priced in the parent's token; a remix launches only after its parent
LineageHook   // v4: only LBPStrategy opens world pools; afterSwap 1% royalty, 50/30/20 up the line; claim() pays the ENS name holder
LineageRouter // buy/sell along pathTo(world) in one unlock
```
- Nodes are real ENS namehashes (`rootNode` = namehash of the parent). The registry keeps only
  `REGISTRAR | SET_PARENT` on every registry it makes, so every name is an emancipated ENSv2 token (safe
  transfer works). Never grant it, or anyone, a role from `UNEMANCIPATED_ROLE_BITMAP`; a cartridge's
  children's registry is made when it is named for this reason. Saves have no children.
- `bun run contracts:build` rebuilds `contracts/LineageMarket.json` (`scripts/build-lineage.mjs`); the
  structs in `LaunchTypes.sol` mirror liquidity-launcher v3.1.0 / CCA v2.1.0 field for field.
- `bun run lineage:market --dry-run` is the check: it simulates deploy → three generations of
  launch/auction/graduation → swaps → royalties → name transfer → passkey accounts → names and saves
  (`scripts/lib/namesDay.ts`) → refusals on Sepolia's real contracts (the failure list is at the top of
  `scripts/lineage-market.ts`). A live deploy is run by a person.
- Deployed on Sepolia under `unmapped.eth` (v2 addresses in `contracts/README.md`); `UNWRITTEN_LINEAGE_*`
  in `.env` are main-only like every `UNWRITTEN_*` var. Runbook: `docs/demo/lineage-market.md`.
- The app plays it with no wallet and holds no key (Worlds → Market, `app/market/`): a passkey owns a
  `PasskeyAccount`; main builds every batch (`chain/marketRelay.ts`, `prepare` → the passkey signs the
  digest → `submit`) and hands it to the gas station (`chain/relayClient.ts`, `UNWRITTEN_LINEAGE_RELAY`),
  then waits for the receipt on its own RPC. Never let the renderer name calls or a challenge — main
  keeps both. `@shared/passkeyAuth` turns an assertion into OpenZeppelin's `WebAuthnAuth` and recovers a
  key from two assertions. Without a station URL the market is read-only.
- The gas station (`src/relay`, a Cloudflare Worker, `web/lineage-relay/wrangler.jsonc`, wire format
  `@shared/relay`) holds the only key that pays (`RELAYER_KEY` secret; `bun run relay:key` makes it in
  `.cache/relay/`, a person adds it with `wrangler secret put`). One request = one transaction it builds
  itself: `execute` (a passkey batch whose calls may target only MockUSDC, Permit2, the router, a world's
  token or auction, or the registry's naming functions), `faucet`, `exit`/`claim`/`graduate`,
  `royalties`. It simulates first, caps gas per kind and the fee (`MAX_FEE_GWEI`), refuses browsers
  (`Origin`) and rate-limits per client. `bun run relay:dev` runs it locally; `relay:deploy` ships it.
- Electron dev cannot reach Touch ID, so `chain/signBridge.ts` serves a localhost page the system
  browser opens for the one signature (`UNWRITTEN_SIGN_BROWSER=none` only logs the URL, for E2E).
- `bun run lineage:demo status|launch|seed-bids|settle` are the live operator tools (they still use
  `UNWRITTEN_PRIVATE_KEY`; the app does not); the read-only web view is `web/lineage-auction`
  (`bun run web:deploy` → Cloudflare), whose Family tree shows the whole name tree.

### `src/renderer/net` + `src/shared/continent.ts` (open land is shared as a continent)
```ts
export function openContinent({ code, worldId, name }): Result<Continent>;   // y-webrtc room per continent; no host
export function openMyDoor(): Result<string>;  joinContinentByCode(code): Result<string>;  leaveContinent(): void
export function plateOf(worldId): string;      // a world's stable door number (門牌) = the continent code it opens
export function useContinentSync(continent): void;   // publish own world, read the others into useContinentStore
// shared: resolveAnchors(claims) (earlier claim keeps a slot), ownerOf (nearest anchor), territoryMap → at(coord): Territory | null
```
- Every world keeps its own origin, seed and save. Joining gives it an **anchor** (offset in chunks,
  spiral slots `CONTINENT_SPACING` apart); territory = nearest anchor. Only a territory's owner
  witnesses there; a note left on someone's land goes to *their* notes.jsonl. Other worlds are
  shifted into this world's coordinates, so chunk keys, targets and tiles stay local everywhere.
  A save stores a position only on its own land: `samplePlayer()` tags a sample on another
  territory `visiting:<worldId>`, so no checkpoint writes it, and leaving or switching a continent
  while visiting (`leaveContinent` / `openHere`) first brings the player to their own door.
- Y.Doc maps `worlds` / `chunks` / `notes`, keys prefixed `worldId|`; chunks and notes are set once.
  The doc is each machine's own; y-webrtc's room doc stays empty. Entries cross only through
  `continentGate.ts`, to and from a peer whose hello passed `validateContinentHello`
  (@shared/continentHello: same code, protocol and physics version); an unverified peer gets our
  hello and nothing else, and is neither drawn nor counted. Every entry is checked on arrival
  (`readContinentEntry`, `mayWrite`: a peer writes only its own world and chunks, notes on anyone's
  land, and never overwrites a chunk or a note), then zod-checked and re-parsed by the DSL.
- Signaling (`net/signaling.ts`): `signalingServers()` — the per-device list in localStorage
  `unwritten.signaling` (ws/wss URLs, e.g. y-webrtc's bundled server for a two-process E2E), else
  `DEFAULT_SIGNALING`; Settings → Signaling servers views, tests (`probeSignaling`: a real
  publish relayed between two sockets), saves and resets it. A continent retries a handshake stuck
  for 12 s (`retryStuckSignaling`) and, with no server and no verified peer for 20 s, shows the
  error `continent-signaling-unreachable` until one answers. Cartridge bytes, rules, story,
  errands and foes never cross; worlds from different cartridges can merge. Positions ride awareness
  in continent tiles. `landModel`/renderers take an optional `TerritoryMap` so each territory is
  drawn and collided with its owner's seed. Offset markers + foreign doors: `engine2d/continentLayer.ts`.
- The old same-cartridge session room (`room.ts`/`sync.ts`/`RoomPanel`) is only for bounded scenes and
  refuses open land (`room-open-land`). `patches/y-webrtc@10.3.0.patch`: the lower peer id alone
  initiates (upstream glare left one-way data channels).

## Verify before claiming done
1. `bun run check` must pass (typecheck, lint, line limit, and the few isolated tests in `tests/`).
2. E2E: run the flow you changed in the real app, never on the user's own data or window:
   ```bash
   mkdir -p "$TMPDIR/ud"   # copy cartridges in if the flow needs them
   AETHER_TEST_USER_DATA="$TMPDIR/ud" bun run dev --remoteDebuggingPort 9333   # in the background
   bun scripts/cdp-drive.ts "$(cat docs/e2e/<run>/run.json)"
   ```
   Then write the artifact from Rule 0 (`run.json`, `result.md`, screenshots) under `docs/e2e/`.
3. Update the progress page (Rule 0) with what that run verified.
4. Update the READMEs in the same change: `README.md`, `README.zh-TW.md` and `README.ja.md` say the
   same things, so edit all three together. Check them whenever a change touches something they
   state: a feature, the Create steps, controls, menu paths, model providers, commands, the data
   layout, the project layout or the Status table. A Status row turns ✅ only with a link to the
   `docs/e2e/` run that verified it (Rule 2). Menu names and key hints are copied from
   `src/renderer/i18n/strings/`. New screenshots come from an E2E run, resized into `docs/readme/`.
   Say "READMEs unchanged" in your report when nothing they say changed.

Report failures verbatim — a red check or a failed E2E step is information, not something to hide.
