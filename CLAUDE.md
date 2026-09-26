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
encrypts portable player data and is wrapped by passkey PRF or the OS keychain. What a world's
land holds is a signed, append-only **history** (rev 6 phase 3) that a world service may sequence
so friends share it; continents still meet over WebRTC signaling. Model calls stay on devices: a
player's own key, a local model, or the metered generation gateway (phase 4). Read this file
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
`src/shared/llm.ts`. Keys entered in Settings → Model are encrypted with the OS keychain and only
read by the main process; `.env` keys are also read in main as a fallback.

Two optional Bun servers; neither is needed to play (see their sections):

```bash
UNMAPPED_SERVICE_TEST=1 bun run service -- --port 8787 --data "$TMPDIR/svc"   # a world service: Settings → Shared worlds → ws://127.0.0.1:8787
bun run gateway -- --port 8788 --data "$TMPDIR/gw"                           # the generation gateway: UNMAPPED_GATEWAY_URL=http://127.0.0.1:8788
```

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
- World + session + inference + land + history + low-frequency engine state → the stores in
  `src/renderer/state/`. Only add fields there when two modules need them.
- Local UI state (expanded, hovered, draft text) → `useState` in the smallest component.

### Rule 5. Errors are values
Cross-boundary calls (IPC, LLM, chain, peers, filesystem) return `Result<T>`; never throw across
IPC and never swallow. `code` is machine-readable, `hint` tells the user how to fix it.

