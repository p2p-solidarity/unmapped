// Builds an encounter from the parsed scene and the cartridge's rules. Pure so the roster can be
// unit-tested without a canvas: same scene + same rules always produce the same combatants in the
// same order, which the deterministic turn order depends on.
//
// Everything here is read from data. A scene with no monsters, or rules with no Combat statement,
// produces no encounter at all rather than an empty health bar (Rule 2).

import { translate } from "@renderer/i18n";
import type { EncounterCombatant } from "@renderer/state/encounterStore";
import type { Blocker, Combatant, WeaponSpec } from "@shared/combat";
import { hitscan, isAlive, monsterHp } from "@shared/combat";
import type { GameplayRules } from "@shared/gameplay";
import { generateMaze } from "@shared/maze";
import { hasKind } from "@shared/progression";
import { shuffleForRun } from "@shared/runShuffle";
import { beginEncounter, type TurnState } from "@shared/timing";
import type { MonsterSpec, SceneGraph, WallSpec } from "@shared/world";
import { PLAYER_FOOT_OFFSET, spawnPoint, TILE_TOP, tileToWorld, wallBoxes } from "../colliders";
import { clampMonsterSize, monsterRadius } from "../monsters";
import { MONSTER_LOOK } from "../palette";

export const PLAYER_ID = "player";
/** Ally slots stand in an arc behind the spawn tile, one tile apart. */
const ALLY_SPACING = 1.2;
/** Camera height above the capsule centre in first person. Must match CameraRig's EYE_HEIGHT. */
export const FPS_EYE_HEIGHT = 0.6;
/** A flat (side-on / top-down / grid) shot leaves at chest height so short monsters are in line. */
const FLAT_SHOT_HEIGHT = 0.6;

/** Hit-box of a monster: the silhouette <Monster> actually draws, scaled the same way. */
function monsterBody(monster: MonsterSpec): Pick<Combatant, "radius" | "height"> {
  return {
    radius: monsterRadius(monster),
    height: MONSTER_LOOK[monster.kind].height * clampMonsterSize(monster.size),
  };
}

/**
 * The scene as this run will actually be played.
 *
 * Two layers, in order. `Generate` rebuilds the space between the author's two fixed points — the
 * spawn tile and the scene's Exit — and never moves either of them. `run_based` progression then
 * reshuffles the movers onto whatever ground came out. A cartridge that declared neither plays the
 * authored scene untouched.
 */
export function sceneForRun(
  graph: SceneGraph,
  rules: GameplayRules | null,
  seed: number,
): SceneGraph {
  if (rules === null) return graph;

  let next = graph;
  const generation = rules.generation;
  if (generation !== null) {
    const width = generation.width > 0 ? generation.width : graph.floor.width;
    const depth = generation.depth > 0 ? generation.depth : graph.floor.depth;
    const floor = { ...graph.floor, width, depth };
    // The author's ends: the centre spawn tile, and wherever they placed the Exit.
    const entrance = { x: Math.floor(width / 2), z: Math.floor(depth / 2) };
    const authored = graph.exits[0];
    const exit = {
      x: Math.max(1, Math.min(width - 2, authored?.x ?? width - 2)),
      z: Math.max(1, Math.min(depth - 2, authored?.z ?? depth - 2)),
    };
    const maze = generateMaze({ width, depth, seed, entrance, exit, braid: generation.braid });

    next = {
      ...graph,
      floor,
      walls: maze.walls,
      // Platforms and patches belong to an authored floor plan that no longer exists.
      platforms: [],
      patches: [],
      // The Exit moves to the tile the generator guaranteed a route to.
      exits: graph.exits.slice(0, 1).map((one) => ({ ...one, x: exit.x, z: exit.z })),
      // Props would otherwise end up inside rock; drop them onto open ground further on.
      props: [],
    };
  }

  if (!hasKind(rules.progression, "run_based")) return next;
  return shuffleForRun(next, seed);
}

export interface BuiltEncounter {
  combatants: EncounterCombatant[];
  weapon: WeaponSpec | null;
  turn: TurnState;
}

/**
 * Null when this cartridge has no combat: no Combat statement in rules.oui, or a scene with
 * nothing hostile in it. Callers must treat null as "there is no fight here", not as an error.
 */
export function buildEncounter(
  graph: SceneGraph,
  rules: GameplayRules | null,
  /** Open land: an armed player is ready to fight even when nothing hostile is near yet. */
  options: { armedAlone?: boolean } = {},
): BuiltEncounter | null {
  if (rules === null || rules.combat === null) return null;
  const alone = options.armedAlone === true && rules.weapons.length > 0;
  if (graph.monsters.length === 0 && !alone) return null;

  // Every combatant position is in world units (spawnPoint already is), never tile coordinates.
  const [spawnX, , spawnZ] = spawnPoint(graph);
  const combatants: EncounterCombatant[] = [
    {
      id: PLAYER_ID,
      label: "You",
      side: "party",
      hp: rules.combat.playerHp,
      maxHp: rules.combat.playerHp,
      x: spawnX,
      z: spawnZ,
      radius: 0.3,
      height: 1.6,
      speed: 10,
      level: 1,
    },
  ];

  const party = rules.party;
  if (party !== null) {
    for (let slot = 0; slot < party.size; slot += 1) {
      // Alternate left and right of the spawn so the squad reads as a formation, not a queue.
      const offset = (Math.floor(slot / 2) + 1) * ALLY_SPACING * (slot % 2 === 0 ? -1 : 1);
      combatants.push({
        id: `ally_${slot + 1}`,
        label: translate("hud.ally", { n: slot + 1 }),
        side: "party",
        hp: party.memberHp,
        maxHp: party.memberHp,
        x: spawnX + offset,
        z: spawnZ,
        radius: 0.3,
        height: 1.6,
        speed: party.memberSpeed,
        level: 1,
      });
    }
  }

  for (const monster of graph.monsters) {
    const hp = monsterHp(rules.combat.monsterHpBase, rules.combat.monsterHpPerLevel, monster.level);
    // World units, exactly where <Monster> draws it, so the hit box sits on the body you aim at.
    const [x, z] = tileToWorld(monster.x, monster.z);
    combatants.push({
      id: monster.id,
      label: monster.kind,
      side: "hostile",
      hp,
      maxHp: hp,
      x,
      z,
      ...monsterBody(monster),
      // A higher-level monster acts sooner; the scheduler breaks ties by id.
      speed: Math.min(20, 4 + monster.level),
      level: monster.level,
    });
  }

  const actors = combatants.map((one) => ({
    id: one.id,
    side: one.side,
    speed: one.speed,
    alive: one.hp > 0,
  }));

  return {
    combatants,
    weapon: rules.weapons[0] ?? null,
    turn: beginEncounter(rules.timing?.system ?? "realtime", actors),
  };
}

