// `ctx.effects` — the only seam through which a tool call changes the world.
//
// The model's arguments have already been validated against the tool's own schema; this second
// gate validates the *effect* itself, because a mod's effect template can interpolate anything
// into any field. Nothing reaches the renderer's provider until it is a well-formed GameEffect
// whose numbers sit inside the same ranges the DSL clamps to (@dsl/limits).

import { type Context, Service } from "@deepseek-ai/cordis";
import { LIMITS } from "@dsl/limits";
import type { EffectOutcome, GameEffect } from "@shared/effects";
import {
  BIOMES,
  BODY_KINDS,
  HAT_KINDS,
  HELD_KINDS,
  ITEM_KINDS,
  MONSTER_KINDS,
  MOODS,
  NPC_ROLES,
  type NpcSpec,
} from "@shared/world";
import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "colours are #rrggbb hex");
const coord = z.number().min(LIMITS.coord.min).max(LIMITS.coord.max);
const id = z.string().min(1).max(LIMITS.text.id);
const material = z.string().min(1).max(LIMITS.text.loot);

const itemSpecSchema = z.object({
  id,
  name: z.string().min(1).max(LIMITS.text.name),
  kind: z.enum(ITEM_KINDS),
  power: z.number().min(LIMITS.power.min).max(LIMITS.power.max),
  perk: z.string().max(LIMITS.text.perk).default(""),
  curse: z.string().max(LIMITS.text.curse).nullable().default(null),
  meshDna: z.array(z.string().min(1)).max(LIMITS.maxMeshDna).default([]),
  archetype: z
    .array(z.string().min(1).max(LIMITS.text.archetype))
    .max(LIMITS.maxArchetype)
    .default([]),
  flavor: z.string().max(LIMITS.text.flavor).default(""),
});

const monsterSpecSchema = z.object({
  id,
  kind: z.enum(MONSTER_KINDS),
  x: coord,
  z: coord,
  level: z.number().int().min(LIMITS.level.min).max(LIMITS.level.max),
  weakness: z.string().max(LIMITS.text.weakness).default(""),
  size: z.number().min(LIMITS.monsterSize.min).max(LIMITS.monsterSize.max).default(1),
  color: hex.nullable().default(null),
});

const npcSpecSchema = z
  .object({
    id,
    name: z.string().min(1).max(LIMITS.text.name),
    x: coord,
    z: coord,
    role: z.enum(NPC_ROLES),
    mood: z.enum(MOODS),
    color: hex,
    body: z.enum(BODY_KINDS).default("slim"),
    hat: z.enum(HAT_KINDS).default("none"),
    held: z.enum(HELD_KINDS).default("none"),
    accent: hex.optional(),
  })
  // The DSL derives an NPC's accent from its body colour when the model omits it; a tool-spawned
  // NPC follows the same rule instead of inventing a second default.
  .transform((npc): NpcSpec => ({ ...npc, accent: npc.accent ?? npc.color }));

const questSpecSchema = z.object({
  id,
  text: z.string().min(1).max(LIMITS.text.quest),
});

/** The GameEffect union from @shared/effects, with every range the engine relies on. */
export const gameEffectSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("mutate_world"),
    skyColor: hex.nullable().default(null),
    fogDensity: z
      .number()
      .min(LIMITS.fogDensity.min)
      .max(LIMITS.fogDensity.max)
      .nullable()
      .default(null),
    biome: z.enum(BIOMES).nullable().default(null),
  }),
  z.object({
    kind: z.literal("grant_materials"),
    materials: z.array(material).min(1).max(LIMITS.maxLoot),
  }),
  z.object({
    kind: z.literal("consume_materials"),
    materials: z.array(material).min(1).max(LIMITS.maxLoot),
  }),
  z.object({ kind: z.literal("grant_item"), item: itemSpecSchema }),
  z.object({ kind: z.literal("spawn_monster"), monster: monsterSpecSchema }),
  z.object({ kind: z.literal("spawn_npc"), npc: npcSpecSchema }),
  z.object({ kind: z.literal("remove_entity"), id }),
  z.object({ kind: z.literal("add_quest"), quest: questSpecSchema }),
  z.object({ kind: z.literal("complete_quest"), id }),
  z.object({
    kind: z.literal("set_flag"),
    key: z.string().min(1).max(LIMITS.text.id),
    value: z.union([z.string().max(LIMITS.text.effect), z.number(), z.boolean()]),
  }),
  z.object({ kind: z.literal("teleport_player"), x: coord, z: coord }),
  z.object({ kind: z.literal("narrate"), text: z.string().min(1).max(LIMITS.text.line) }),
]);

/** Validate an untrusted value as a GameEffect. */
export function parseGameEffect(
  value: unknown,
): { ok: true; effect: GameEffect } | { ok: false; message: string } {
  const parsed = gameEffectSchema.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "kind"}: ${issue.message}`)
      .join("; ");
    return { ok: false, message: `invalid effect: ${issues}` };
  }
  const effect: GameEffect = parsed.data;
  return { ok: true, effect };
}

export type EffectApplier = (effect: GameEffect) => Promise<EffectOutcome>;

export class EffectsService extends Service {
  /** One world is open at a time, so one provider applies effects at a time. */
  private applier: EffectApplier | null = null;

  constructor(ctx: Context) {
    super(ctx, "effects");
  }

  provider(apply: EffectApplier): () => void {
    return this.ctx.effect(() => {
      if (this.applier !== null) {
        throw new Error("an effect provider is already registered (one world is open at a time)");
      }
      this.applier = apply;
      return () => {
        this.applier = null;
      };
    }, "effects.provider()");
  }

  /** Validate, then hand the effect to the world. Never throws — the model reads the message. */
  async apply(effect: unknown): Promise<EffectOutcome> {
    const parsed = parseGameEffect(effect);
    if (!parsed.ok) return { ok: false, message: parsed.message };
    const applier = this.applier;
    if (applier === null) return { ok: false, message: "no world is loaded" };
    return applier(parsed.effect);
  }
}