### Rule 6. Electron security
`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. The renderer talks to main
only through `window.seed` (preload `contextBridge`) using channels from `src/shared/ipc.ts`.
Secrets (`OPENAI_API_KEY`, `THESYS_API_KEY`) never reach the renderer. Validate every IPC payload
in main (zod) — the renderer is untrusted once mods/P2P exist. The same holds for provider keys,
the device key and the gateway account token: main only; the renderer sees a `KeyStatus`, a route
view or an account status, never a value. Every `UNMAPPED_*` / `QWEN_IMAGE_*` var is read in main
(or in the service / gateway process that owns it), never in a renderer or a browser page.

### Rule 7. DSL is the truth, the model is a guest
- The model only ever writes OpenUI Lang programs against our libraries (`src/dsl`). No JSON
  blobs, no JS, no `eval`, no `new Function`.
- Parse with `@openuidev/lang-core` (`createParser(library.toJSONSchema())`), convert with
  `toSceneGraph / toDialogue / toItem`, and **repair** by re-prompting with `OpenUIError[]` at
  most twice (`src/dsl/repair.ts`). Unparseable after that → `error` state, not a fallback scene.
- Every numeric prop is clamped to the ranges in `src/dsl/limits.ts` so a hallucinated `x=9000`
  cannot break the engine.

### Rule 8. Import direction
`shared ← dsl ← { main, renderer, service }`; `shared ← gateway`; `shared ← dsl ← renderer ← browser`.
`renderer` never imports `main`; `main` never imports `renderer`. `dsl` has no React/Electron
imports (it must run in vitest, in main and in the service). The world service (`src/service`)
imports only `@shared` and `@dsl` (verdicts, `.world` files; plus viem and the committed
`contracts/WorldProvenance.json` for its chain recorder); the gateway (`src/gateway`) only
`@shared`; the browser proof (`src/browser`) `@shared`, `@dsl` and `@renderer`, never `main`. Nothing in `src/`
imports `service`, `gateway` or `browser` — only their tests and `scripts/`. `tsconfig.node.json`
compiles main, service, gateway and scripts with an `@main/*` alias, so the compiler does not
enforce this for service or gateway: check imports by hand. `@main` / `@renderer` also resolve in
`tsconfig.test.json` and `vitest.config.ts`, for tests only; `tsconfig.browser.json` has no `@main`.

### Rule 9. Cartridge content, instance progress, and workspaces have separate owners

- `<userData>/cartridges/<cartridgeId>/<version>/` is an immutable published revision:
  `manifest.json`, `rules.oui`, and declared `scenes/<sceneId>.oui`. Its content hash is its exact
  identity. Play and model tools never write here.
- `<userData>/instances/<instanceId>/` owns `instance.json` plus the active
  `saves/<saveId>/{save.json,karma.jsonl}`. The save pins an exact cartridge id, version, and hash;
  flags, inventory, mutation, current scene, and completion live here. A save that plays in a
  world (rev 6 phase 3) also has `world.json` (the pin: `worldId` + the migration digest; the
  commit point) and `progress.json` (`WorldProgress`: errands, episodes, places), both owned by
  `main/histories/`. `save.json` keeps its exact legacy shape (its schemas are `.strict()`, so a new
  field breaks older builds); its legacy land fields are frozen once `world.json` exists.
- `<userData>/histories/<worldId>/` (`main/histories/paths.ts`) owns a world's shared history:
  `log.jsonl` (line n = entry n, append-only), `outbox.jsonl` (own events awaiting a receipt),
  `refused.jsonl` (never deleted), `link.json` (service URL + pinned key), `snapshot.json` (fold
  cache), `received-works.json`, `uploaded-packs.json`, `issued-invites.jsonl` (never the `k=`
  secret); `histories/index.json` maps `instanceId → worldId` and is rebuilt from every log's line 1.
- `<userData>/blobs/<sha256 hex>` (`main/blobs/`): cartridge and work packs, verified on read.
  `<userData>/identity/device.key` (`main/identity/`): this device's Ed25519 key, safeStorage-
  encrypted, never regenerated over an unreadable file. `<userData>/images.json`: the image
  provider choice (an id only). `<userData>/provider-keys/<provider>.key`: saved keys, including the
  gateway account token as `hosted.key`.
- Picture licences: `assets/licences.json` in a cartridge revision (hashed, written by main at
  publish); `works/<workId>/<version>/licences.json` beside an AI world (outside `contentFiles`, so
  not in its content hash; carried in its work pack); per-picture records in
  `workspaces/create.<draftId>/looks/<id>.json` and `work-drafts/<draftId>/pictures/<hex>.json`.
- `<userData>/workspaces/<workspaceId>/` is the mutable authoring copy. Structural scene/rule edits
  go here, then full validation publishes a new immutable revision with explicit lineage.
- `<userData>/worlds/<id>/` is the legacy five-dotfile format. Keep it readable and recoverable;
  migration creates a cartridge plus pinned instance and never deletes the source automatically.

A `.cartridge` contains content only. A `.spire-backup` contains one instance and active save only
(plus, for a save in a world, `world.json`, `progress.json` and `history/{log,outbox}.jsonl`), and
restore requires its exact cartridge revision; a restored history is written only when absent or a
chain prefix, otherwise both are kept (`backup-history-diverged`). A `.world` file holds one shared
world with no personal state (see "`.world` bundles"). Outside userData: a world service's
`--data` dir and a gateway's `--data` dir (their sections list the files). Encrypted portable data
uses a random AES-GCM Data Key; PRF/keychain-derived keys only wrap that Data Key, with one validated
wrapping record per credential. Installed mods remain outside saves in `<userData>/mods/<name>/`
(docs/harness.md).

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
├── shared/        contracts — result.ts, world.ts (vocabulary + SceneGraph), llm.ts, ipc.ts, events.ts;
│                  history/ (events, log, fold, admit, beats, rumors), worldProtocol.ts, worldBundle.ts
├── dsl/           OpenUI Lang game dialect: schemas, libraries, prompts, parse, repair, grammar, limits;
│                  history/ (verdicts, body validation, migration planning, .world read/write)
├── main/          Electron main: cartridges/, instances/, workspaces/, legacy worlds/, vault/, inference/
│                  (+ route.ts), histories/ (world host + sync), identity/ (device key), blobs/, images/,
│                  account/ + billing/ (gateway client), bundles/ (.world files), chain/ (+ provenance.ts)
├── preload/       contextBridge → window.seed (SeedApi)
├── service/       the world service (Bun): sequences histories, verdicts, beats, claims, blobs, mirrors
├── gateway/       the generation gateway (Bun): device-key accounts, quota ledger, upstreams, billing/
├── browser/       the browser proof (Vite page): its own window.seed, WebCrypto key, IndexedDB, sw.js
├── relay/         the lineage market's gas station (Cloudflare Worker)
└── renderer/
    ├── app/       screens: title (WorldsScreen), library/ (Worlds), create/, Play (HUD), Console (F12)
    ├── engine2d/  the land and places in 2D (the one engine players see); hd2d/ is the land's HD-2D look
    ├── engine/    R3F scene (frozen: legacy bounded scenes only), shared targets, combat, keys, palettes
    ├── input/     gamepad poller + touch pad + focus navigation (one action map, @shared/input)
    ├── narrative/ generateScene / generateDialogue / generateItem (prompt → chat → parse → repair)
    ├── llm/       renderer-side streaming client over IPC
    ├── history/   the open world's fold, the land drawn from it, writing drafts to main
    ├── mobile/    the phone shell the browser proof mounts (LandView2D, touch pad, notes)
    ├── identity/  passkey PRF unlock + keychain fallback, AES-GCM, ENS name lookup (lineage tree)
    ├── net/       yjs + y-webrtc rooms + continents; world services list; world presence
    ├── state/     zustand stores (world, engine, session, inference, land, history, continent, …)
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
everything else). What each chapter wrote is a `chapter` event in the world's history (rev 6 phase
3; a save without a world yet keeps `land.episodes[id].stage`); how far the player got is in
`progress.json`, and the carried items stay in `save.json` (`land.storyCarry`). A chapter is played **in the game itself**,
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
screen must still work and say plainly that no ledger is set up. The same holds for the light
chain of shared worlds (`WorldProvenance`, see "Provenance"): off unless configured, read-only in
the app.

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
  client (the effective config from `routeFor`, see "Routing, account and billing"), streaming →
  `inference:event`, abort, `/v1/models` probe, and the `llama-server` sidecar (spawn, health poll,
  kill on quit). Apple's on-device model (`apple-fm`) is answered inside the app by the afm-bridge
  `chat` method (`appleChat.ts`: streamed partials, host tool calls, cancel) — never `fm serve`, no
  port, no `sudo fm license`; a saved `fm serve` config is read as Apple-in-app. The bridge budgets
  every Apple call with the model's own `tokenCount` (main sends `maxTokens` + `minTokens`, never its
  `fitOutput` estimate), and a request with a `program` shape (`programShape` in `src/dsl`, today only
  `BIBLE_SHAPE`) is answered under guided generation and written back as an OpenUI Lang program the
  parser still checks — the small model does not close a free-text list.
- `histories/`, `identity/`, `blobs/`: a world's shared history on this device (see "`src/main/histories`").
  `account/`, `billing/`: the gateway client. `images/`: picture providers and licences.
  `bundles/`: `.world` files and moving worlds. Each has its section below.
- `usage/` owns the usage ledger `<userData>/usage.jsonl` (@shared/usage): one append-only line per
  model call — purpose, world scope, provider, model, input / output / cached tokens, ms, outcome —
  written where each chat, Apple scene or image request settles (never by the renderer); numbers
  only, never a prompt, answer or key. A world's total folds in the Create draft linked to it.
- Pictures: every picture goes through an `ImageProvider` from `main/images/` (swap the model = swap
  the object; `works/images.ts` now only keeps `assetPrompt` and re-exports); its look comes from the
  world (its maker's words, its library art), never a house style.
  `generate(prompt, signal, { reference?, quality?, kind? })`: with a `reference` PNG the OpenAI and
  hosted providers call `images.edit`. Keys only through `resolveApiKey` / `resolveProviderKey`
  (`inference/keyStore.ts`: saved → `.env`), never `process.env` directly. A world's look picture is the cartridge asset `assets/look.png`
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
  belongs to the world, not the cartridge: a `place` event of its history (`PlaceBody`, rev 6
  phase 3), so adding one never makes a new version or a new run and every member walks into it.
  Its id is `legacyId ?? "p" + 8 base32 chars of the event id`. Crossing it is the player's own
  `progress.json` plus a `place.crossed` deed. A save without a world yet still reads `land.places`
  (`landPlaceSchema`); migrated saves never write it again.
- The model writes only the life in it (`dsl/prompts/place.ts`); `buildPlace` builds the ground from
  the stored seed on every entry (course / `generateMaze`) and moves every entity onto open ground.
  Never trust model coordinates in a place, never store its walls in the program.
- Entrances stand at chunk centres chosen by the writer with `placeSpot` (reachable thanks to the
  fords); `admit` only checks the spot is free (`place-spot-taken`: home, a gate or a live place;
  `place-spot-far` beyond 64 chunks), and the renderer recomputes and resubmits with no model call.
  The fold never runs `placeSpot` (`Math.hypot` stays out of it). A written
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
  panel, a `role="dialog"` layer: Language, Model, Account, Plan, Images, Signaling servers, Shared
  worlds, build info, unlock). Worlds is the `library` screen: sections New game (the built-in
  world), Saves, Join a world, World files, Cartridges, Continent, Market, and Archive when legacy
  worlds exist (`library/sections.ts` — a new section is one entry there). Do not add title entries.
- One action map for keys, pads and touch (`@shared/input`: standard-mapping layout, dead zones, menu
  actions). `useGamepad()` (mounted once in App) polls `navigator.getGamepads()`: in Play with no
  layer open it makes the key each pad action is bound to count as held/pressed in the same
  `engine/useKeys.ts` held set (A interact, B jump, X fire, Y notes, LB emote = T, RB sprint, Start = Esc), so
  engine code never reads pads; anywhere else it moves DOM focus spatially inside the top-most layer
  (`[data-layer]`, `role="dialog"`), A clicks, B / Start send Escape. Mark new panels over Play with
  `data-layer`, give screens one initial focus (`.g-autofocus` / `data-autofocus`), and never make
  something needed to play reachable only by mouse. Touch is a third `InputDevice`
  (`"keys" | "pad" | "touch"`, `input/device.ts`): the on-screen `mobile/TouchPad` writes a
  standard-mapping `PadSnapshot` (`input/touch.ts`) that `readPad()` merges with real pads, so
  engine2d never learns touch exists. Hint rows show pad glyphs after a pad or touch input.
  `scripts/cdp-drive.ts` `{"pad": {buttons, axes, ms}}` installs a virtual pad for E2E; `viewport`,
  `touch` (`Input.dispatchTouchEvent`) and `offline` drive a phone-sized page. Offer no option the land cannot play
  (companions exist in the rules but are not drawn or followed on the land yet).

### `src/renderer/identity`
```ts
export function unlock(): Promise<Result<UnlockedKey>>;   // PRF/keychain derives a wrapping key, then unwraps or creates the random Data Key
export function wrapDataKey(wrappingKey, dataKey, identity): Promise<DataKeyWrappingRecord>;
export function encryptBytes(key: UnlockedKey, bytes: Uint8Array): Promise<Uint8Array>;   // AES-GCM with the unwrapped Data Key, 12-byte IV prefix, versioned header
export function decryptBytes(key: UnlockedKey, bytes: Uint8Array): Promise<Result<Uint8Array>>;
export function lookupEnsName(name: string): Promise<Result<EnsLookup | null>>;   // ENSv2 Sepolia, viem Universal Resolver (never hard-code its address): a lineage name's revision, a save's checkpoint and door
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

### ENS names: worlds, saves, players (lineage tree; `src/main/chain/{names,nameIndex,players,launch}.ts`, `app/market/`)
```ts
window.seed.market.cartridgeName(cartridgeId, version, key | null, label | null): Result<EnsNameStatus>   // + market: { token, parentName, parentLaunched }
window.seed.market.saveName(instanceId, label | null, key | null): Result<SaveNameView>     // a save, its cartridge's name, its own name + door
window.seed.market.playerName(key, label | null): Result<PlayerView>;  playerNames(addresses): Result<Record<address, name>>
MarketAction { kind: "name-cartridge"; cartridgeId; version; label? } | { kind: "name-save"; instanceId; label }
  | { kind: "launch"; cartridgeId; version } | { kind: "name-player"; label }   // passkey-signed, station-paid
export function lookupEnsName(name): Promise<Result<EnsLookup | null>>;   // renderer: revision + a save's checkpoint + door
export function saveFingerprint(instancesDir, instanceId, cartridgesDir?): Result<{ name, pin, saveHash, progress }>   // main/instances/saveHash.ts
```
- One tree under `UNWRITTEN_LINEAGE_PARENT` (`unmapped.eth`): a revision is `<label>.<root>`, a remix
  `<label>.<parent's name>` once the parent has one, a save `<label>.<cartridge's name>`, a player
  `<label>.players.<root>`; saves and players are held by the player's PasskeyAccount.
- A cartridge's name is found by its **cartridge id** (`nameIndex.ts`: NameRegistered logs + `nameOf`,
  earliest wins), never re-derived from a label. So the first naming may pick the label (a world called
  霧之森 has a punycode id; the player names it `misty-forest.<root>`); after that it is fixed.
- Main reads everything it writes from disk (revision id / version / hash / lineage; the save's
  fingerprint and door); the renderer only picks which revision or save and a label. Content never goes
  on chain. Text keys are frozen: `unwritten.cartridge/version/hash`, plus `unwritten.kind`,
  `unwritten.save`, `unwritten.progress` for saves and `unwritten.token/auction` for a launched world.
  A save's name also carries its door number in the standard `description` (`UNMAPPED save · door
  ABC234`, `@shared/doorCode`), written with `describe` whenever it differs.
- A save's fingerprint is sha256 of canonical JSON of what a `.spire-backup` carries (save state
  without `updatedAt`, karma, written land), never ids or paths, so a restored backup hashes the same;
  Worlds → Saves finds an existing save name by that hash (`SaveRecorded` logs), else the newest one
  this passkey holds. Progress is one English line from real state ("2 chapters cleared · 14 deeds";
  a history-mode save's clears in progress.json count too).
- **Player names.** The registry has no player kind: the operator registered the directory
  `players.<root>` once (`bun run lineage:demo players`), and a player's name is a `recordSave` under it
  whose `unwritten.save` is the sha256 of the passkey's public key. One per account. Worlds → Market
  shows it in place of `0x…`, "Use as my player name" makes it the name others see on a continent, and
  every holder/owner line shows player names (`playerNames`).
- **Launch from the app.** The holder of a current cartridge name puts it on the market
  (`chain/launch.ts`): `LineageRegistry.launch` with `LAUNCH_TERMS` (`@shared/market`, main picks every
  parameter); a remix only after its parent. The station pays it alone in its batch under its own caps.
- **In the game.** The HUD's player card shows the save's (else the world's) ENS name; when a chapter is
  cleared, a card offers to move the save's name to the new checkpoint (or record it) with one passkey
  signature. Create's last step offers to name the new world before entering it. A friend's door field
  takes a door number or a save's ENS name (its door comes from `description`).
- Worlds → Cartridges shows each revision's name (free / this version / the player's, older / someone
  else's, other version / another cartridge), names, repoints or launches it; "Open by ENS name" follows
  a name back to a revision, and a save's name to its checkpoint. `ENSV2_SEPOLIA` (`ensCalls.ts`) is the
  deployment the Universal Resolver walks today (`ens_v2_sepolia_20260916`); this build's resolver takes
  DNS-encoded names. The older `ens:setup` parent and the F12 `aether.seed` lookup were removed.

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
  token or auction, or the registry's naming functions and `launch` — a launch travels alone, under a
  7M gas cap and `MAX_LAUNCH_FEE_GWEI`), `faucet`, `exit`/`claim`/`graduate`, `royalties`. It simulates
  first, caps gas per kind and the fee (`MAX_FEE_GWEI`), refuses browsers (`Origin`) and rate-limits per
  client. `bun run relay:dev` runs it locally; `relay:deploy` ships it.
- Electron dev cannot reach Touch ID, so `chain/signBridge.ts` serves a localhost page the system
  browser opens for the one signature (`UNWRITTEN_SIGN_BROWSER=none` only logs the URL, for E2E).
- `bun run lineage:demo status|launch|seed-bids|settle|players` are the live operator tools (they still use
  `UNWRITTEN_PRIVATE_KEY`; the app does not); the read-only web view is `web/lineage-auction`
  (`bun run web:deploy` → Cloudflare), whose Family tree shows the whole name tree.

### `src/renderer/net` + `src/shared/continent.ts` (open land is shared as a continent)
```ts
export function openContinent({ code, worldId, name }): Result<Continent>;   // y-webrtc room per continent; no host
export function openMyDoor(): Result<string>;  joinContinentByCode(code): Result<string>;  leaveContinent(): void
export function plateOf(worldId): string;      // a world's stable door number (門牌) = the continent code it opens (@shared/doorCode)
export function useContinentSync(continent): void;   // publish own world, read the others into useContinentStore
// shared: resolveAnchors(claims) (earlier claim keeps a slot), ownerOf (nearest anchor), territoryMap → at(coord): Territory | null
```
- Continents are frozen and only for worlds kept on this device (rev 6 phase 3, D12): a world
  attached to a world service refuses one (`continent-world-attached`, `net/continentActions.ts`),
  and one that turns out attached while on a continent leaves it. A continent's `worldId` is still
  the instance id; its land comes from the fold via `useLandStore`.
- Every world keeps its own origin, seed and save. Joining gives it an **anchor** (offset in chunks,
  spiral slots `CONTINENT_SPACING` apart); territory = nearest anchor. Only a territory's owner
  witnesses there. A note a visitor leaves on a world in a history is not kept by itself: it waits
  (at most `VISITOR_NOTES_PER_DAY` per visitor) until the owner keeps it as an owner-signed `note`
  with the visitor's name and `via: "continent"`. Other worlds are
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

## Shared worlds and what surrounds them (rev 6 phases 3–4: docs/plans/rev6-phase3.md, rev6-phase4.md)

### `@shared/history` + `@shared/worldProtocol` (the history, pure)
```ts
// A world = its genesis (worldId = the genesis event's id) + one sequenced, append-only log. No DAG.
HistoryEvent { v: 1; world; kind; author: "k"+base32(Ed25519 pub); at; seen; body; id: "h"+base32(sha256(canonical event − id − sig)); sig }
LogEntry { n; rt; chain; event; rsig }   // chain(n) = sha256(chain(n−1)\nn\nrt\nid); rsig null only in a local-only world
export function admit(now: WorldNow, event: HistoryEvent, rt: string): Result<Admission>;
export function applyEntry(now: WorldNow, entry: LogEntry, verdict: EntryVerdict): WorldNow;   foldEntries(now, entries);   withPending(now, outbox, rt)
export function computeBeat(now: WorldNow, at: string): Result<BeatComputation>;   FOLD_VERSION;   WORLD_PROTOCOL = 2;   protocolRefusal(now, protocol)
```
- One validation everywhere: `readEvent` → `verifyEvent` → `validateEventBody` (`dsl/history`) →
  `admit`. Main and the service compute each entry's verdict with `entryVerdict`
  (`dsl/history/verdict.ts`); the renderer receives it and folds. `verifyLog` checks the chain, an
  ownership pass, then the receipt key schedule (from admitted `sequencer` entries; a rehost
  switches keys from its own entry on).
- Fold, admit, beat and rumor code are deterministic: integers, strict-ISO `Date.parse`, code-unit
  comparison; never `Math.hypot/cos/sin/pow`, `localeCompare`, `Intl`, `toLocale*`, `toLowerCase`.
  Geometry stays with the writer (`placeSpot`, `trailPlace`); admit only checks the result is free.
- History only accumulates. Fog (low care, 28 quiet days, beyond the town ring; home, chapters,
  places and traces never fog), legends 傳說, variants 異聞 (a child of a variant is one too) and
  `hide` are views. An unknown kind or `v` is kept, skipped and counted "from a newer build".
- An event is ≤ 128 KiB of canonical JSON (the binding cap); other caps are `HISTORY_LIMITS`.
- Bump `FOLD_VERSION` with any change to fold, admit, beat or rumor rules. A validator change that
  refuses what an earlier build admitted also bumps `PHYSICS_VERSION` (beat constants are
  `BEAT_RECORDED` in `tests/shared/physics.test.ts`).
- A rumor cites one event its beat chose (never a note or gift); `validateRumor` checks names, not
  tone: no known label but the cited and allowed ones.
- Protocol 2 adds co-owners (`owner.add` / `owner.remove`; the last owner stays) and
  `chain { record }`; a protocol-1 client opening such a world gets `protocol-newer`.
- Invite link: `unmapped://join?i=<invite>&k=<one-time secret>[&o=<≤ 4 owner.add events>]`. The log
  holds only the signed invite and a `proof` bound to the joiner's key, never the secret. Doors:
  `private` | `friends` (default) | `public` (visitors write only `VISITOR_KINDS`).

### `src/service` (the world service, Bun)
```bash
UNMAPPED_SERVICE_TEST=1 bun run service -- --port 8787 --data <dir> [--browser-origin <origin>] [--beat-every 1m]
bun run service -- import <file.world> --data <dir>   |   export <worldId> --data <dir> [--out <file>]
```
- Stores and relays signed history, computes verdicts, runs `admit` and beats (6 h), holds claim
  leases (90 s, renewed by deltas, ≤ 10 min), relays presence and streams. It never calls a model,
  holds no model key, and never changes or deletes an entry.
- One WebSocket (`/v1/ws`), frames ≤ 256 KiB read by `readToService` / `readFromService` on both
  sides; blobs over HTTP (`/v1/worlds/<id>/blobs/<sha256 hex>`, signed `X-Unmapped-Auth` ±300 s).
  Limits are host flags answered with `quota-*`; only protocol violations close a socket. Visitors
  share one per-world budget (`quota-visitors`) that never touches members.
- `--data`: `service-key.json` (0600; its worlds verify only with it), `worlds/<id>/{log.jsonl,
  blobs.txt, snapshot.json, imported.json}`, `blobs/<sha256 hex>`. Claims and presence are memory only.
- `UNMAPPED_SERVICE_TEST=1` enables `--beat-every` and `POST /v1/test/advance {days}` (moves the
  receipt clock, beats at once). `bun run world:probe` attacks the socket with throwaway keys.
- A mirror (an imported `.world` not sequenced here) serves reads; submits get `world-mirror-only`
  and claims are refused until a rehost `sequencer` names this service's key.

### `src/main/histories` + `window.seed.world` (this device's side)
```ts
window.seed.world.ensure(instanceId, name)   // migrate once, catch up, adopt: lazy, idempotent
  .read · .append(worldId, draft /* carries seen */) · .claim · .sendStream · .sendPresence · .attach(worldId, url)
  .invite(worldId, { uses, days }) · .join(link, name, instanceId?) · .setAccess · .hide · .addOwner · .setChainRecording · …
