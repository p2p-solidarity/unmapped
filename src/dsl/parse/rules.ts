import type { OpenUIError } from "@openuidev/lang-core";
import type {
  CombatRules,
  GameplayKitRules,
  GameplayRules,
  GenerationRules,
  InputAction,
  InputCode,
  PartyRules,
  TimingRules,
} from "@shared/cartridge";
import type { WeaponSpec } from "@shared/combat";
import type { ProgressionRule } from "@shared/progression";
import { ok, type Result } from "@shared/result";
import type { z } from "zod";
import { rulesLibrary } from "../libraries";
import { clampFloat } from "../limits";
import { RULE_PROPS } from "../schemas/rules";
import type { DslError } from "../types";
import { childrenOf, createDialect, dslError, failWith, parseRoot, readProps } from "./program";

const dialect = createDialect(rulesLibrary);
const HEAD = RULE_PROPS.Rules.pick({ defaultKit: true, physics: true });

const RANGES = {
  speed: { min: 0, max: 20 },
  jump: { min: 0, max: 20 },
  gravity: { min: 1, max: 50 },
  reach: { min: 0.5, max: 8 },
  fov: { min: 35, max: 110 },
  sensitivity: { min: 0.0001, max: 0.02 },
  distance: { min: 0, max: 20 },
  turnSeconds: { min: 0, max: 120 },
  damage: { min: 1, max: 999 },
  weaponRange: { min: 0.5, max: 60 },
  cooldown: { min: 50, max: 10_000 },
  magazine: { min: 0, max: 999 },
  hp: { min: 1, max: 9999 },
  hpStep: { min: 0, max: 999 },
  partySize: { min: 1, max: 5 },
  speed2: { min: 1, max: 20 },
  progressionValue: { min: 0, max: 100_000 },
  mazeSpan: { min: 0, max: 81 },
  braid: { min: 0, max: 100 },
} as const;

function kitFrom(props: z.infer<typeof RULE_PROPS.Kit>): GameplayKitRules {
  return {
    id: props.id,
    moveSpeed: clampFloat(props.moveSpeed, RANGES.speed),
    sprintSpeed: clampFloat(props.sprintSpeed, RANGES.speed),
    jumpSpeed: clampFloat(props.jumpSpeed, RANGES.jump),
    gravity: clampFloat(props.gravity, RANGES.gravity),
    interactDistance: clampFloat(props.interactDistance, RANGES.reach),
    cameraFov: clampFloat(props.cameraFov, RANGES.fov),
    lookSensitivity: clampFloat(props.lookSensitivity, RANGES.sensitivity, 5),
    cameraDistance: clampFloat(props.cameraDistance, RANGES.distance),
  };
}

function timingFrom(props: z.infer<typeof RULE_PROPS.Timing>): TimingRules {
  return {
    system: props.system,
    resolution: props.resolution,
    turnSeconds: clampFloat(props.turnSeconds, RANGES.turnSeconds),
  };
}

function weaponFrom(props: z.infer<typeof RULE_PROPS.Weapon>): WeaponSpec {
  const magazine = Math.round(clampFloat(props.magazine, RANGES.magazine));
  return {
    id: props.id,
    name: props.name,
    kind: props.kind,
    damage: Math.round(clampFloat(props.damage, RANGES.damage)),
    range: clampFloat(props.range, RANGES.weaponRange),
    cooldownMs: Math.round(clampFloat(props.cooldownMs, RANGES.cooldown)),
    // 0 is the DSL's way of writing "never runs dry"; the engine wants null.
    magazine: magazine === 0 ? null : magazine,
    ...(props.assetId == null ? {} : { assetId: props.assetId }),
  };
}

function combatFrom(props: z.infer<typeof RULE_PROPS.Combat>): CombatRules {
  return {
    playerHp: Math.round(clampFloat(props.playerHp, RANGES.hp)),
    monsterHpBase: Math.round(clampFloat(props.monsterHpBase, RANGES.hp)),
    monsterHpPerLevel: Math.round(clampFloat(props.monsterHpPerLevel, RANGES.hpStep)),
  };
}

function partyFrom(props: z.infer<typeof RULE_PROPS.Party>): PartyRules {
  return {
    size: Math.round(clampFloat(props.size, RANGES.partySize)),
    memberHp: Math.round(clampFloat(props.memberHp, RANGES.hp)),
    memberSpeed: clampFloat(props.memberSpeed, RANGES.speed2),
  };
}

