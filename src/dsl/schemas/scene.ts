// The Scene dialect: one floor of the tower. Every enum comes from src/shared/world.ts so the
// prompt, the parser and the engine can never drift apart.

import { defineComponent } from "@openuidev/lang-core";
import { GAMEPLAY_KIT_IDS, INVENTORY_POLICIES } from "@shared/gameplay";
import {
  BIOMES,
  BODY_KINDS,
  HAT_KINDS,
  HELD_KINDS,
  LIGHT_KINDS,
  MONSTER_KINDS,
  MOODS,
  NPC_ROLES,
  PROP_KINDS,
  TILES,
} from "@shared/world";
import { z } from "zod";
import { LIMITS } from "../limits";
import { amount, hexColor, identifier, list, text, tile } from "./common";

export const Floor = defineComponent({
  name: "Floor",
  description: `the one ground plane — ${LIMITS.floor.min}..${LIMITS.floor.max} tiles each way; exactly one per Scene`,
  props: z.object({
    width: tile("floor width in tiles (x axis)"),
    depth: tile("floor depth in tiles (z axis)"),
    tile: z.enum(TILES).describe("ground material"),
  }),
  component: "Floor",
});

export const Wall = defineComponent({
  name: "Wall",
  description: `a wall from (x, z) running ${LIMITS.wallWidth.min}..${LIMITS.wallWidth.max} tiles along x, ${LIMITS.wallHeight.min}..${LIMITS.wallHeight.max} high`,
  props: z.object({
    x: tile("start tile on the x axis"),
    z: tile("start tile on the z axis"),
    width: tile("length along the x axis"),
    height: tile("height in tiles"),
    material: z.enum(TILES).describe("wall material"),
  }),
  component: "Wall",
});

export const Patch = defineComponent({
  name: "Patch",
  description:
    "different ground painted over the floor from corner (x, z) — paths, ponds, lava pools, drifts",
  props: z.object({
    x: tile("near corner on the x axis"),
    z: tile("near corner on the z axis"),
    width: tile("size along x"),
    depth: tile("size along z"),
    tile: z.enum(TILES).describe("ground material"),
  }),
  component: "Patch",
});

export const Platform = defineComponent({
  name: "Platform",
  description: `a block to jump onto, from corner (x, z) — ${LIMITS.span.min}..${LIMITS.span.max} tiles wide, surface y ${LIMITS.platformY.min}..${LIMITS.platformY.max} above the floor, ${LIMITS.platformHeight.min}..${LIMITS.platformHeight.max} thick`,
  props: z.object({
    x: tile("near corner on the x axis"),
    z: tile("near corner on the z axis"),
    width: tile("size along x"),
    depth: tile("size along z"),
    y: amount("height of its walking surface above the floor"),
    height: amount("thickness of the block"),
    tile: z.enum(TILES).describe("material"),
    bounce: z.boolean().describe("landing on it launches the player").nullable().optional(),
  }),
  component: "Platform",
});

export const Prop = defineComponent({
  name: "Prop",
  description: `scenery — scale ${LIMITS.scale.min}..${LIMITS.scale.max}, tint overrides the biome palette`,
  props: z.object({
    kind: z.enum(PROP_KINDS).describe("what the prop is"),
    x: tile("tile on the x axis"),
    z: tile("tile on the z axis"),
    scale: amount("size multiplier").nullable().optional(),
    tint: hexColor("colour override").nullable().optional(),
    dynamic: z
      .boolean()
      .describe("free physics object — it falls, collides and can be grabbed")
      .nullable()
      .optional(),
    assetId: z.string().max(160).nullable().optional().describe("installed asset ID matching kind"),
  }),
  component: "Prop",
});

export const NPC = defineComponent({
  name: "NPC",
  description: "someone the player can talk to; the id is quoted in the Dialogue program",
  props: z.object({
    id: identifier("npc id"),
    name: text("display name, in the player's language"),
    x: tile("tile on the x axis"),
    z: tile("tile on the z axis"),
    role: z.enum(NPC_ROLES).describe("what they do here"),
    mood: z.enum(MOODS).describe("how they speak"),
    color: hexColor("body colour"),
    body: z.enum(BODY_KINDS).describe("build; omit to follow the role").nullable().optional(),
    hat: z.enum(HAT_KINDS).describe("headwear").nullable().optional(),
    held: z.enum(HELD_KINDS).describe("what they carry").nullable().optional(),
    accent: hexColor("trim colour").nullable().optional(),
  }),
  component: "NPC",
});

export const Monster = defineComponent({
  name: "Monster",
  description: `a hostile creature — level ${LIMITS.level.min}..${LIMITS.level.max}, size ${LIMITS.monsterSize.min}..${LIMITS.monsterSize.max}, weakness in the player's language`,
  props: z.object({
    id: identifier("monster id"),
    kind: z.enum(MONSTER_KINDS).describe("creature family"),
    x: tile("tile on the x axis"),
    z: tile("tile on the z axis"),
    level: tile("difficulty"),
    weakness: text("what defeats it, invented freely"),
    size: amount("silhouette multiplier").nullable().optional(),
    color: hexColor("colour override").nullable().optional(),
  }),
  component: "Monster",
});