// events: world:entries (with verdicts) · world:status · world:presence · world:stream
```
- `WorldHost` owns the loaded worlds and one socket per service URL; `ipc.ts` only validates.
- Main runs every check before it signs a renderer draft (`seen` ≤ head, `readEvent`,
  `validateEventBody`, `admit`). The renderer drafts only `DRAFT_KINDS`.
- A local-only world appends straight to its log (its owner's device beats it on open); an attached
  one queues in the outbox and submits. Refused events stay listed until dismissed (Rule 2).
- Sync is "after my n" with a chain check; a mismatch is `history-diverged`, kept in `link.json`,
  never merged. Only `wss://`, or `ws://` on loopback; a changed service key is fatal.
- Migration (`ensure.ts`, `planMigration`) is lazy, idempotent, never destructive, never lossy:
  deterministic signatures, `world.json` written last. Catch-up after an older build appends only
  missing ids; a chunk that fails validation stays drawn (`legacyOnly`) and is listed.
- The device key is never regenerated over an unreadable file; without one a history still reads,
  and writing waits. A never-attached world restored on another device is adopted (new genesis, all
  re-signed, owner changes and `chain` left out); an attached one is `world-device-not-member` there
  until an invite.
- `join` verifies the invite and the whole log, installs the exact revision from the `pack` blob,
  and writes the history before the save; a refused join writes nothing. A received work never
  replaces a local `workId@version` and never shows in the otherworld picker.

