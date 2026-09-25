// The fight inside a place, through the one combat model (`combatLoop.ts`) exactly as the 3D place
// drove it (CombatControl): the place's own monsters are the roster, the run follows the rules, and
// getting back up after a fall restores the player with a moment's guard while the felled stay down.
// This hook only feeds the loop an aim (the view's line of fire and where the body stands), the
// ground a hostile may cross, and the frame clock. It decides no hit and no damage.

import { useEncounterStore, useRunStore } from "@renderer/state";
import type { Ray } from "@shared/combat";
import { FOE_TUNING } from "@shared/foes";
import type { GameplayRules } from "@shared/gameplay";
import type { MonsterKind, SceneGraph } from "@shared/world";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import {
  type CombatAim,
  type FireResult,
  fireWeapon,
  newCombatClock,
  passTurn,
  stepCombat,
} from "../../engine/combat/combatLoop";
import {
  buildEncounter,
  carryWounds,
  PLAYER_ID,
  shotBlockers,
} from "../../engine/combat/encounter";
import { type HostileGround, shownAt } from "../../engine/combat/hostiles";
import { carriedPlayerHp, carryPlayerHp } from "../../engine/combat/playerWounds";
import { BODY_RADIUS, type SideCourse } from "./placeMotion";

/** A shot's path in the scene's frame (x/z on the floor, y above it), drawn for a moment. */
export interface PlaceShot {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  /** `performance.now()` when it was fired. */
  at: number;
  hit: boolean;
}

/** A living hostile where it stands this instant, as the views draw it. */
export interface PlaceFoe {
  id: string;
  kind: MonsterKind;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  level: number;
}

/** What the view says about the player each frame. */
export interface PlaceAim {
  /** The line of fire this instant: along the body's facing, at chest height. */
  ray(): Ray;
  /** Where hostiles see the player stand (the XZ plane). */
  player(): { x: number; z: number };
  /** Pushes the body back by (dx, dz) tiles through its own collision; absent: a blow never moves it. */
  shove?(dx: number, dz: number): void;
}

export interface PlaceCombat {
  /** True while the player holds a weapon in this place. */
  armed(): boolean;
  fire(now: number): void;
  passTurn(): void;
  step(delta: number): void;
  /** Living hostiles where they stand now, or null when the rules have no combat. */
  foes(): PlaceFoe[] | null;
  shot: RefObject<PlaceShot | null>;
}

/**
 * Hostile ground along a course's walking row: they walk the row itself (never around a ledge in a
 * depth the side view cannot show), inside the course, and never through a wall — they cannot hop.
 */
export function rowGround(course: SideCourse): HostileGround {
  return {
    stand: (x, z) =>
      Math.abs(z - course.z) < 1e-3 &&
      x >= course.minX + BODY_RADIUS &&
      x <= course.maxX - BODY_RADIUS &&
      !course.blocks.some((one) => x + BODY_RADIUS > one.x0 && x - BODY_RADIUS < one.x1),
  };
}

export function usePlaceCombat(input: {
  graph: SceneGraph;
  rules: GameplayRules | null;
  /** Stable for the view's life: its functions read the body's refs. */
  aim: PlaceAim;
  ground: HostileGround;
  /** The player got back up after a fall ("keep looking"); the view puts the body back. */
  onRevive(): void;
}): PlaceCombat {
  const { graph, rules } = input;
  const clock = useRef(newCombatClock());
  const shot = useRef<PlaceShot | null>(null);
  const aimRef = useRef(input.aim);
  aimRef.current = input.aim;
  const groundRef = useRef(input.ground);
  groundRef.current = input.ground;
  const reviveRef = useRef(input.onRevive);
  reviveRef.current = input.onRevive;
  const blockers = useMemo(() => shotBlockers(graph.walls), [graph.walls]);
  const combat = rules?.combat ?? null;

  // The run follows the rules, not the scene (CombatControl): a new place is not a new run.
  useEffect(() => {
    useRunStore.getState().begin(rules?.progression ?? []);
  }, [rules]);

  // A place is its own fight: its monsters, whole, every time it is entered — but the player walks
  // in with the wounds they carried from the land, and walks out with the ones taken here.
  useEffect(() => {
    clock.current.hostiles.clear();
    clock.current.guard = 0;
    const store = useEncounterStore.getState();
    const built = buildEncounter(graph, rules);
    if (built === null) {
      store.clear();
      return;
    }
    store.begin(carryWounds(built, [], carriedPlayerHp()));
    const stop = useEncounterStore.subscribe((state) => {
      const you = state.combatants.find((one) => one.id === PLAYER_ID);
      if (you !== undefined && state.turn !== null) carryPlayerHp(you.hp);
    });
    return () => {
      stop();
      useEncounterStore.getState().clear();
    };
  }, [graph, rules]);

  // Getting back up: whole again with a moment's guard, the hostiles back where they stood.
  useEffect(
    () =>
      useRunStore.subscribe((state, previous) => {
        if (previous.outcome !== "defeated" || state.outcome !== "running") return;
        const built = buildEncounter(graph, rules);
        if (built === null) return;
        clock.current.hostiles.clear();
        clock.current.guard = FOE_TUNING.reviveGuardSeconds;
        carryPlayerHp(null);
        const store = useEncounterStore.getState();
        store.begin(carryWounds(built, store.combatants, null));
        reviveRef.current();
      }),
    [graph, rules],
  );

  const aim = useMemo<CombatAim>(
    () => ({
      ray: () => aimRef.current.ray(),
      player: () => aimRef.current.player(),
      ground: {
        stand: (x, z) => groundRef.current.stand(x, z),
        route: (from, to) => groundRef.current.route?.(from, to) ?? null,
      },
      shove: (dx, dz) => aimRef.current.shove?.(dx, dz),
    }),
    [],
  );

  const trace = (result: FireResult | null, now: number): void => {
    const weapon = useEncounterStore.getState().weapon;
    if (result === null || weapon === null) return;
    if (result.outcome === "wait" || result.outcome === "reload") return;
    const ray = aim.ray();
    const length = result.distance ?? weapon.range;
    shot.current = {
      x0: ray.x,
      y0: ray.y,
      z0: ray.z,
      x1: ray.x + ray.dx * length,
      y1: ray.y + ray.dy * length,
      z1: ray.z + ray.dz * length,
      at: now,
      hit: result.outcome === "hit" || result.outcome === "kill",
    };
  };

  return {
    armed: () => useEncounterStore.getState().weapon !== null,
    fire: (now) => trace(fireWeapon(clock.current, aim, blockers), now),
    passTurn: () => passTurn(clock.current),
    step: (delta) => stepCombat(clock.current, aim, blockers, rules, delta),
    foes: () => {
      if (combat === null) return null;
      // A monster's roster label is its kind (`buildEncounter`); it is drawn where it walked to.
      return useEncounterStore
        .getState()
        .combatants.filter((one) => one.side === "hostile" && one.hp > 0)
        .map((one) => {
          const live = clock.current.hostiles.get(one.id);
          const at = live === undefined ? one : shownAt(live);
          return {
            id: one.id,
            kind: one.label as MonsterKind,
            x: at.x,
            z: at.z,
            hp: one.hp,
            maxHp: one.maxHp,
            level: one.level,
          };
        });
    },
    shot,
  };
}
