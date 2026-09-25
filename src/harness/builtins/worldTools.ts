// The built-in game tools: the model's whole vocabulary for changing the world.
//
// Every one of them ends in `ctx.effects.apply(...)`, so a tool can only ever say something the
// GameEffect union can express, and the effect schema re-checks it before the renderer sees it.
// The descriptions matter as much as the code: they tell the model that a tool is for enacting a
// choice it has already narrated, not for decorating an answer.

import type { Context } from "@deepseek-ai/cordis";
import { LIMITS } from "@dsl/limits";
import { BIOMES, MONSTER_KINDS } from "@shared/world";
import { defineTool } from "../defineTool";
import { type HarnessPlugin, unwind } from "../events";
import type { JsonValue, ToolDefinition } from "../types";
import { outcomeText, outcomeValue } from "../values";

const coord = { minimum: LIMITS.coord.min, maximum: LIMITS.coord.max };

/** Every effect tool renders the world's own answer back to the model. */
function render(_args: JsonValue, value: JsonValue): string {
  return outcomeText(value);
}

function tools(ctx: Context): ToolDefinition[] {
  return [
    defineTool({
      name: "mutate_world",
      description:
        "Change the atmosphere of the current floor: sky colour, fog density, or the biome itself. Use it only when what just happened should visibly change the world — a ritual completed, a curse lifted, a storm called. Omit anything that should stay as it is.",
      parameters: {
        skyColor: { type: "string", description: "Hex colour like #d9b06a." },
        fogDensity: {
          type: "number",
          minimum: LIMITS.fogDensity.min,
          maximum: LIMITS.fogDensity.max,
          description: "0 is clear air; 0.2 is a whiteout.",
        },
        biome: {
          type: "string",
          enum: [...BIOMES],
          description: "Re-theme the floor entirely. Rare and dramatic.",
        },
      },
      async execute(args): Promise<JsonValue> {
        return outcomeValue(
          await ctx.effects.apply({
            kind: "mutate_world",
            skyColor: args.skyColor ?? null,
            fogDensity: args.fogDensity ?? null,
            biome: args.biome ?? null,
          }),
        );
      },
      render,
    }),

    defineTool({
      name: "grant_materials",
      description:
        "Give the player crafting materials, because a choice or a trade just earned them. Use the player's language for the material names.",
      parameters: {
        materials: {
          type: "array",
          required: true,
          items: { type: "string" },
          description: "Short material names, e.g. lantern oil, river iron.",
        },
      },
      async execute(args): Promise<JsonValue> {
        return outcomeValue(
          await ctx.effects.apply({ kind: "grant_materials", materials: args.materials }),
        );
      },
      render,
    }),

    defineTool({
      name: "spawn_monster",
      description:
        "Put a monster on the current floor, because the fiction just called one into being. Give it a weakness the player could plausibly discover.",
      parameters: {
        id: { type: "string", required: true, description: "Unique id on this floor." },
        kind: { type: "string", required: true, enum: [...MONSTER_KINDS] },
        x: { type: "integer", required: true, ...coord, description: "Tile column." },
        z: { type: "integer", required: true, ...coord, description: "Tile row." },
        level: {
          type: "integer",
          required: true,
          minimum: LIMITS.level.min,
          maximum: LIMITS.level.max,
        },
        weakness: { type: "string", description: "Free text: what undoes it." },
        size: {
          type: "number",
          minimum: LIMITS.monsterSize.min,
          maximum: LIMITS.monsterSize.max,
          description: "1 is the usual silhouette.",
        },
        color: { type: "string", description: "Hex tint override." },
      },
      async execute(args): Promise<JsonValue> {
        return outcomeValue(
          await ctx.effects.apply({
            kind: "spawn_monster",
            monster: {
              id: args.id,
              kind: args.kind,
              x: args.x,
              z: args.z,
              level: args.level,
              weakness: args.weakness ?? "",
              size: args.size ?? 1,
              color: args.color ?? null,
            },
          }),
        );
      },
      render,
    }),

    defineTool({
      name: "add_quest",
      description:
        "Record a promise the player just made or accepted, so the world remembers to hold them to it.",
      parameters: {
        id: { type: "string", required: true, description: "Unique id, e.g. lantern-vigil." },
        text: {
          type: "string",
          required: true,
          description: "One sentence, in the player's language.",
        },
      },
      async execute(args): Promise<JsonValue> {
        return outcomeValue(
          await ctx.effects.apply({ kind: "add_quest", quest: { id: args.id, text: args.text } }),
        );
      },
      render,
    }),

    defineTool({
      name: "complete_quest",
      description:
        "Close a quest the player has just fulfilled. Only for a quest that already exists.",
      parameters: { id: { type: "string", required: true } },
      async execute(args): Promise<JsonValue> {
        return outcomeValue(await ctx.effects.apply({ kind: "complete_quest", id: args.id }));
      },
      render,
    }),

    defineTool({
      name: "set_flag",
      description:
        "Remember one durable fact about this world — a door unbarred, a name learned, a count. Flags are text; write true or false, or a number, as text.",
      parameters: {
        key: { type: "string", required: true, description: "Stable key, e.g. gate_7_open." },
        value: { type: "string", required: true },
      },
      async execute(args): Promise<JsonValue> {
        return outcomeValue(
          await ctx.effects.apply({ kind: "set_flag", key: args.key, value: args.value }),
        );
      },
      render,
    }),

    defineTool({
      name: "narrate",
      description:
        "Say one line the world itself speaks — a tremor, a bell, a smell of rain. Use it for something the player should feel happening around them, not for your answer to them.",
      parameters: { text: { type: "string", required: true } },
      async execute(args): Promise<JsonValue> {
        return outcomeValue(await ctx.effects.apply({ kind: "narrate", text: args.text }));
      },
      render,
    }),
  ];
}

export const worldTools: HarnessPlugin = {
  name: "builtin:world-tools",
  inject: ["tools", "effects"],
  apply(ctx: Context): () => void {
    return unwind(tools(ctx).map((tool) => ctx.tools.register(tool)));
  },
};
