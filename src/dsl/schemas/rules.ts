import { defineComponent } from "@openuidev/lang-core";
import {
  GAMEPLAY_KIT_IDS,
  GAMEPLAY_PHYSICS_MODES,
  INPUT_ACTIONS,
  INPUT_CODES,
} from "@shared/cartridge";
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

export const Rules = defineComponent({
  name: "Rules",
  description: "root gameplay contract shared by every scene in the cartridge",
  props: z.object({
    defaultKit: z.enum(GAMEPLAY_KIT_IDS).describe("kit used when a scene does not override it"),
    physics: z.enum(GAMEPLAY_PHYSICS_MODES).describe("engine physics model"),
    children: z.array(z.union([Kit.ref, Bind.ref])).describe("kit tuning and input bindings"),
  }),
  component: "Rules",
});

export const RULE_COMPONENTS = [Rules, Kit, Bind] as const;

export const RULE_PROPS = {
  Rules: Rules.props,
  Kit: Kit.props,
  Bind: Bind.props,
} as const;
