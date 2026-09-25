// The three libraries the model writes against, plus the flat ComponentSpec[] the 3D renderer
// binds its meshes to. One library per generation call keeps the prompts short.

import { createLibrary, type Library } from "@openuidev/lang-core";
import { DIALOGUE_COMPONENTS } from "./schemas/dialogue";
import { ITEM_COMPONENTS } from "./schemas/item";
import { RULE_COMPONENTS } from "./schemas/rules";
import { SCENE_COMPONENTS } from "./schemas/scene";
import type { ComponentSpec } from "./types";

const SCENE_GROUPS = [
  {
    name: "Ground",
    components: ["Floor", "Patch", "Platform", "Wall", "Prop"],
    notes: ["Patches repaint the Floor, Platforms rise above it, Walls block it."],
  },
  {
    name: "Life",
    components: ["NPC", "Monster", "Treasure"],
  },
  {
    name: "Atmosphere",
    components: ["Light", "Sky"],
  },
  {
    name: "Story",
    components: ["Exit", "Trigger", "Quest"],
  },
];

/** What the parser accepts: every Scene component, Contract included. */
export const sceneLibrary: Library = createLibrary({
  id: "aether-spire/scene",
  root: "Scene",
  components: [...SCENE_COMPONENTS],
  componentGroups: SCENE_GROUPS,
});

/**
 * What the model is shown. `Contract` is attached by the cartridge compiler and must never be
 * written by the model, so it is left out of the prompt (it also keeps a 4B model's budget).
 */
export const scenePromptLibrary: Library = createLibrary({
  id: "aether-spire/scene-prompt",
  root: "Scene",
  components: SCENE_COMPONENTS.filter((component) => component.name !== "Contract"),
  componentGroups: SCENE_GROUPS,
});

export const dialogueLibrary: Library = createLibrary({
  id: "aether-spire/dialogue",
  root: "Dialogue",
  components: [...DIALOGUE_COMPONENTS],
});

export const itemLibrary: Library = createLibrary({
  id: "aether-spire/item",
  root: "Item",
  components: [...ITEM_COMPONENTS],
});

export const rulesLibrary: Library = createLibrary({
  id: "aether-spire/rules",
  root: "Rules",
  components: [...RULE_COMPONENTS],
});

const toSpecs = (library: Library): ComponentSpec[] =>
  Object.values(library.components).map((component) => ({
    name: component.name,
    description: component.description,
    props: component.props,
  }));

export const sceneSpecs: ComponentSpec[] = toSpecs(sceneLibrary);
export const dialogueSpecs: ComponentSpec[] = toSpecs(dialogueLibrary);
export const itemSpecs: ComponentSpec[] = toSpecs(itemLibrary);
export const rulesSpecs: ComponentSpec[] = toSpecs(rulesLibrary);

export const SCENE_COMPONENT_NAMES: readonly string[] = SCENE_COMPONENTS.map((c) => c.name);
export const DIALOGUE_COMPONENT_NAMES: readonly string[] = DIALOGUE_COMPONENTS.map((c) => c.name);
export const ITEM_COMPONENT_NAMES: readonly string[] = ITEM_COMPONENTS.map((c) => c.name);
export const RULE_COMPONENT_NAMES: readonly string[] = RULE_COMPONENTS.map((c) => c.name);