### `src/renderer/history` (the land on its world's history)
```ts
export function openWorldLand(instanceId: string): Promise<void>;   appendToWorld(draft: WorldDraft): Promise<Result<WorldAppended>>
export function landFromHistory(now: WorldNow, legacy?): LandFromHistory;   seenHead(): number;   writeBlocker(): AppError | null
```
- `useHistoryStore` holds the open world; `useLandStore` in `history` mode is a view of the fold
  (`applyWorld`) plus `personal` (progress.json) and `live` (save.json fields). Content goes to the
  history, never the store. `legacy` mode is a save with no device key yet.
- `seen` is `seenHead()` read before the model call, never after, so a slow write becomes a variant.
- Before witnessing, a live witness in the fold is drawn with no call; an attached, online world
  claims `chunk:cx,cz` for ≤ 1.5 s (`app/land/claims.ts`): `written` → sync, `writing` → watch that
  stream (no call), `granted` → generate and relay, `refused` → error, timeout → write locally.
  Chapters claim `chapter:eN`, rumor batches `rumors:<beat>`. Walking never waits for this.
- Every view (marks, traces, "They say…" rumor rows, mist, season tint) skips hidden events.
  Presence (`net/worldPresence.ts`) is attached + online + in Play only, emotes on T / LB, never saved.
