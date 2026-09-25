// Readers for everything that acts, speaks, glows or ends the floor: NPCs (whose look is derived
// from their role when the model stops early), monsters, treasure, the exit, lights, sky,
// triggers and quests.

import type { OpenUIError } from "@openuidev/lang-core";
import type { SceneContract } from "@shared/gameplay";
import type {
  ExitSpec,
  LightSpec,
  MonsterSpec,
  NpcSpec,
  QuestSpec,
  SkySpec,
  TreasureSpec,
  TriggerSpec,
} from "@shared/world";
import { clampFloat, clampInt, clampText, LIMITS, truncate } from "../limits";
import { toHex } from "../schemas/common";
import { accentFor, ROLE_LOOK } from "../schemas/looks";
import { SCENE_PROPS } from "../schemas/scene";
import { slugId } from "./ids";
import { type ChildNode, readProps } from "./program";
import type { SceneScope } from "./sceneScope";

const given = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined;

export function readNpc(child: ChildNode, scope: SceneScope): NpcSpec | null {
  const p = readProps(SCENE_PROPS.NPC, child, scope.issues);
  if (p === null) return null;
  const look = ROLE_LOOK[p.role];
  const color = toHex(p.color);
  return {
    id: scope.take(p.id, "npc"),
    name: clampText(p.name, LIMITS.text.name),
    x: scope.x(p.x),
    z: scope.z(p.z),
    role: p.role,
    mood: p.mood,
    color,
    body: given(p.body) ? p.body : look.body,
    hat: given(p.hat) ? p.hat : look.hat,
    held: given(p.held) ? p.held : look.held,
    accent: given(p.accent) ? toHex(p.accent) : accentFor(color),
  };
}

export function readMonster(child: ChildNode, scope: SceneScope): MonsterSpec | null {
  const p = readProps(SCENE_PROPS.Monster, child, scope.issues);
  if (p === null) return null;
  return {
    id: scope.take(p.id, "monster"),
    kind: p.kind,
    x: scope.x(p.x),
    z: scope.z(p.z),
    level: clampInt(p.level, LIMITS.level),
    weakness: clampText(p.weakness, LIMITS.text.weakness),
    size: given(p.size) ? clampFloat(p.size, LIMITS.monsterSize) : 1,
    color: given(p.color) ? toHex(p.color) : null,
  };
}

export function readTreasure(child: ChildNode, scope: SceneScope): TreasureSpec | null {
  const p = readProps(SCENE_PROPS.Treasure, child, scope.issues);
  if (p === null) return null;
  return {
    id: scope.take(p.id, "treasure"),
    x: scope.x(p.x),
    z: scope.z(p.z),
    loot: truncate(
      p.loot.map((item) => clampText(item, LIMITS.text.loot)).filter((item) => item !== ""),
      LIMITS.maxLoot,
    ),
  };
}

export function readExit(child: ChildNode, scope: SceneScope): ExitSpec | null {
  const p = readProps(SCENE_PROPS.Exit, child, scope.issues);
  if (p === null) return null;
  return {
    x: scope.x(p.x),
    z: scope.z(p.z),
    to: clampText(p.to, LIMITS.text.exit),
    targetSceneId: given(p.targetSceneId) ? p.targetSceneId : null,
  };
}

export function readContract(child: ChildNode, issues: OpenUIError[]): SceneContract | null {
  const p = readProps(SCENE_PROPS.Contract, child, issues);
  if (p === null) return null;
  return {
    sceneId: p.sceneId,
    kit: p.kit,
    requiresFlags: [...new Set(p.requiresFlags)],
    requiresItems: [...new Set(p.requiresItems)],
    inventoryPolicy: p.inventoryPolicy,
    grantsFlags: [...new Set(p.grantsFlags)],
    terminal: p.terminal,
  };
}

/** Only a point light stands somewhere; ambient and sun colour the whole floor. */
export function readLight(child: ChildNode, scope: SceneScope): LightSpec | null {
  const p = readProps(SCENE_PROPS.Light, child, scope.issues);
  if (p === null) return null;
  const placed = p.kind === "point" && given(p.x) && given(p.z);
  return {
    kind: p.kind,
    color: toHex(p.color),
    intensity: clampFloat(p.intensity, LIMITS.intensity),
    x: placed && given(p.x) ? scope.x(p.x) : null,
    z: placed && given(p.z) ? scope.z(p.z) : null,
  };
}

export function readSky(child: ChildNode, scope: SceneScope): SkySpec | null {
  const p = readProps(SCENE_PROPS.Sky, child, scope.issues);
  if (p === null) return null;
  return {
    color: toHex(p.color),
    fog: toHex(p.fog),
    fogDensity: clampFloat(p.fogDensity, LIMITS.fogDensity),
  };
}

export function readTrigger(child: ChildNode, scope: SceneScope): TriggerSpec | null {
  const p = readProps(SCENE_PROPS.Trigger, child, scope.issues);
  if (p === null) return null;
  return {
    id: scope.take(p.id, "trigger"),
    x: scope.x(p.x),
    z: scope.z(p.z),
    radius: clampInt(p.radius, LIMITS.radius),
    event: slugId(p.event, "trigger_fired"),
  };
}

export function readQuest(child: ChildNode, scope: SceneScope): QuestSpec | null {
  const p = readProps(SCENE_PROPS.Quest, child, scope.issues);
  if (p === null) return null;
  return {
    id: scope.take(p.id, "quest"),
    text: clampText(p.text, LIMITS.text.quest),
  };
}
