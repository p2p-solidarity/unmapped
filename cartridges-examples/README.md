# cartridges-examples — demo cartridges

Developer sample content, like `mods-examples/`. The app never reads this folder; the built
`.cartridge` files are imported the same way as a cartridge a friend sent you.

Each demo is `design.json` (mode selection, accepted overrides, scene slots, narrative) plus one
`scenes/<slotId>.oui` per slot. `scripts/demo-cartridges.mjs` runs them through the path Create
uses: `requirementsFor` → `compileCapabilities` → `buildCartridge` (Forge) → `prepare` (publish
validation) → `packCartridge`. A demo that the compiler or publish validation rejects fails the
build.

```bash
bun run demo:cartridges             # writes cartridges-examples/dist/<id>-<version>.cartridge
bun run demo:cartridges --install   # also publishes into <userData>/cartridges (AETHER_USER_DATA overrides)
```

Otherwise use Cartridges → Import .cartridge in the app.

| Cartridge | Modes | What it shows |
| --- | --- | --- |
| `demo-reactor-squad` 反應爐小隊 | 第一人稱射擊 + 回合制 + 團隊 + 科幻 | plan.md §10 benchmark; `network=offline` override for an NPC squad; one context; flag-gated scenes |
| `demo-context-relay` 三段接力 | 冒險角色扮演 + 平台和快跑 + 第一人稱射擊 | plan.md §0.9: three capability contexts (TPS → 2.5D side → FPS) in one cartridge |
| `demo-onsen-letters` 湯屋來信 | 冒險角色扮演 + 視覺小說 + 解謎 + 懸疑 | story after scenes; TPS exploration then a fixed-camera finale |
| `demo-deep-maze` 深層迷宮 | 迷宮探索 + 類 Rogue | `Generate("maze")`: the scene fixes spawn and exit, the engine carves the maze between them |

After the ending, "Enter the depths" continues below it: every floor is generated from the save's
seed and depth (`src/shared/endless.ts`), plays under the last walkable scene's capability context,
and reuses only this cartridge's own props, monsters and loot — so the more varied the authored
scenes, the more varied the depths.

Rules for writing scenes: the Contract kit must match the slot's context; the 2.5D kit only moves
along x at the spawn row (floor centre); a fixed-camera scene cannot walk, so its NPC and Exit
must be within reach of the spawn tile. Bump `version` whenever content changes — an installed
revision with the same id and version but different content is refused.
