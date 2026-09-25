import type { OpenUIError } from "@openuidev/lang-core";
import type { GameplayKitRules, GameplayRules, InputAction, InputCode } from "@shared/cartridge";
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
    lookSensitivity: clampFloat(props.lookSensitivity, RANGES.sensitivity),
    cameraDistance: clampFloat(props.cameraDistance, RANGES.distance),
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
  const seenKits = new Set<string>();
  const seenActions = new Set<string>();
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
    }
  }
  if (issues.length > 0 || kits.length === 0 || !seenKits.has(head.data.defaultKit)) {
    return invalid(issues);
  }
  return ok({ defaultKit: head.data.defaultKit, physics: head.data.physics, kits, bindings });
}
