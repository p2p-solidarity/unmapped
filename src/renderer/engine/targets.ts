// Pure proximity maths: turn a SceneGraph into interactable points and pick the nearest one.
// No three, no React — the R3F <Proximity> component only feeds it the player position.

import type { NearbyTarget, TargetKind } from "@shared/events";
import type { SceneGraph, TriggerSpec } from "@shared/world";
import { tileToWorld } from "./colliders";
import { monsterReach } from "./monsters";

/** Interaction reach in tiles. */
export const NEAR_RADIUS = 2;

export interface TargetPoint {
  kind: TargetKind;
  id: string;
  label: string;
  /** World XZ of the target. */
  x: number;
  z: number;
  /**
   * Extra reach the target's own bulk adds, in tiles. 0 for everything authored at a fixed size;
   * a scaled-up monster is reachable from further because its edge is further out.
   */
  reach: number;
}

export function exitId(x: number, z: number): string {
  return `exit-${x}-${z}`;
}

export function altarId(x: number, z: number): string {
  return `altar-${x}-${z}`;
}

/** "fox_spirit" + level 3 → "fox spirit Lv.3". */
export function monsterLabel(kind: string, level: number): string {
  return `${kind.replace(/_/g, " ")} Lv.${level}`;
}

/**
 * Every point the player can interact with. `opened` treasure ids are dropped so a looted chest
 * stops offering a prompt. Quests are never targets — they live in the HUD. Altar interaction is
 * offered only to the legacy archive; in cartridge worlds the prop is scenery.
 */
export function sceneTargets(
  scene: SceneGraph,
  opened: readonly string[] = [],
  allowAltar = true,
): TargetPoint[] {
  const points: TargetPoint[] = [];
  for (const npc of scene.npcs) {
    const [x, z] = tileToWorld(npc.x, npc.z);
    points.push({ kind: "npc", id: npc.id, label: npc.name, x, z, reach: 0 });
  }
  for (const monster of scene.monsters) {
    const [x, z] = tileToWorld(monster.x, monster.z);
    points.push({
      kind: "monster",
      id: monster.id,
      label: monsterLabel(monster.kind, monster.level),
      x,
      z,
      reach: monsterReach(monster),
    });
  }
  for (const treasure of scene.treasures) {
    if (opened.includes(treasure.id)) continue;
    const [x, z] = tileToWorld(treasure.x, treasure.z);
    points.push({ kind: "treasure", id: treasure.id, label: "Treasure", x, z, reach: 0 });
  }
  for (const exit of scene.exits) {
    const [x, z] = tileToWorld(exit.x, exit.z);
    points.push({ kind: "exit", id: exitId(exit.x, exit.z), label: exit.to, x, z, reach: 0 });
  }
  for (const prop of scene.props) {
    if (!allowAltar || prop.kind !== "altar") continue;
    const [x, z] = tileToWorld(prop.x, prop.z);
    points.push({ kind: "altar", id: altarId(prop.x, prop.z), label: "Altar", x, z, reach: 0 });
  }
  for (const trigger of scene.triggers) {
    const [x, z] = tileToWorld(trigger.x, trigger.z);
    points.push({ kind: "trigger", id: trigger.id, label: trigger.id, x, z, reach: 0 });
  }
  return points;
}

/** Distance to the target's surface: its centre distance minus whatever bulk it carries. */
export function distanceTo(point: TargetPoint, px: number, pz: number): number {
  return Math.max(0, Math.hypot(point.x - px, point.z - pz) - point.reach);
}

/**
 * Nearest target within `radius` tiles, or null. Ties break on the earlier entry, which keeps the
 * result stable frame to frame (NPCs first, then monsters, treasures, exits, altars, triggers).
 */
export function nearestTarget(
  points: readonly TargetPoint[],
  px: number,
  pz: number,
  radius = NEAR_RADIUS,
): NearbyTarget | null {
  let best: NearbyTarget | null = null;
  for (const point of points) {
    const distance = distanceTo(point, px, pz);
    if (distance > radius) continue;
    if (best !== null && distance >= best.distance) continue;
    best = { kind: point.kind, id: point.id, label: point.label, distance };
  }
  return best;
}

/** Trigger volumes the player currently stands in — each uses its own declared radius. */
export function triggersWithin(
  triggers: readonly TriggerSpec[],
  px: number,
  pz: number,
): TriggerSpec[] {
  const inside: TriggerSpec[] = [];
  for (const trigger of triggers) {
    const [x, z] = tileToWorld(trigger.x, trigger.z);
    if (Math.hypot(x - px, z - pz) <= Math.max(0, trigger.radius)) inside.push(trigger);
  }
  return inside;
}

/** NearbyTarget for a trigger the player just entered, so `interact` can log the event. */
export function triggerTarget(trigger: TriggerSpec, px: number, pz: number): NearbyTarget {
  const [x, z] = tileToWorld(trigger.x, trigger.z);
  return {
    kind: "trigger",
    id: trigger.id,
    label: trigger.id,
    distance: Math.hypot(x - px, z - pz),
  };
}