/**
 * A rebuilt fight keeps what the old one did to whoever is in both: hostiles keep their wounds (the
 * fallen stay down), and the player keeps `playerHp` (null: full health, as after getting back up).
 * The turn order is set up again from who is still standing.
 */
export function carryWounds(
  built: BuiltEncounter,
  previous: readonly EncounterCombatant[],
  playerHp: number | null,
): BuiltEncounter {
  const before = new Map(previous.map((one) => [one.id, one.hp]));
  const combatants = built.combatants.map((one) => {
    if (one.id === PLAYER_ID) {
      return playerHp === null ? one : { ...one, hp: Math.max(0, Math.min(one.maxHp, playerHp)) };
    }
    if (one.side !== "hostile") return one;
    const hp = before.get(one.id);
    return hp === undefined ? one : { ...one, hp: Math.max(0, Math.min(one.maxHp, hp)) };
  });
  const actors = combatants.map((one) => ({
    id: one.id,
    side: one.side,
    speed: one.speed,
    alive: one.hp > 0,
  }));
  return { ...built, combatants, turn: beginEncounter(built.turn.system, actors) };
}

/** Camera forward for the FPS/orbit rigs, which both look along `-Z` rotated by yaw then pitch. */
export function aimDirection(yaw: number, pitch: number): { dx: number; dy: number; dz: number } {
  const flat = Math.cos(pitch);
  return { dx: -flat * Math.sin(yaw), dy: -Math.sin(pitch), dz: -flat * Math.cos(yaw) };
}

/**
 * Where a shot goes.
 *
 * In first and third person the camera *is* the weapon: you point it and you shoot down it. In a
 * side-on or top-down game the camera is a framing and the character aims where it is walking, so
 * pointing the shot at the camera's yaw would send every bullet into the background. This is the
 * seam that lets a 2D run-and-gun exist at all.
 */
export function shotDirection(
  movement: "camera" | "side" | "topdown" | "grid" | "none",
  rigYaw: number,
  rigPitch: number,
  facingYaw: number,
): { dx: number; dy: number; dz: number } {
  if (movement === "camera") return aimDirection(rigYaw, rigPitch);
  // Flat along the body's facing: no pitch, because there is nothing to aim up or down at.
  return aimDirection(facingYaw, 0);
}

/**
 * Where a shot leaves from, in the hitscan frame (y above the floor surface). A camera-aimed shot
 * starts at the first-person eye so it travels down the reticle's line, not a parallel line below
 * it; a flat shot starts at chest height.
 */
export function shotOrigin(
  movement: "camera" | "side" | "topdown" | "grid" | "none",
  capsuleCentre: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  const y =
    movement === "camera"
      ? capsuleCentre.y + FPS_EYE_HEIGHT - TILE_TOP
      : capsuleCentre.y - PLAYER_FOOT_OFFSET - TILE_TOP + FLAT_SHOT_HEIGHT;
  return { x: capsuleCentre.x, y, z: capsuleCentre.z };
}

/** The scene's walls as shot blockers, moved into the hitscan frame (y above the floor surface). */
export function shotBlockers(walls: readonly WallSpec[]): Blocker[] {
  return wallBoxes(walls).map(({ center, half }) => ({
    min: [center[0] - half[0], center[1] - half[1] - TILE_TOP, center[2] - half[2]],
    max: [center[0] + half[0], center[1] + half[1] - TILE_TOP, center[2] + half[2]],
  }));
}

/**
 * Who a computer-driven combatant shoots: the nearest foe it has a clear line of fire to, within
 * the weapon's range. Null means nobody is in sight and the turn is passed.
 */
export function chooseVictim(
  self: Combatant,
  foes: readonly Combatant[],
  weapon: WeaponSpec,
  blockers: readonly Blocker[],
): string | null {
  const planar = (foe: Combatant): number => Math.hypot(foe.x - self.x, foe.z - self.z);
  const ordered = foes
    .filter(isAlive)
    .sort((a, b) => planar(a) - planar(b) || a.id.localeCompare(b.id));
  for (const foe of ordered) {
    const ray = {
      x: self.x,
      y: self.height / 2,
      z: self.z,
      dx: foe.x - self.x,
      dy: foe.height / 2 - self.height / 2,
      dz: foe.z - self.z,
    };
    if (hitscan(ray, weapon, [foe], blockers) !== null) return foe.id;
  }
  return null;
}
