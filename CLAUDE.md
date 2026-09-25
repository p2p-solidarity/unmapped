# Unwritten Land — Electron engine for player-owned, LLM-generated worlds

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
`src/shared/llm.ts`. Keys entered in System → Model are encrypted with the OS keychain and only
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
    ├── app/       screens: App, Boot/Unlock, Worlds, Genesis (covenant), Play (HUD), Console (F12)
    ├── engine/    R3F scene: floor/walls/props/entities, camera modes, movement, proximity, dissolve
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
runs **only** in `<iframe sandbox="allow-scripts">` served by main from a fresh
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
ctx.systemPrompt.variable(name, provider): () => void;   ctx.systemPrompt.assemble(a): { text: string; sections: string[] }
ctx.tools.register(def: ToolDefinition): () => void;   ctx.tools.schemas(): ToolSchema[];   ctx.tools.execute(call: ToolCall, exec): Promise<ToolExecutionResult>
export function defineTool<P>(config: { name; description; parameters: ParamSpecMap; execute(args: P, exec): Promise<JsonValue> }): ToolDefinition
events (waterfall unless noted): "tools/pre-execute"(exec, next) → { kind: "allow" } | { kind: "deny"; reason }, "tools/execute"(exec, next), "tools/post-execute"(exec, result, next), "tools/result"(result) emit
ctx.skills.provider(p: SkillProvider): () => void;   ctx.skills.catalog(): SkillSummary[];   ctx.skills.load(name): Promise<Result<string>>
ctx.effects.provider(apply: (e: GameEffect) => Promise<EffectOutcome>): () => void;   ctx.effects.apply(e): Promise<EffectOutcome>   // validates e with zod first
ctx.world.set(snapshot: WorldSnapshot | null) / ctx.world.get()   // { genesis, meta, scene, karma, inventory, floor }
export function runTurn(input: { ctx; chat: ChatFn; messages: ChatMessage[]; maxSteps?: number; useTools?: boolean; onDelta? }): Promise<Result<TurnResult>>
export function parseModManifest(yaml: string): Result<ModManifest>;   export function modPlugin(bundle: ModBundle): Plugin   // sections + tools + skills, all reversible
export const builtins: { persona, worldContext, worldTools, skillTool }: Plugin[]
```

### `src/renderer/harness`
```ts
export function useWorldHarness(): Harness | null;   // one harness per loaded run; model effects become typed Change Proposals and approved save-owned effects checkpoint the instance. `narrate` is a toast and applies at once. A filed proposal answers the model `ok: true` with a "proposed, not applied" message; leaving Play discards unapproved proposals.
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