function generationFrom(props: z.infer<typeof RULE_PROPS.Generate>): GenerationRules {
  return {
    kind: props.kind,
    width: Math.round(clampFloat(props.width, RANGES.mazeSpan)),
    depth: Math.round(clampFloat(props.depth, RANGES.mazeSpan)),
    braid: Math.round(clampFloat(props.braid, RANGES.braid)),
  };
}

function invalid(issues: OpenUIError[]): Result<never, DslError> {
  return failWith(
    dslError({
      code: "dsl-invalid-rules",
      message: "The gameplay rules are incomplete or ambiguous.",
      hint: "Declare each kit and input action once, and make defaultKit refer to a declared Kit.",
      errors: issues,
    }),
  );
}

export function parseRules(source: string): Result<GameplayRules, DslError> {
  const parsed = parseRoot(dialect, source);
  if (!parsed.ok) return parsed;
  const head = HEAD.safeParse(parsed.value.props);
  if (!head.success) {
    return failWith(
      dslError({
        code: "dsl-invalid-rules",
        message: "Rules(defaultKit, physics, children) is invalid.",
        hint: "Choose a supported versioned kit and physics mode.",
      }),
    );
  }

  const issues: OpenUIError[] = [];
  const kits: GameplayKitRules[] = [];
  const bindings: Partial<Record<InputAction, InputCode[]>> = {};
  const weapons: WeaponSpec[] = [];
  let timing: TimingRules | null = null;
  let combat: CombatRules | null = null;
  let party: PartyRules | null = null;
  let generation: GenerationRules | null = null;
  const progression: ProgressionRule[] = [];
  const seenProgression = new Set<string>();
  const seenKits = new Set<string>();
  const seenActions = new Set<string>();
  const seenWeapons = new Set<string>();
  for (const child of childrenOf(parsed.value)) {
    if (child.typeName === "Kit") {
      const props = readProps(RULE_PROPS.Kit, child, issues);
      if (props === null) continue;
      if (seenKits.has(props.id)) return invalid(issues);
      seenKits.add(props.id);
      kits.push(kitFrom(props));
    } else if (child.typeName === "Bind") {
      const props = readProps(RULE_PROPS.Bind, child, issues);
      if (props === null) continue;
      if (seenActions.has(props.action)) return invalid(issues);
      seenActions.add(props.action);
      bindings[props.action] = [...new Set(props.keys)];
    } else if (child.typeName === "Timing") {
      const props = readProps(RULE_PROPS.Timing, child, issues);
      if (props === null) continue;
      if (timing !== null) return invalid(issues); // one pacing per cartridge
      timing = timingFrom(props);
    } else if (child.typeName === "Combat") {
      const props = readProps(RULE_PROPS.Combat, child, issues);
      if (props === null) continue;
      if (combat !== null) return invalid(issues);
      combat = combatFrom(props);
    } else if (child.typeName === "Generate") {
      const props = readProps(RULE_PROPS.Generate, child, issues);
      if (props === null) continue;
      if (generation !== null) return invalid(issues);
      generation = generationFrom(props);
    } else if (child.typeName === "Party") {
      const props = readProps(RULE_PROPS.Party, child, issues);
      if (props === null) continue;
      if (party !== null) return invalid(issues);
      party = partyFrom(props);
    } else if (child.typeName === "Progression") {
      const props = readProps(RULE_PROPS.Progression, child, issues);
      if (props === null) continue;
      if (seenProgression.has(props.kind)) return invalid(issues);
      seenProgression.add(props.kind);
      progression.push({
        kind: props.kind,
        value: Math.round(clampFloat(props.value, RANGES.progressionValue)),
      });
    } else if (child.typeName === "Weapon") {
      const props = readProps(RULE_PROPS.Weapon, child, issues);
      if (props === null) continue;
      if (seenWeapons.has(props.id)) return invalid(issues);
      seenWeapons.add(props.id);
      weapons.push(weaponFrom(props));
    }
  }
  // A cartridge that arms the player must also say how much anything can take.
  if (weapons.length > 0 && combat === null) return invalid(issues);
  if (issues.length > 0 || kits.length === 0 || !seenKits.has(head.data.defaultKit)) {
    return invalid(issues);
  }
  return ok({
    defaultKit: head.data.defaultKit,
    physics: head.data.physics,
    kits,
    bindings,
    timing,
    combat,
    party,
    generation,
    progression,
    weapons,
  });
}
