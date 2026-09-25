# Cartridge runtime implementation plan

This is the executable plan for the Play / Remix core described in `plan.md`. It replaces the
old single-world Phase 1 plan. The product vision stays in `plan.md`; this document owns file
formats, migration order, public APIs, and acceptance.

## Decisions already made

- A published cartridge revision is immutable.
- Human identity is `(cartridgeId, version)`; content identity is `contentHash`.
- An instance pins all three values. A matching id/version with different bytes is a conflict,
  never an update.
- Published content, mutable authoring state, durable play state, and live session state have
  separate roots and permissions.
- Runtime Play never needs an LLM to reach a cartridge's ending. Authoring may use an LLM, but it
  must bake and validate every required scene before publish.
- Phase A ships four engine-owned gameplay kits: `tps_exploration@1`, `fps_puzzle@1`,
  `platformer_2_5d@1`, and `topdown_puzzle@1`. Cartridges select and configure them; cartridges
  never provide executable JavaScript.

## Storage model

```text
<userData>/
├── cartridges/<cartridgeId>/<version>/       # immutable after publish/install
│   ├── manifest.json
│   ├── rules.oui
│   └── scenes/<sceneId>.oui
├── workspaces/<workspaceId>/                 # mutable Remix source
│   ├── workspace.json
│   ├── rules.oui
│   └── scenes/<sceneId>.oui
├── instances/<instanceId>/                   # a durable playthrough
│   ├── instance.json                         # exact cartridge revision pin
│   └── saves/<saveId>/
│       ├── save.json
│       └── karma.jsonl
└── sessions/                                 # optional crash checkpoints; never a cartridge
```

The first release creates one `default` save per instance. The directory shape permits explicit
save slots later without changing the instance contract. Multiplayer Phase A is host-authoritative:
the host owns the instance save; peer-local identity and inventory are a later contract.

## Revision identity and compatibility

`manifest.json` contains:

- `formatVersion`: version of the cartridge archive shape.
- `cartridgeId`: stable logical identity.
- `version`: strict SemVer chosen by the author.
- `contentHash`: algorithm-tagged SHA-256 over a canonical manifest payload, `rules.oui`, and every
  declared scene sorted by path.
- `engineApiVersion`: runtime contract required by the cartridge.
- `saveSchemaVersion`: durable state schema expected by the cartridge.
- `entrySceneId` and the declared scene catalog.
- `story`: the generated premise, finale, and ordered scene outline with objectives and kit choices.
- `lineage`: the exact parent `{ cartridgeId, version, contentHash }`, plus `revision` or `remix`.

SemVer communicates author intent; it is not trusted as integrity. The hash is the immutable
identity. Publishing the same bytes twice is idempotent. Publishing different bytes at an existing
`cartridgeId/version` fails with `cartridge-version-conflict`.

- Patch: content fixes that preserve rules and save meaning.
- Minor: compatible scenes or mechanics; existing saves still load.
- Major: intentionally incompatible gameplay or save meaning.

Every upgrade is explicit. Before repinning an instance, the app verifies the target hash and
engine API, snapshots the current save, and checks `saveSchemaVersion`. Phase A refuses schema
changes; a later phase may add deterministic declarative migration files.

For an author's own next release, Remix keeps `cartridgeId` and defaults to a patch bump. Remixing
someone else's work creates a new `cartridgeId`, starts at `1.0.0`, and records the exact source
revision in `lineage`.

## Cartridge and save ownership

Cartridge revision:

- manifest metadata, genesis/authoring provenance, rules, scene contracts, scene geometry,
  dialogue/quest content, and required kit versions.

Instance/save:

- current scene, flags, inventory, per-scene mutations, completed objectives, last checkpoint,
  timestamps, and karma/event history.

Session only:

- connected peers, host lease, player transforms, held inputs, interpolation buffers, open panels,
  and other transient physics/UI state.

No cartridge export may contain `save.json` or `karma.jsonl`. A save backup contains the pinned
cartridge ref but not cartridge content. Restore therefore reports a missing revision instead of
silently substituting a newer one.

## DSL ownership

`rules.oui` parses to `GameplayRules` and owns:

- default gameplay kit;
- allowed kit set and version;
- movement, jump, interaction, and camera tuning within engine limits;
- declarative input actions, not arbitrary code;
- physics/material presets understood by the engine.

Each `Scene` carries a `SceneContract` and owns:

- stable `sceneId`;
- required gameplay kit;
- entry prerequisites over validated flags/items;
- inventory carry/reset policy;
- deterministic exit targets;
- declarative completion effects from the existing `GameEffect` vocabulary.

Rules provide defaults and limits. A scene selects a kit and may supply only explicitly allowed
overrides. The same property must not have two independent sources of truth.

## Execution slices

### Slice 0 — restore a trustworthy baseline

- Fix existing test fixtures and lint failures.
- Run `bun run check` before feature work.

Acceptance: all existing checks pass before the first cartridge test is added.

