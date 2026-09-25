// The mechanics tweaker: the player says what they want changed, the model answers with a typed
// `RulesTweak`, and nothing happens until the player approves it.
//
// plan.md §4 and §2.4, together: the model may propose, never apply. It gets the current rules as
// facts and a closed list of operations; anything outside that list is rejected by the schema
// before it ever reaches the game.

import { chat } from "@renderer/llm";
import type { GameplayRules } from "@shared/gameplay";
import { languageName } from "@shared/language";
import { err, ok, type Result } from "@shared/result";
import { TIMING_SYSTEMS, TURN_RESOLUTIONS } from "@shared/timing";
import type { RulesTweak } from "@shared/tweak";
import { z } from "zod";

const opSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("change_timing"),
      system: z.enum(TIMING_SYSTEMS),
      resolution: z.enum(TURN_RESOLUTIONS).optional(),
      turnSeconds: z.number().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("set_weapon"),
      weaponId: z.string().min(1),
      damage: z.number().optional(),
      range: z.number().optional(),
      cooldownMs: z.number().optional(),
      magazine: z.number().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("add_weapon"),
      id: z.string().regex(/^[a-z0-9_]{1,40}$/),
      name: z.string().min(1).max(40),
      kind: z.enum(["gun", "melee", "tool"]),
      damage: z.number(),
      range: z.number(),
      cooldownMs: z.number(),
      magazine: z.number(),
    })
    .strict(),
  z
    .object({
      type: z.literal("set_combat"),
      playerHp: z.number().optional(),
      monsterHpBase: z.number().optional(),
      monsterHpPerLevel: z.number().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("set_party"),
      size: z.number().optional(),
      memberHp: z.number().optional(),
      memberSpeed: z.number().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("set_generation"),
      width: z.number().optional(),
      depth: z.number().optional(),
      braid: z.number().optional(),
    })
    .strict(),
]);

const tweakSchema: z.ZodType<RulesTweak> = z
  .object({
    summary: z.string().trim().min(1).max(160),
    ops: z.array(opSchema).min(1).max(6),
  })
  .strict();

function jsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** What the model is told the game currently is, so a tweak is relative to something real. */
function factsFor(rules: GameplayRules): string {
  return [
    `timing: ${rules.timing === null ? "realtime" : `${rules.timing.system} / ${rules.timing.resolution} / ${rules.timing.turnSeconds}s`}`,
    `combat: ${rules.combat === null ? "none" : `playerHp ${rules.combat.playerHp}, monsterHp ${rules.combat.monsterHpBase}+${rules.combat.monsterHpPerLevel}/lv`}`,
    `party: ${rules.party === null ? "solo" : `${rules.party.size} allies, ${rules.party.memberHp} hp`}`,
    `generation: ${rules.generation === null ? "authored" : `${rules.generation.kind} ${rules.generation.width}x${rules.generation.depth} braid ${rules.generation.braid}`}`,
    `weapons: ${
      rules.weapons.length === 0
        ? "none"
        : rules.weapons
            .map(
              (one) =>
                `${one.id} (${one.name}, ${one.kind}, dmg ${one.damage}, range ${one.range}, cd ${one.cooldownMs}ms, mag ${one.magazine ?? "inf"})`,
            )
            .join("; ")
    }`,
  ].join("\n");
}

export async function generateTweak(input: {
  wish: string;
  rules: GameplayRules;
  language: string;
}): Promise<Result<RulesTweak>> {
  const result = await chat({
    messages: [
      {
        role: "system",
        content: [
          "You adjust the mechanics of a running game. Return JSON only, no prose.",
          'Shape: {"summary":string,"ops":[...]}.',
          "Allowed ops and nothing else: change_timing, set_weapon, add_weapon, set_combat,",
          "set_party, set_generation. Omit any field you are not changing.",
          `Timing systems: ${TIMING_SYSTEMS.join(", ")}.`,
          `Write summary in ${languageName(input.language)}.`,
          "Change only what was asked. Never invent a system that is not in the op list, and never",
          "reference a weapon id that is not in the facts.",
        ].join(" "),
      },
      {
        role: "user",
        content: `Current rules:\n${factsFor(input.rules)}\n\nThe player wants: ${input.wish}`,
      },
    ],
    maxTokens: 500,
    temperature: 0.3,
    grammar: null,
    stop: [],
    tools: [],
  });
  if (!result.ok) return result;

  const parsed = tweakSchema.safeParse(jsonObject(result.value.text));
  if (!parsed.success) {
    return err(
      "tweak-invalid",
      parsed.error.issues[0]?.message ?? "模型沒有回傳可用的調整。",
      "換個說法，或只改一件事再試一次。",
    );
  }
  return ok(parsed.data);
}
