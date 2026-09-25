// Mechanics tweaks: the typed surface a model is allowed to change about a running game.
//
// This is plan.md §4's change set (`change_timing`, `add_weapon`, …) expressed as data. The model
// never writes rules text and never touches code — it proposes one of these, the player sees
// exactly what would change, and only then is it applied. Everything is clamped here, so a
// hallucinated `damage: 99999` becomes a legal number rather than a broken cartridge (Rule 7).
//
// Pure, so the clamping and the merge are unit-tested without a model or a canvas.

import type { WeaponKind, WeaponSpec } from "./combat";
import type { GameplayRules } from "./gameplay";
import { err, ok, type Result } from "./result";
import {
  TIMING_SYSTEMS,
  type TimingSystemId,
  TURN_RESOLUTIONS,
  type TurnResolution,
} from "./timing";

export type RulesTweakOp =
  | {
      type: "change_timing";
      system: TimingSystemId;
      resolution?: TurnResolution;
      turnSeconds?: number;
    }
  | {
      type: "set_weapon";
      weaponId: string;
      damage?: number;
      range?: number;
      cooldownMs?: number;
      magazine?: number;
    }
  | {
      type: "add_weapon";
      id: string;
      name: string;
      kind: WeaponKind;
      damage: number;
      range: number;
      cooldownMs: number;
      magazine: number;
    }
  | { type: "set_combat"; playerHp?: number; monsterHpBase?: number; monsterHpPerLevel?: number }
  | { type: "set_party"; size?: number; memberHp?: number; memberSpeed?: number }
  | { type: "set_generation"; width?: number; depth?: number; braid?: number };

export interface RulesTweak {
  /** One line in the player's language saying what this does. Shown before anything is applied. */
  summary: string;
  ops: RulesTweakOp[];
}

/** Same ceilings the DSL enforces; a tweak that round-trips has to respect them. */
const LIMITS = {
  turnSeconds: { min: 0, max: 120 },
  damage: { min: 1, max: 999 },
  range: { min: 0.5, max: 60 },
  cooldown: { min: 50, max: 10_000 },
  magazine: { min: 0, max: 999 },
  hp: { min: 1, max: 9999 },
  hpStep: { min: 0, max: 999 },
  partySize: { min: 1, max: 5 },
  speed: { min: 1, max: 20 },
  span: { min: 0, max: 81 },
  braid: { min: 0, max: 100 },
} as const;

function clamp(value: number, range: { min: number; max: number }): number {
  if (!Number.isFinite(value)) return range.min;
  return Math.round(Math.max(range.min, Math.min(range.max, value)));
}

/** A readable line per operation, so approval is informed rather than a leap of faith. */
export function describeOp(op: RulesTweakOp, rules: GameplayRules): string {
  switch (op.type) {
    case "change_timing":
      return `節奏：${rules.timing?.system ?? "realtime"} → ${op.system}`;
    case "set_weapon": {
      const weapon = rules.weapons.find((one) => one.id === op.weaponId);
      const parts = [
        op.damage === undefined ? null : `傷害 ${weapon?.damage ?? "?"} → ${op.damage}`,
        op.range === undefined ? null : `射程 ${weapon?.range ?? "?"} → ${op.range}`,
        op.cooldownMs === undefined ? null : `冷卻 ${weapon?.cooldownMs ?? "?"} → ${op.cooldownMs}`,
        op.magazine === undefined
          ? null
          : `彈匣 ${weapon?.magazine ?? "∞"} → ${op.magazine || "∞"}`,
      ].filter((part): part is string => part !== null);
      return `${weapon?.name ?? op.weaponId}：${parts.join("、") || "沒有變更"}`;
    }
    case "add_weapon":
      return `新增武器「${op.name}」：傷害 ${op.damage}、射程 ${op.range}`;
    case "set_combat":
      return `生命值：玩家 ${op.playerHp ?? rules.combat?.playerHp ?? "?"}、怪物基礎 ${
        op.monsterHpBase ?? rules.combat?.monsterHpBase ?? "?"
      }`;
    case "set_party":
      return `隊伍：${rules.party?.size ?? 0} → ${op.size ?? rules.party?.size ?? 0} 人`;
    case "set_generation":
      return `地圖生成：${op.width ?? rules.generation?.width ?? 0}×${
        op.depth ?? rules.generation?.depth ?? 0
      }、開闊度 ${op.braid ?? rules.generation?.braid ?? 0}`;
  }
}