export const Treasure = defineComponent({
  name: "Treasure",
  description: `up to ${LIMITS.maxLoot} material names the player can wish with later`,
  props: z.object({
    id: identifier("treasure id"),
    x: tile("tile on the x axis"),
    z: tile("tile on the z axis"),
    loot: list("material names, in the player's language"),
  }),
  component: "Treasure",
});

export const Exit = defineComponent({
  name: "Exit",
  description: "the stair up — exactly one per Scene; `to` names the floor beyond",
  props: z.object({
    x: tile("tile on the x axis"),
    z: tile("tile on the z axis"),
    to: text("name of the next floor, in the player's language"),
    targetSceneId: z
      .string()
      .regex(/^[a-z0-9][a-z0-9_-]{0,79}$/)
      .describe("stable destination scene id")
      .nullable()
      .optional(),
  }),
  component: "Exit",
});

export const Contract = defineComponent({
  name: "Contract",
  description: "stable scene boundary used by saves, transitions, and gameplay kit selection",
  props: z.object({
    sceneId: z
      .string()
      .regex(/^[a-z0-9][a-z0-9_-]{0,79}$/)
      .describe("stable scene id"),
    kit: z.enum(GAMEPLAY_KIT_IDS).describe("versioned engine gameplay kit"),
    requiresFlags: z.array(identifier("required true flag")).max(64),
    requiresItems: z.array(identifier("required inventory item id")).max(64),
    inventoryPolicy: z.enum(INVENTORY_POLICIES).describe("whether inventory crosses the boundary"),
    grantsFlags: z.array(identifier("flag set true on completion")).max(64),
    terminal: z.boolean().describe("this scene can complete the cartridge"),
    requiredProfileId: z.string().max(160).nullable().optional(),
    requiredContextId: z.string().max(160).nullable().optional(),
    requiredModules: z.array(z.string().max(160)).max(64).nullable().optional(),
  }),
  component: "Contract",
});

export const Light = defineComponent({
  name: "Light",
  description: `a light source — intensity ${LIMITS.intensity.min}..${LIMITS.intensity.max}; give x and z to a "point" light only`,
  props: z.object({
    kind: z.enum(LIGHT_KINDS).describe("light type"),
    color: hexColor("light colour"),
    intensity: amount("brightness"),
    x: tile("tile on the x axis, point lights only").nullable().optional(),
    z: tile("tile on the z axis, point lights only").nullable().optional(),
  }),
  component: "Light",
});

export const Sky = defineComponent({
  name: "Sky",
  description: `background and fog — fogDensity ${LIMITS.fogDensity.min}..${LIMITS.fogDensity.max}; at most one per Scene`,
  props: z.object({
    color: hexColor("sky colour"),
    fog: hexColor("fog colour"),
    fogDensity: amount("fog thickness"),
  }),
  component: "Sky",
});

export const Trigger = defineComponent({
  name: "Trigger",
  description: `an invisible circle firing an event when the player steps in — radius ${LIMITS.radius.min}..${LIMITS.radius.max}`,
  props: z.object({
    id: identifier("trigger id"),
    x: tile("tile on the x axis"),
    z: tile("tile on the z axis"),
    radius: tile("radius in tiles"),
    event: text("event name, ascii snake_case"),
  }),
  component: "Trigger",
});

export const Quest = defineComponent({
  name: "Quest",
  description: "a one-line objective shown in the journal",
  props: z.object({
    id: identifier("quest id"),
    text: text("objective, in the player's language"),
  }),
  component: "Quest",
});

export const Scene = defineComponent({
  name: "Scene",
  description: "root — one floor of the tower and everything on it",
  props: z.object({
    name: text("floor name, in the player's language"),
    biome: z.enum(BIOMES).describe("palette and mood of the floor"),
    children: z
      .array(
        z.union([
          Floor.ref,
          Contract.ref,
          Patch.ref,
          Platform.ref,
          Wall.ref,
          Prop.ref,
          NPC.ref,
          Monster.ref,
          Treasure.ref,
          Exit.ref,
          Light.ref,
          Sky.ref,
          Trigger.ref,
          Quest.ref,
        ]),
      )
      .describe("everything on this floor"),
  }),
  component: "Scene",
});

export const SCENE_COMPONENTS = [
  Scene,
  Contract,
  Floor,
  Patch,
  Platform,
  Wall,
  Prop,
  NPC,
  Monster,
  Treasure,
  Exit,
  Light,
  Sky,
  Trigger,
  Quest,
] as const;

/** Prop schemas keyed by component name — used by the converters to re-validate parsed props. */
export const SCENE_PROPS = {
  Scene: Scene.props,
  Contract: Contract.props,
  Floor: Floor.props,
  Patch: Patch.props,
  Platform: Platform.props,
  Wall: Wall.props,
  Prop: Prop.props,
  NPC: NPC.props,
  Monster: Monster.props,
  Treasure: Treasure.props,
  Exit: Exit.props,
  Light: Light.props,
  Sky: Sky.props,
  Trigger: Trigger.props,
  Quest: Quest.props,
} as const;

export type SceneComponentName = keyof typeof SCENE_PROPS;
