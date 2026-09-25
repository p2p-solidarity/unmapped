# The Seed Harness — mods as prompt sections + tool calls

Aether Spire adopts the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
"everything is a plugin" model, built on the same framework ([Cordis](https://github.com/cordiverse/cordis),
published as `@deepseek-ai/cordis`). What dsh does for a coding agent, we do for a game master:

| dsh concept | Aether Spire equivalent |
| --- | --- |
| plugin with `inject` + `apply(ctx)`, reversible `ctx.effect()` | built-in plugin or **mod** mounted into the harness context; unmount unwinds every registration |
| `ctx.systemPrompt.section({ name, order, text })` | persona, world rules, DSL spec, mod lore, runtime context, output format |
| `ctx.tools.register(defineTool(...))`, `tools/pre-execute → execute → post-execute` | model-facing game tools; mods declare tools whose execution maps onto a fixed **GameEffect** vocabulary |
| skills (`SKILL.md` catalog + `skill` loader tool) | mod skills the model loads on demand (recipes, festival rules, boss playbooks) |
| agent preset `agent.cordis.yml` | a world's `meta.mods` list: which mods mount for that world |
| bundle / profile patch rows | `mod.yml` manifest |

## Why this shape

The plan asks for extensions that are **data, not code** (DSL 是純聲明式，不執行任意代碼). A mod
therefore ships only markdown and a YAML manifest. Its tools are templates over the
`GameEffect` union in `src/shared/effects.ts`; the harness validates the model's arguments,
fills the template, validates the resulting effect, then hands it to the renderer's effect
provider, which mutates the stores and persists dotfiles. A mod can never run JavaScript.

## A turn

```
assemble system prompt (sections by order, {{vars}} interpolated)
assemble tool schemas (built-ins + enabled mods, minus pre-execute denials)
→ chat(messages, tools)
→ tool_calls? validate → tools/pre-execute → execute (→ ctx.effects.apply) → tools/post-execute
   append tool results → chat again (≤ maxSteps)
→ final assistant text → DSL parser (Scene / Dialogue / Item) → repair loop if needed
```

Scene and item generation are single-step turns without tools (the DSL program is the output).
Dialogue is two turns: the NPC turn returns a `Dialogue` program; when the player picks a choice,
a **resolve** turn lets the model enact the choice with tools (grant materials, spawn a monster,
mutate the sky, add a quest) and answer with one in-world line. That is the "精靈 function
calling 直接影響遊戲世界" mechanism from the plan.

## Mod layout

```
<userData>/mods/<name>/
├── mod.yml            manifest (name, version, author, description, inject, prompt, tools, skills)
├── prompt/*.md        system-prompt sections (order 400..600 reserved for mods)
└── skills/<skill>/SKILL.md   or skills/<skill>.md — frontmatter: name, description
```

A `.mod` file is a zip of that directory. Install through the Mods panel or drop the folder in.
Enable per world: `meta.json` → `mods: ["onsen-festival"]`.

Example manifest:

```yaml
name: onsen-festival
version: 0.1.0
author: kidney.eth
description: Every floor gets a hot-spring town undercurrent and a lantern ritual.
inject: []
prompt:
  - { name: onsen-lore, order: 420, file: prompt/lore.md }
tools:
  - name: light_lanterns
    description: Light the festival lanterns; the sky warms and the fog thins.
    parameters:
      hue: { type: string, enum: [amber, rose, jade], required: true }
    effect:
      kind: mutate_world
      skyColor: "{{hue_hex}}"
      fogDensity: 0.01
      biome: onsen_town
skills: [skills]
```

Template rules: `{{param}}` substitutes a validated argument; derived helpers such as
`{{hue_hex}}` are not magic — a mod must either take a hex parameter or pick a constant. The
harness rejects an effect that fails the `GameEffect` schema after substitution and reports the
reason back to the model as the tool result.

## Code map

- `src/harness/` — framework-agnostic services (`systemPrompt`, `tools`, `skills`, `effects`,
  `world`), `defineTool`, `runTurn`, mod manifest/plugin loader, built-in plugins. Runs in the
  renderer, in main (manifest validation) and in vitest.
- `src/renderer/harness/` — the renderer glue: one harness instance per loaded world, the
  effect provider bound to the zustand stores + IPC persistence, the mods panel.
- `src/main/mods/` — install directory, `.mod` unzip, manifest validation, watcher, IPC.