- The rumor switch (Settings → Shared worlds) is on for the owner, off for members, and off
  whenever the route would be hosted: an allowance is never spent in the background by default.

### `src/gateway` (the generation gateway, Bun)
```bash
bun run gateway -- --port 8788 --data <dir> [--free-credits <n>] [limit flags]
bun run gateway -- grant <accountId> <credits> | token <accountId> | revoke <tokenId> | set-key <name> --data <dir>   # set-key reads stdin
```
- A metered, OpenAI-compatible model endpoint (`/v1/chat/completions`, `/v1/images/*`, `/v1/models`
  with licences, `/v1/status`, `/v1/quota`, `/v1/plans`, billing). It never learns a world (ledger
  lines carry `scope: null`) and is separate from the world service.
- Accounts are records of device keys: a signed challenge gives a `ugk_` token (stored hashed, one per
  device, 90 idle days). A second device pairs by an 8-character code a member device approves;
  accounts never merge; the last key stays. A `.env` token comes only from `token`, printed once.
- Quota: reserve, then settle on reported usage (else the whole hold), release on abort. Execution
  is deduplicated per (account, `X-Request-Id`) for 24 h. One credit = $1e-6 of upstream cost from
  the operator's dated `costs.json`; an unpriced model is not served. The app shows credits as a
  share of the allowance, never money. Allowance comes only from `grant` or billing.
