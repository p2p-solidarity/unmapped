# Aether Spire — Electron engine for player-owned, LLM-generated worlds

Desktop-first (Electron) implementation of `plan.md`: the model writes a tiny **OpenUI Lang
dialect** (our game DSL), a parser is the source of truth, Three.js renders it, the world lives as
plain-text dotfiles the player owns, saves are encrypted with a passkey-derived key when WebAuthn
PRF is available, and friends join a shared document room over WebRTC signaling. Read this file
before editing anything.

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
`src/shared/llm.ts`. Keys are read from `.env` **in the main process only**.

## Rules (each one exists because the previous version of it caused a bug)
### Rule 0. Do not over engineering
- TDD test to much only need to know this part can run is ok

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
- World state lives only in the world's dotfiles (Rule 9). `localStorage` is for per-device
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

### Rule 9. Dotfiles are the save format
A world is a directory the player owns (`<userData>/worlds/<id>/`):

| file | content |
| --- | --- |
| `meta.json` | `WorldMeta` plus the current durable atmosphere mutation overlay |
| `genesis.json` | `Genesis` (covenant answers, language, seed) |
| `world.oui` | current floor as an OpenUI Lang `Scene` program |
| `karma.jsonl` | one `KarmaEntry` per line — every choice, wish and floor change |
| `inventory.json` | `Inventory` |

`meta.json` also carries `mutation` (the persisted sky/fog/biome overlay), `flags` (tool-set
switches) and `mods` (enabled mod names). Installed mods live outside worlds in
`<userData>/mods/<name>/` (see docs/harness.md).

Hand-editing mutable files in a text editor must hot-reload the game (chokidar → `worlds:changed`).
`genesis.json` is the creation-time covenant and intentionally applies on the next world load.
A `.seed` is a zip of that directory (fflate). An encrypted `.seed.enc` is AES-GCM with the
passkey-PRF key when available (or the same-machine keychain fallback).

### Rule 10. Language is the player's (Babel)
UI chrome is English. Everything the model says (NPC lines, choices, item names) is generated in
`genesis.language` (the OS locale on first run). Never translate model output client-side.

## Layout & ownership

```
src/
├── shared/        contracts — result.ts, world.ts (vocabulary + SceneGraph), llm.ts, ipc.ts, events.ts
├── dsl/           OpenUI Lang game dialect: schemas, libraries, prompts, parse, repair, grammar, limits
├── main/          Electron main: index, ipc, worlds/ (dotfiles+watcher), vault/, seeds/, inference/
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
tests/             vitest (dsl, shared, main/worlds with tmp dirs)
```

### Rule 11. Extensions are prompt + tools, never code (docs/harness.md)
The harness (`src/harness`, Cordis-based like deepseek-harness) is how anything talks to the
model: prompt **sections** with an `order`, **tools** defined with `defineTool`, **skills**, and
a **GameEffect** seam (`src/shared/effects.ts`) that is the only way a tool changes the world.
Mods (`<userData>/mods/<name>/mod.yml`) contribute sections, declarative tools (effect templates)
and skills. No mod ever ships JavaScript; no plugin bypasses `ctx.effects`. Every registration
is a reversible `ctx.effect()` so mods can be mounted/unmounted while a world is open.

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
export function useWorldHarness(): Harness | null;   // one instance per loaded world; mounts builtins + meta.mods bundles (read over IPC); effect provider bound to the stores + IPC persistence
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
- `worlds/` implements every `SeedApi.worlds` method on disk + chokidar watcher → `worlds:changed`.
- `vault/` returns/creates the 32-byte fallback key with `safeStorage` (stored encrypted in userData).
- `seeds/` zips/unzips world dirs with fflate; `.seed` files carry `meta.json` at the root.
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
- WASD/arrow movement (Rapier kinematic character), `E` interacts with `engineStore.nearby`,
  `C` cycles `cameraMode` (orbit / iso / fps). Ignores input while `inputLocked`.
- Proximity (≤ 2 tiles) publishes `setNearby`; interact publishes `interact(target)`.
- `mutationSeq` change → 0.5 s shader dissolve/crossfade of palette + fog (hot-swap).

### `src/renderer/identity`
```ts
export function unlock(): Promise<Result<UnlockedKey>>;   // tries WebAuthn PRF (create/get with prf.eval salt "aether-spire/v1"); on `prf-unsupported` falls back to window.seed.vault.getKey()
export function encryptBytes(key: UnlockedKey, bytes: Uint8Array): Promise<Uint8Array>;   // AES-GCM, 12-byte IV prefix, versioned header
export function decryptBytes(key: UnlockedKey, bytes: Uint8Array): Promise<Result<Uint8Array>>;
export function resolveEnsSeed(name: string): Promise<Result<{ address: string; seedUrl: string | null }>>;   // viem mainnet public client, text record "aether.seed"
```

### `src/renderer/net`
```ts
export function createRoom(worldId: string): Result<Room>;   // y-webrtc room "aether-spire:<code>" with a 6-char join code; mirrors world.oui + karma into a Y.Doc
export function joinRoom(code: string): Result<Room>;
export interface Room { code: string; doc: Y.Doc; peers(): PeerInfo[]; onPeers(cb): () => void; leave(): void }
```

## Verify before claiming done
`bun run check` must pass. For UI/engine work also run `bun run dev` and exercise the flow you
changed. Report failures verbatim — a red check is information, not something to hide.
