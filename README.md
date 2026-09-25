# UNMAPPED — 《無界之地》

**An Autonomous Open World · 自主開放世界**

An Electron desktop engine for **player-owned, LLM-generated worlds** — the working
implementation of the ideas in [`plan.md`](plan.md).

- The model never writes code. It writes a tiny **OpenUI Lang dialect** (three component
  libraries: `Scene`, `Dialogue`, `Item`). A parser is the source of truth; malformed output is
  repaired by re-prompting with the parser's errors (the OUI-1 "compiler as reward" loop, at
  inference time).
- Three.js / React Three Fiber renders the parsed scene: instanced low-poly floors, walls, props,
  NPCs, monsters, treasure, an exit, lights and fog. Choosing a dialogue branch can mutate sky,
  fog and biome with a crossfade — the "hot-swap".
- A world is a directory of **plain-text dotfiles** you own (`world.oui`, `genesis.json`,
  `karma.jsonl`, `inventory.json`, `meta.json`). Edit the mutable files in any editor and the game
  hot-reloads; `genesis.json` is the creation-time covenant and applies on the next world load.
  A `.seed` is a zip of that directory.
- Saves can be encrypted with a **passkey-PRF-derived key** when the runtime reports WebAuthn PRF
  support. Where WebAuthn is unavailable, the OS-keychain fallback is encrypted same-machine
  restore, not cross-device recovery. ENS text record `aether.seed` points at an encrypted blob
  (resolved through the ENSv2 Universal Resolver; Sepolia by default, mainnet selectable).
- Each published cartridge can own an **ENSv2 subname** on Sepolia, `<cartridgeId>.<parent>.eth`,
  whose text records hold its id, version and content hash; anyone can follow the name back to the
  exact revision (Title → Cartridges). One-time setup: `bun run ens:setup <label>` (`--dry-run` first).
- Friends join over **WebRTC (yjs + y-webrtc)** with a 6-character room code; the host's scene,
  atmosphere mutation overlay and karma log are shared as a CRDT through public signaling.
- Works with any OpenAI-compatible endpoint: local `llama-server`, Ollama, vLLM serving
  `thesysdev/OUI-1`, the OpenUI Gateway, or OpenAI.

## Run

```bash
bun install
bun run dev
```

Local model (recommended on a 16 GB Apple Silicon Mac):

```bash
brew install llama.cpp
scripts/download-model.sh qwen        # Qwen3.5-4B Q4_K_M, 2.74 GB
llama-server -m ~/models/Qwen3.5-4B-Q4_K_M.gguf --port 8080 -c 16384 --jinja -ngl 99
```

Cloud instead: put `OPENAI_API_KEY=…` in `.env` (read only by the Electron main process).

## Verify

```bash
bun run check   # typecheck + biome + 600-line limit + vitest
```

Engineering rules, layout and module contracts: [`CLAUDE.md`](CLAUDE.md).

## Milestones

The repository history groups the working product into 20 feature commits. See
[the commit index](docs/milestones.md) for each delivered slice, its evidence, and the
remaining verification gaps.

The current app has a four-step Create flow, a playable open land in HD-2D and 16-bit looks,
chapter gates, places, real-time combat, model selection, cartridges and saves, and optional ENSv2
cartridge names. The [integration record](docs/e2e/milestone-integration/result.md) lists the
flows exercised in the app and the features still awaiting end-to-end verification.