- `BillingProvider { id; mode; plans(); checkout(account, planId, returnUrl); portal(customer,
  returnUrl); parseWebhook(raw, headers, nowMs) }`, Stripe first; plans and credits come only from
  the catalogue (`unmapped_credits`). A live key refuses to start unless `GATEWAY_BILLING_LIVE=1`,
  `NODE_ENV=production`, `GATEWAY_COMMERCIAL=1` and no test mode.
- `--data`: `gateway.lock` (one writer; the CLI hands commands to a running gateway over loopback),
  `gateway-key.json`, `admin-secret`, `keys.json` (0600), `upstreams.json` + `costs.json` (the
  operator's), `accounts.jsonl`, `ledger.jsonl` (append-only, fsynced; a damaged line stops the start).

### Routing, account and billing (main: `inference/route.ts`, `account/`, `billing/`)
```ts
export async function routeFor(config: InferenceConfig, deps: RouteDeps): Promise<Result<Routed>>;   // { route: "local" | "direct" | "hosted"; config /* what runs */; key; via }
```
- One order, decided in main and shown in Settings → Model: local kinds → this computer; `custom` →
  its saved key (never `.env`); `openai` / `openui-gateway` → saved key, else `.env` → direct; only
  with no own key or `hosted` selected, and a gateway configured → the account token (saved, else
  `UNMAPPED_GATEWAY_KEY`) → metered; nothing → `no-api-key`.
- No step runs after a failure (`auth` is never retried at the gateway; `quota-exhausted` shows its
  ways out). A silent reroute would change who pays and which model writes the world.
- `endpointFor` (`keys.ts`) is the only source of a key's endpoint. The gateway URL is
  `UNMAPPED_GATEWAY_URL`, else the baked `GATEWAY_URL` (null: dev builds have no gateway).
- Settings → Account signs in with the device key (token in `provider-keys/hosted.key`). A 401 on a
  saved token deletes exactly that record, so a `.env` token is used next; `.env` is never deleted.
  Settings → Plan is `ready` or `error`, never `idle`; checkout opens the system browser
  (`UNMAPPED_BILLING_BROWSER=none` only logs the URL).

### Images and licences (`src/main/images`, `@shared/{images,licence}`)
```ts
export interface ImageProvider { readonly id: ImageProviderId | "hosted"; readonly model: string; readonly licence: string; readonly locality; readonly endpoint;
  generate(prompt: string, signal: AbortSignal, options?: ImageOptions): Promise<Result<GeneratedImage>> }
export async function selectImageProvider(policy?: ImagePolicy): Promise<Result<ImageProvider>>;   // asked before every picture
```
- Providers: `openai`, `qwen-image-2512`, `qwen-image-2.1` (`QWEN_IMAGE_BASE_URL`, https or loopback;
  the exact model must be served), plus `hosted` (OpenAI with no own key, through the gateway).
- Every picture carries a licence written by main: a record id (`LICENCES`, sources in
  `docs/licenses/models.md`), `player-supplied`, or `unknown` (all pictures drawn before phase 4).
- Commercial mode is on with `UNMAPPED_COMMERCIAL=1` or a gateway saying `commercial: true`: a
  non-commercial provider cannot be chosen or draw (`image-licence-noncommercial`), and a revision may
  not add or change a non-commercial or `unknown` picture (`image-licence-redraw`); pictures
  inherited unchanged are listed, never refused.

### `.world` bundles (`@shared/worldBundle`, `dsl/history/worldBundle*.ts`, `main/bundles`)
```ts
export function verifyWorldFile(bytes: Uint8Array): { report: WorldBundleReport; opened: OpenedWorldBundle | null };   // pure; main, service, script
window.seed.bundle.{ list(), export(worldId), inspect(), import(token, name), move(link) }
```
- A zip of `world.json` (manifest, `files` in `hashOrder`), `history/log.jsonl`, `blobs/<sha256>`
  (the genesis pack, made reproducibly for a built-in revision, and every work pack) and
  `signature.json` (who exported). No personal state: save, pin, progress, outbox, snapshot stay out.
- Limits are checked from the central directory before inflating. Verification returns a report
  (hashes, log, verdicts, fold, beats, packs, physics, protocol), never a boolean; any problem
  refuses an import. Offline: `bun run verify-world -- <file.world> [--json]`.
- Import (Worlds → World files) is `join` from a file: the log by the backup rule, a save pinned to
  the genesis revision, seed, language and physics (`import-physics-pin`), then `ensure`.
- Bringing a world back: `service -- import` serves a mirror; an owner or co-owner rehosts with
  `world.attach` (old receipts still verify); members follow `unmapped://world?w=<id>&svc=<url>`,
  which switches only if the served log extends theirs (else `history-diverged` / `move-not-rehosted`).

### Provenance (`contracts/src/provenance/WorldProvenance.sol`, `@shared/provenance`)
- `openStream(worldId, cartridgeHash, ownerKey, genesisSig, sequencerKey, sequencerSig)` once per
  (recorder, world); `recordBeats(worldIds[], upTos[], chains[], fingerprints[])`, `upTo` strictly
  rising. Only hashes go on chain; Ed25519 is checked offline.
- The world service signs and pays (`src/service/chain`, `SERVICE_CHAIN_*` +
  `SERVICE_PROVENANCE_ADDRESS`). Off twice: no env, or no `chain { record: true }` event. A beat never
  waits for the chain.
- The app only reads (`main/chain/provenance.ts`, `UNMAPPED_PROVENANCE_*`); a stream counts only if
  its sequencer signature verifies with a key the log installs. Without env the door says no chain
  is set up.
- Not deployed: `bun run provenance --dry-run [--from <service data dir>]` simulates on Sepolia;
  `--deploy` spends gas and is run by a person.

### Browser proof (`src/browser`, `src/renderer/mobile`; `bun run browser:dev`)
- The smallest phone client, not a mobile app (plan D7): join by invite, walk by touch, read the
  world, leave a note, reload offline. No AI, keys, Create, places, owning, export or chain in the page.
- Its own `window.seed`: only `world`, run in the page over its WebSocket and IndexedDB with main's
  checks; everything else answers `not-on-this-client`, never a stand-in. The device key is a
  non-extractable WebCrypto Ed25519 key; the invite secret is used once and never stored.
- Blobs are verified by hash and kept in an IndexedDB LRU that never drops an outbox; `sw.js` caches
  only the page's own GETs. The service needs `--browser-origin <page origin>` to serve it blobs.
- `MobileShell` + `TouchPad` get a `PhoneDevice` from the page. The phone's land view
  (`LandView2D` over the stores `history/showWorldLand.ts` fills; the proof's second pass) is being
  wired and has no E2E run; `NoteComposer` needs the player's tile, so it sends only once the land
  is drawn.

### Environment variables added in phases 3–4
| Var | Read by | Meaning |
| --- | --- | --- |
| `UNMAPPED_GATEWAY_URL`, `UNMAPPED_GATEWAY_KEY` | main (`inference/config.ts`, `keys.ts`) | the gateway; a `.env` account token (fallback) |
| `UNMAPPED_COMMERCIAL` | main (`images/commercial.ts`) | `1` = commercial mode |
| `QWEN_IMAGE_BASE_URL`, `QWEN_IMAGE_API_KEY` | main (`inference/keys.ts`) | the Qwen-Image server and its key (fallback) |
| `UNMAPPED_PROVENANCE_RPC_URL` / `_ADDRESS` / `_CHAIN_ID` | main (`chain/provenance.ts`) | read-only light chain |
| `UNMAPPED_BILLING_BROWSER` | main (`billing/billing.ts`) | `none` logs the billing URL (E2E) |
| `UNMAPPED_TEST_CLOCK_DAYS` | main (`histories/clock.ts`) | shifts main's world clock; only with `AETHER_TEST_USER_DATA` |
| `AETHER_TEST_WORLD_PATH` | main (`bundles/dialog.ts`) | answers the `.world` dialogs; unpackaged + `AETHER_TEST_USER_DATA` only |
| `UNMAPPED_SERVICE_TEST`, `SERVICE_CHAIN_*`, `SERVICE_PROVENANCE_ADDRESS` | service | test mode; the chain recorder |
| `UNMAPPED_GATEWAY_TEST`, `GATEWAY_*`, `STRIPE_*`, upstream `keyEnv`s | gateway | test clock; commercial, live billing, CORS; keys |

`.env.example` holds the main-process ones; the service's and gateway's are documented in
`src/service/config.ts`, `src/service/chain/config.ts` and `src/gateway/config.ts`.

### Status (what has an E2E run)
Only two runs exist for these phases: `docs/e2e/milestone-rev6-p4-chain` (the provenance dry run
against a real service's beats; one step not run) and `docs/e2e/milestone-rev6-p4-mobile-proof`
(the browser proof's first pass; the phone's land view not run). No `milestone-rev6-p3-*` run is
committed, and the other planned p3/p4 flows (migrate, offline-visit, together, fog, door, rehost,
account, quota, billing, licence, …) are unverified until their folder lands. Never call one of
them working before then (Rule 2).

## Verify before claiming done
1. `bun run check` must pass (typecheck, lint, line limit, and the few isolated tests in `tests/`).
2. E2E: run the flow you changed in the real app, never on the user's own data or window:
   ```bash
   mkdir -p "$TMPDIR/ud"   # copy cartridges in if the flow needs them
   AETHER_TEST_USER_DATA="$TMPDIR/ud" bun run dev --remoteDebuggingPort 9333   # in the background
   bun scripts/cdp-drive.ts "$(cat docs/e2e/<run>/run.json)"
   ```
   A shared-world flow also runs the service on a throwaway `--data` dir in test mode, and a second
   app on its own userData and `--remoteDebuggingPort 9334`; a gateway flow uses a local
   llama-server upstream so no money is spent.
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