function applyOp(rules: GameplayRules, op: RulesTweakOp): Result<GameplayRules> {
  switch (op.type) {
    case "change_timing": {
      if (!(TIMING_SYSTEMS as readonly string[]).includes(op.system)) {
        return err("tweak-unknown-timing", `引擎沒有「${op.system}」這個節奏。`);
      }
      const resolution =
        op.resolution !== undefined &&
        (TURN_RESOLUTIONS as readonly string[]).includes(op.resolution)
          ? op.resolution
          : (rules.timing?.resolution ?? "per_player");
      return ok({
        ...rules,
        timing: {
          system: op.system,
          resolution,
          turnSeconds: clamp(op.turnSeconds ?? rules.timing?.turnSeconds ?? 0, LIMITS.turnSeconds),
        },
      });
    }

    case "set_weapon": {
      const target = rules.weapons.find((one) => one.id === op.weaponId);
      if (target === undefined) {
        return err("tweak-unknown-weapon", `這張卡帶沒有「${op.weaponId}」這把武器。`);
      }
      const magazine =
        op.magazine === undefined ? target.magazine : clamp(op.magazine, LIMITS.magazine);
      return ok({
        ...rules,
        weapons: rules.weapons.map((one) =>
          one.id !== op.weaponId
            ? one
            : {
                ...one,
                damage: op.damage === undefined ? one.damage : clamp(op.damage, LIMITS.damage),
                range: op.range === undefined ? one.range : clamp(op.range, LIMITS.range),
                cooldownMs:
                  op.cooldownMs === undefined
                    ? one.cooldownMs
                    : clamp(op.cooldownMs, LIMITS.cooldown),
                magazine: magazine === 0 ? null : magazine,
              },
        ),
      });
    }

    case "add_weapon": {
      if (rules.weapons.some((one) => one.id === op.id)) {
        return err("tweak-duplicate-weapon", `已經有一把叫「${op.id}」的武器了。`);
      }
      if (rules.combat === null) {
        return err("tweak-no-combat", "這張卡帶沒有戰鬥系統，加武器沒有意義。");
      }
      const magazine = clamp(op.magazine, LIMITS.magazine);
      const weapon: WeaponSpec = {
        id: op.id,
        name: op.name,
        kind: op.kind,
        damage: clamp(op.damage, LIMITS.damage),
        range: clamp(op.range, LIMITS.range),
        cooldownMs: clamp(op.cooldownMs, LIMITS.cooldown),
        magazine: magazine === 0 ? null : magazine,
      };
      return ok({ ...rules, weapons: [...rules.weapons, weapon] });
    }

    case "set_combat": {
      const current = rules.combat ?? { playerHp: 100, monsterHpBase: 30, monsterHpPerLevel: 10 };
      return ok({
        ...rules,
        combat: {
          playerHp: clamp(op.playerHp ?? current.playerHp, LIMITS.hp),
          monsterHpBase: clamp(op.monsterHpBase ?? current.monsterHpBase, LIMITS.hp),
          monsterHpPerLevel: clamp(
            op.monsterHpPerLevel ?? current.monsterHpPerLevel,
            LIMITS.hpStep,
          ),
        },
      });
    }

    case "set_party": {
      const current = rules.party ?? { size: 1, memberHp: 60, memberSpeed: 8 };
      return ok({
        ...rules,
        party: {
          size: clamp(op.size ?? current.size, LIMITS.partySize),
          memberHp: clamp(op.memberHp ?? current.memberHp, LIMITS.hp),
          memberSpeed: clamp(op.memberSpeed ?? current.memberSpeed, LIMITS.speed),
        },
      });
    }

    case "set_generation": {
      if (rules.generation === null) {
        return err("tweak-no-generation", "這張卡帶的地圖不是生成的。");
      }
      return ok({
        ...rules,
        generation: {
          ...rules.generation,
          width: clamp(op.width ?? rules.generation.width, LIMITS.span),
          depth: clamp(op.depth ?? rules.generation.depth, LIMITS.span),
          braid: clamp(op.braid ?? rules.generation.braid, LIMITS.braid),
        },
      });
    }
  }
}

/** Applies every operation in order. One rejected operation rejects the whole tweak. */
export function applyTweak(rules: GameplayRules, tweak: RulesTweak): Result<GameplayRules> {
  if (tweak.ops.length === 0) {
    return err("tweak-empty", "這個調整沒有任何實際變更。", "換個說法再試一次。");
  }
  let next = rules;
  for (const op of tweak.ops) {
    const applied = applyOp(next, op);
    if (!applied.ok) return applied;
    next = applied.value;
  }
  return ok(next);
}
