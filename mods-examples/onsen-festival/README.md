# onsen-festival — an example mod

This folder is **developer sample content**, not installed content. Aether Spire never installs it
automatically, and nothing in the app reads `mods-examples/`: it lives in the repo so you have a
working manifest to copy. Installed mods live in `<userData>/mods/<name>/`.

## What it is

A mod is data, never code (Rule 11, `docs/harness.md`): a `mod.yml` manifest, prompt markdown, and
skill markdown. This one contributes

- one prompt section (`prompt/lore.md`, order 420 — the 400..600 band is reserved for mods),
- one skill (`skills/lantern-rite/SKILL.md`) the model loads on demand,
- one declarative tool, `light_lanterns`, whose `color` parameter is substituted into a
  `mutate_world` effect template. The harness validates the model's argument, fills the template,
  validates the resulting `GameEffect`, and hands it to the renderer's effect provider.

## Trying it

1. Run the app and open the Mods panel.
2. **Install** → pick this folder (or a `.mod` zip of it). It is copied into `<userData>/mods/`.
3. Enable it for the world you are playing; that writes `mods: ["onsen-festival"]` into the
   world's `meta.json`.

To build the `.mod` archive instead, zip the *contents* of this folder (so `mod.yml` is at the zip
root) or the folder itself (one top-level directory), and name it `onsen-festival.mod`.

## Editing it live

Once installed, editing the markdown under `<userData>/mods/onsen-festival/` hot-reloads the mod
into the open world — the same contract world dotfiles have.