### Slice 1 — immutable revision plus pinned instance

- Add shared cartridge, instance, save, and revision-ref types.
- Add strict main-process schemas and safe path vocabulary.
- Publish a revision atomically, calculate/verify its canonical hash, and reject conflicting bytes.
- Create an instance with a `default` save pinned to the exact revision.

Tracer behavior: publish one revision, create an instance from it, reload both from disk, and prove
the resolved content hash is unchanged.

### Slice 2 — content-only cartridge packs and save-only backups

- Replace the old whole-world `.seed` pack with a content-only cartridge archive.
- Add a separate `.spire-backup` format for instance saves.
- Reject traversal, undeclared files, duplicate entries, invalid manifests, and hash mismatches.

Acceptance: inspecting an exported cartridge archive finds no personal state; restoring a save
without its exact cartridge revision produces an actionable error.

### Slice 3 — Gameplay Rules and Scene Contracts

- Add the Rules OpenUI library, parser, serializer, grammar, and prompt surface.
- Extend Scene parsing and serialization with contracts and stable scene ids.
- Validate scene references, kit availability, prerequisites, and offline reachability from entry
  scene to at least one ending.

Acceptance: a three-scene fixture parses, round-trips deterministically, selects different kits,
rejects a dangling exit, and completes without inference.

### Slice 4 — Play loader and deterministic transitions

- Replace `loadWorld` with instance resolution: instance -> pinned revision -> verified rules ->
  current scene -> save overlay.
- Replace runtime floor generation with a contract transition resolver.
- Persist only save-owned state; never write into a published revision.
- Re-key harness and multiplayer state by `instanceId`, not cartridge source paths.

Acceptance: quit and reopen in scene two with inventory/flags intact while all cartridge files keep
their original bytes and timestamps.

### Slice 5 — Remix workspaces and publish

- Clone an exact cartridge revision into a mutable workspace.
- Route the text console and visual platform editor to workspace scene files.
- Preview through an ephemeral instance using the same parser/runtime as Play.
- Publish only after rules, every scene, references, kit compatibility, and offline completion pass.

Acceptance: remix a cartridge, alter one scene, preview it, publish `1.0.0` under a new id with
lineage, and prove the source revision and its existing instances are unchanged.

### Slice 6 — engine-owned Gameplay Kits

- Extract shared kinematic movement and input plumbing from `Player` / `CameraRig`.
- Add a versioned registry for TPS, FPS puzzle, 2.5D platforming, and top-down puzzle kits.
- TPS owns over-shoulder follow, turning, obstruction response, grounding, interaction, and jump
  assistance.
- FPS Puzzle owns pointer-lock look, flashlight, reticle feedback, and validated pick-up / rotate /
  drop interactions for declared physics props.

Acceptance: entering scenes switches kits from their contracts, unavailable kits fail before the
scene starts, and input remains locked under dialogue/editor overlays.

### Slice 7 — shelf UX, migration, and end-to-end verification

- Make the primary library actions `Play` and `Remix`; show version, lineage, compatibility, and
  existing playthroughs without fake data.
- Migrate each legacy `worlds/<id>` into a preserved cartridge revision plus pinned instance. Keep a
  recoverable backup and a migration receipt; never delete the source automatically.
- Update watchers so workspaces are mutable, cartridges are immutable, and saves hot-reload only
  their owned state.
- Run `bun run check`, build Electron, and exercise publish -> Play -> transition -> quit -> resume ->
  Remix -> preview -> publish in the actual app.
- Run an independent Standards and Spec review before declaring the migration complete.

## Explicitly deferred

- Per-player multiplayer saves and host migration.
- Automatic save-schema migration.
- Signed publisher identities and transparency logs.
- Public discovery, Steam Workshop, token economics, and chain verification.
- Runtime-generated mandatory scenes.

The directory and manifest formats leave seams for these features, but Phase A does not pretend
they already work.

## Status — 2026-09-16

Slices 1–7 are implemented and reviewed (Standards + Spec, four independent passes). Verified by
`bun run check` (64 files, 526 tests), `bun run build`, and in-app smoke of Join, Cartridges,
Play, Archive, Remix → workspace, plus a scripted Validate → Publish gate run on a real workspace.

Accepted trade-offs (documented, not bugs):

- `writeInstanceSave` renames `save.json` then `instance.json`; a crash between the two leaves a
  pin mismatch that `readInstance` refuses as `save-identity-mismatch` (fail-safe, manual repair).
- Data Key wrapping records carry no AAD and new ciphertext keeps the `ASP1` header; the wrong key
  fails AES-GCM authentication either way.
- `inspect` (mouse) is currently an alias of `interact`; kit jump/sprint policy is keyed by kit id.

Deferred to later scoped slices:

- `PropSpec` stable ids + physics declarations before FPS pick-up / rotate / drop (format change).
- Cross-device transfer of wrapping records and an encrypted `.spire-backup` container.
- No 2.5D combat hitbox: the project has no combat system.

