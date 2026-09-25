// Combat on the open land itself — no screen change, no second combat model. When the cartridge's
// rules declare combat, the fight is whoever is near: the authored origin's monsters plus the wild
// monsters of the 3 × 3 chunks around the player (`wildMonsters`), rebuilt as the player crosses a
// chunk. The trigger, cooldown, turns and progression are `combatLoop.ts`, exactly as in 3D; the
// shot flies the way the player faces. A monster felled this session stays down until reload.

import { useEncounterStore, useEngineStore, useRunStore } from "@renderer/state";
import { chunkOf, wildMonsters } from "@shared/chunks";
import type { GameplayRules } from "@shared/gameplay";
import type { MonsterKind, MonsterSpec, SceneGraph } from "@shared/world";
import { type RefObject, useCallback, useEffect, useMemo, useRef } from "react";
import {
  type CombatAim,
  type FireResult,
  fireWeapon,
  newCombatClock,
  passTurn,
  stepCombat,
} from "../engine/combat/combatLoop";
import { buildEncounter, PLAYER_ID, shotBlockers } from "../engine/combat/encounter";

/** A shot's path for the renderers to draw for a moment. */
export interface ShotTrace {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** `performance.now()` when it was fired. */
  at: number;
  hit: boolean;
}

/** A hostile on the land as the renderers draw it. */
export interface Foe {
  id: string;
  kind: MonsterKind;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  level: number;
}

/** Chest height of a shot on flat ground, like the 2.5D kits. */
const SHOT_HEIGHT = 0.6;

/**
 * Who has fallen on each land this session, kept outside the component: stepping into a place and
 * back out remounts the land view, and that must not raise the dead.
 */
const FELLED = new Map<string, Set<string>>();

function felledOn(land: string): Set<string> {
  let set = FELLED.get(land);
  if (set === undefined) {
    set = new Set();
    FELLED.set(land, set);
  }
  return set;
}

export interface LandCombat {
  /** True while the player holds a weapon on this land. */
  armed(): boolean;
  fire(now: number): void;
  passTurn(): void;
  step(delta: number): void;
  /** The living hostiles near the player, or null when this cartridge has no combat. */
  foes(): Foe[] | null;
  shot: RefObject<ShotTrace | null>;
}

export function useLandCombat(input: {
  graph: SceneGraph;
  rules: GameplayRules | null;
  seed: number;
  player: RefObject<{ x: number; z: number; yaw: number }>;
  /** Monsters standing on the land beyond the origin's and the wild ones (a story chapter's). */
  extra?: readonly MonsterSpec[];
  onFelled?: (id: string) => void;
}): LandCombat {
  const { graph, rules, seed, player, extra, onFelled } = input;
  const chunk = useEngineStore((state) => state.chunk);
  const clock = useRef(newCombatClock());
  const shot = useRef<ShotTrace | null>(null);
  const defeated = useRef(felledOn(`${seed}:${graph.contract?.sceneId ?? graph.name}`));
  const combat = rules?.combat ?? null;
  const blockers = useMemo(() => shotBlockers(graph.walls), [graph.walls]);

  useEffect(() => {
    if (combat !== null) useRunStore.getState().begin(rules?.progression ?? []);
  }, [combat, rules]);

  // Whoever is near makes up the fight. Crossing a chunk rebuilds it; the player's wounds carry.
  const cx = chunk?.cx ?? chunkOf(player.current.x, player.current.z).cx;
  const cz = chunk?.cz ?? chunkOf(player.current.x, player.current.z).cz;
  const hp = useRef<number | null>(null);
  const rebuild = useCallback((): void => {
    const store = useEncounterStore.getState();
    if (rules === null || rules.combat === null) {
      store.clear();
      return;
    }
    const wild: MonsterSpec[] = [];
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        wild.push(...wildMonsters(seed, { cx: cx + dx, cz: cz + dz }, graph));
      }
    }
    const monsters = [...graph.monsters, ...(extra ?? []), ...wild].filter(
      (one) => !defeated.current.has(one.id),
    );
    const built = buildEncounter({ ...graph, monsters }, rules, { armedAlone: true });
    if (built === null) {
      store.clear();
      return;
    }
    const wounds = hp.current;
    const combatants = built.combatants.map((one) =>
      one.id === PLAYER_ID && wounds !== null ? { ...one, hp: Math.min(one.maxHp, wounds) } : one,
    );
    store.begin({ ...built, combatants });
  }, [graph, rules, seed, cx, cz, extra]);

  useEffect(rebuild, [rebuild]);

  // A place's 3D canvas tears its own fight down after the land has come back; when that clears the
  // store under the land, the land's fight is set up again rather than silently lost.
  useEffect(() => {
    let live = true;
    const stop = useEncounterStore.subscribe((state, previous) => {
      const you = state.combatants.find((one) => one.id === PLAYER_ID);
      if (you !== undefined && state.turn !== null) hp.current = you.hp;
      if (previous.turn !== null && state.turn === null && rules?.combat) {
        queueMicrotask(() => {
          if (live) rebuild();
        });
      }
    });
    return () => {
      live = false;
      stop();
    };
  }, [rebuild, rules]);

  useEffect(() => () => useEncounterStore.getState().clear(), []);

  const aim = useMemo<CombatAim>(
    () => ({
      ray: () => ({
        x: player.current.x,
        y: SHOT_HEIGHT,
        z: player.current.z,
        dx: Math.sin(player.current.yaw),
        dy: 0,
        dz: Math.cos(player.current.yaw),
      }),
      player: () => ({ x: player.current.x, z: player.current.z }),
      endless: true,
    }),
    [player],
  );

  const felled = useRef(onFelled);
  felled.current = onFelled;
  const remember = useCallback((): void => {
    for (const one of useEncounterStore.getState().combatants) {
      if (one.side !== "hostile" || one.hp > 0 || defeated.current.has(one.id)) continue;
      defeated.current.add(one.id);
      felled.current?.(one.id);
    }
  }, []);

  const trace = useCallback(
    (result: FireResult | null, now: number): void => {
      const weapon = useEncounterStore.getState().weapon;
      if (result === null || weapon === null) return;
      if (result.outcome === "wait" || result.outcome === "reload") return;
      const ray = aim.ray();
      const length = result.distance ?? weapon.range;
      shot.current = {
        x0: ray.x,
        z0: ray.z,
        x1: ray.x + ray.dx * length,
        z1: ray.z + ray.dz * length,
        at: now,
        hit: result.outcome === "hit" || result.outcome === "kill",
      };
    },
    [aim],
  );

  return {
    armed: () => useEncounterStore.getState().weapon !== null,
    fire: (now) => {
      trace(fireWeapon(clock.current, aim, blockers), now);
      remember();
    },
    passTurn: () => passTurn(clock.current),
    step: (delta) => {
      if (combat === null) return;
      stepCombat(clock.current, aim, blockers, rules, delta);
      remember();
    },
    foes: () => {
      if (combat === null) return null;
      // A monster's roster label is its kind (`buildEncounter`).
      return useEncounterStore
        .getState()
        .combatants.filter((one) => one.side === "hostile" && one.hp > 0)
        .map((one) => ({
          id: one.id,
          kind: one.label as MonsterKind,
          x: one.x,
          z: one.z,
          hp: one.hp,
          maxHp: one.maxHp,
          level: one.level,
        }));
    },
    shot,
  };
}