### `src/renderer/llm`
```ts
export function chat(request: Omit<ChatRequest, "id">, onDelta?: (text: string) => void): Promise<Result<{ text: string; usage: ChatUsage | null }>>;
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
- Reachability is the host's: every chunk's centre row/column is a ford (`isFord` in
  `@shared/chunks` — water there is sand, nothing grows) and the origin chunk is dry; written chunks
  pass through `clearFords` when they enter the land store. Story gates stand at chunk centres, so
  spawn and every gate are always joined by land. Don't place gates anywhere else.

### Combat and mods (one combat model; mods never refuse a missing module)
- `src/renderer/engine/combat/combatLoop.ts` is the only combat logic (trigger, cooldown, aim
  preview, turns, `strike`). `CombatControl` (3D) and `useLandCombat` (open land) only feed it an
  aim and a clock. On land the roster is the origin's monsters + `wildMonsters` of the 3 × 3 chunks
  around the player (only when `rules.combat !== null`; kind + level, never names or lines); an
  endless roster never "clears" a run, only defeat ends it.
- `src/main/mods/modules.ts`: a proposal that needs a capability the cartridge lacks gets the module
  (and its requirements) locked, its rules turned on with fresh tuning, and a reason line — never an
  error. The only refusal is a module the engine does not have. A mod revision carries the bible,
  story, dialogues and assets of its base unchanged.

### Places on the land (`@shared/places`, `app/land/places.ts`)
- A place (side-scroller `platformer_2_5d@1` or grid dungeon `dungeon_grid@1`) is **save-owned**
  (`land.places`), not a cartridge scene: adding one never makes a new version or a new run.
- The model writes only the life in it (`dsl/prompts/place.ts`); `buildPlace` builds the ground from
  the stored seed on every entry (course / `generateMaze`) and moves every entity onto open ground.
  Never trust model coordinates in a place, never store its walls in the program.
- Entrances stand at chunk centres chosen by `placeSpot` (reachable thanks to the fords). A place is
  played through `GameCanvas({ graph, rules })` while `sessionStore.place` is set; its exits call
  `leavePlace` (far end = crossed) and the land resumes at the entrance via `landReturn`.

### Create a game (`app/create/`, `narrative/newWorld.ts`)
- Four steps: idea (world, optional story material, language, `PlayStyle`: fights none | gun | blade)
  → world (six editable bible cards, each independently rewritable) → story (3–8 editable chapters,
  even without player story material; rewrite, insert, move, remove, lock, or revise the unlocked
  chapters; ids and gates re-derived by `episodePlaces`) → `buildWorld` (origin scene,
  `openLandCartridge` with play style as capability requirements, publish, new save). Only building
  publishes. Autosaved drafts live in `<userData>/workspaces/create.<draftId>/draft.json`, not in
  published cartridges. Changing the idea marks dependent world/story content stale.
- The legacy six-step Create (scene bases, Genre Matrix, capability report, its authoring
  workspaces and IPC) was deleted; do not bring it back. Offer no option the land cannot play
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
export function WorksScreen(): JSX.Element;   // title → "AI Worlds": new world, drafts, saved worlds, journeys
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

### Cartridge ENS names (`src/shared/ensNames.ts`, `src/main/chain/ens*.ts`, Sepolia ENSv2)
```ts
export function ensNamesConfig(env?): EnsNamesConfig;      // { parent: "x.eth" | null, writable }
export function claimCartridgeName(pointer, env?): Promise<Result<{ name; txHashes }>>;   // main only
export function lookupCartridgeName(name): Promise<Result<CartridgePointer | null>>;      // renderer, via the Universal Resolver
window.seed.chain.claimName(cartridgeId, version)   // main re-reads the revision; the renderer never supplies the hash
```
- A published revision is named `<cartridgeLabel(cartridgeId)>.<parent>`; its text records are only
  `unwritten.cartridge` / `unwritten.version` / `unwritten.hash` (frozen keys). Content never goes on chain.
- `bun run ens:setup <label> [--dry-run]` is run by a person (Sepolia gas; MockUSDC is free): it deploys
  the key's Permissioned Resolver + the parent's User Registry and registers `<label>.eth`, then prints
  `UNWRITTEN_ENS_*`. `--dry-run` replays every step through `eth_simulateV1` and resolves a test subname.
- `ENSV2_SEPOLIA` (`ensCalls.ts`) is the deployment the Universal Resolver walks today
  (`ens_v2_sepolia_20260916`), not the older table in the ENS docs; this build's resolver takes
  DNS-encoded names. The setup script refuses to run if the live root no longer matches.
- Title → Cartridges shows each cartridge's name live (unclaimed / this version / another version,
  claim on a keyed machine) and "Open by ENS name" follows a name back to a revision in the library.

### Lineage market (`contracts/src/lineage`, `src/main/chain/lineageCalls.ts`, Sepolia; docs/plans/lineage-market.md)
```ts
LineageRegistry.launch({ label, parent, owner, cartridgeId, version, contentHash, supply, lpReserve, auctionBlocks, floorPriceQ96, tickSpacingQ96, requiredCurrencyRaised })
// → ENS name under the parent world's name + remix registry + WorldToken + Uniswap CCA (LBPStrategy) priced in the parent's token
LineageHook   // v4: only LBPStrategy opens world pools; afterSwap 1% royalty, 50/30/20 up the line; claim() pays the ENS name holder
LineageRouter // buy/sell along pathTo(world) in one unlock
```
- The registry keeps only `REGISTRAR | SET_PARENT` on every registry it makes, so every world name is an
  emancipated ENSv2 token (safe transfer works). Never grant it, or anyone, a role from
  `UNEMANCIPATED_ROLE_BITMAP`; a world's remix registry is made at launch for this reason.
- Worlds live under their own `<label>.eth` (the registry's root registry), not the `ens:setup` parent.
- `bun run contracts:build` rebuilds `contracts/LineageMarket.json` (`scripts/build-lineage.mjs`); the
  structs in `LaunchTypes.sol` mirror liquidity-launcher v3.1.0 / CCA v2.1.0 field for field.
- `bun run lineage:market --dry-run` is the check: it simulates deploy → three generations of
  launch/auction/graduation → swaps → royalties → name transfer → refusals on Sepolia's real contracts
  (the failure list is at the top of `scripts/lineage-market.ts`). A live deploy is run by a person.
- Not wired into the app yet: no IPC or screen launches or trades.

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
- Y.Doc maps `worlds` / `chunks` / `notes`, keys prefixed `worldId|`; chunks and notes are set once.
  Everything read from it is zod-checked and re-parsed by the DSL. Cartridge bytes, rules, story,
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

Report failures verbatim — a red check or a failed E2E step is information, not something to hide.
