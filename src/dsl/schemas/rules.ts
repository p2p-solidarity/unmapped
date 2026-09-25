import { defineComponent } from "@openuidev/lang-core";
import {
  GAMEPLAY_KIT_IDS,
  GAMEPLAY_PHYSICS_MODES,
  GENERATOR_KINDS,
  INPUT_ACTIONS,
  INPUT_CODES,
} from "@shared/cartridge";
import { WEAPON_KINDS } from "@shared/combat";
import { PROGRESSION_KINDS } from "@shared/progression";
import { TIMING_SYSTEMS, TURN_RESOLUTIONS } from "@shared/timing";
import { z } from "zod";
import { amount } from "./common";

export const Kit = defineComponent({
  name: "Kit",
  description: "engine-owned gameplay kit tuning; a cartridge configures code it cannot replace",
  props: z.object({
    id: z.enum(GAMEPLAY_KIT_IDS).describe("versioned engine kit id"),
    moveSpeed: amount("walking speed in tiles per second"),
    sprintSpeed: amount("sprint speed in tiles per second"),
    jumpSpeed: amount("upward jump speed; zero disables jumping"),
    gravity: amount("downward acceleration"),
    interactDistance: amount("interaction reach in tiles"),
    cameraFov: amount("vertical camera field of view in degrees"),
    lookSensitivity: amount("pointer look sensitivity"),
    cameraDistance: amount("third-person follow distance; zero for first person"),
  }),
  component: "Kit",
});

export const Bind = defineComponent({
  name: "Bind",
  description: "maps one declared game action to one or more trusted browser input codes",
  props: z.object({
    action: z.enum(INPUT_ACTIONS).describe("engine action"),
    keys: z.array(z.enum(INPUT_CODES)).min(1).max(4).describe("accepted KeyboardEvent/Mouse codes"),
  }),
  component: "Bind",
});

export const Timing = defineComponent({
  name: "Timing",
  description:
    "how the cartridge paces a turn; swapping the system is what a change_timing mod edits",
  props: z.object({
    system: z.enum(TIMING_SYSTEMS).describe("turn ordering policy"),
    resolution: z.enum(TURN_RESOLUTIONS).describe("whose turn a single slot belongs to"),
    turnSeconds: amount("planning seconds before a turn auto-commits; 0 is untimed"),
  }),
  component: "Timing",
});

export const Weapon = defineComponent({
  name: "Weapon",
  description: "one declared weapon; an add_weapon mod appends one of these and republishes",
  props: z.object({
    id: z.string().min(1).max(60).describe("stable ascii id"),
    name: z.string().min(1).max(80).describe("player-facing name, in the player's language"),
    kind: z.enum(WEAPON_KINDS).describe("weapon family"),
    damage: amount("hit points removed per connecting shot"),
    range: amount("maximum reach in tiles"),
    cooldownMs: amount("milliseconds between shots"),
    magazine: amount("shots before a reload; 0 means it never runs dry"),
    assetId: z.string().max(160).nullable().optional(),
  }),
  component: "Weapon",
});

export const Combat = defineComponent({
  name: "Combat",
  description: "hit point tuning for the player and for monsters, by monster level",
  props: z.object({
    playerHp: amount("player hit points"),
    monsterHpBase: amount("hit points of a level 1 monster"),
    monsterHpPerLevel: amount("extra hit points per monster level above 1"),
  }),
  component: "Combat",
});

export const Party = defineComponent({
  name: "Party",
  description: "local squad slots that fight alongside the player",
  props: z.object({
    size: amount("allies besides the player"),
    memberHp: amount("hit points of one ally"),
    memberSpeed: amount("ally speed, used for turn order and action bars"),
  }),
  component: "Party",
});

export const Progression = defineComponent({
  name: "Progression",
  description: "one progression system this cartridge tracks, and the number that tunes it",
  props: z.object({
    kind: z.enum(PROGRESSION_KINDS).describe("which system"),
    value: amount("score per kill, xp per level, or 0 where the kind needs no number"),
  }),
  component: "Progression",
});

export const Generate = defineComponent({
  name: "Generate",
  description:
    "generate the layout between the spawn tile and the scene's Exit; the author keeps both ends",
  props: z.object({
    kind: z.enum(GENERATOR_KINDS).describe("generator"),
    width: amount("generated floor width in tiles; 0 keeps the authored floor"),
    depth: amount("generated floor depth in tiles; 0 keeps the authored floor"),
    braid: amount("0 for one route with dead ends, 100 for mostly open ground"),
  }),
  component: "Generate",
});

export const Rules = defineComponent({
  name: "Rules",
  description: "root gameplay contract shared by every scene in the cartridge",
  props: z.object({
    defaultKit: z.enum(GAMEPLAY_KIT_IDS).describe("kit used when a scene does not override it"),
    physics: z.enum(GAMEPLAY_PHYSICS_MODES).describe("engine physics model"),
    children: z
      .array(
        z.union([
          Kit.ref,
          Bind.ref,
          Timing.ref,
          Weapon.ref,
          Combat.ref,
          Party.ref,
          Progression.ref,
          Generate.ref,
        ]),
      )
      .describe("kit tuning, bindings, pacing, weapons, combat, party, progression, generation"),
  }),
  component: "Rules",
});

export const RULE_COMPONENTS = [
  Rules,
  Kit,
  Bind,
  Timing,
  Weapon,
  Combat,
  Party,
  Progression,
  Generate,
] as const;

export const RULE_PROPS = {
  Rules: Rules.props,
  Kit: Kit.props,
  Bind: Bind.props,
  Timing: Timing.props,
  Weapon: Weapon.props,
  Combat: Combat.props,
  Party: Party.props,
  Progression: Progression.props,
  Generate: Generate.props,
} as const;
