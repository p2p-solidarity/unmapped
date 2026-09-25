// Combat on the open land itself — no screen change, no second combat model. When the cartridge's
// rules declare combat, the fight is whoever is near: the authored origin's monsters plus the wild
// monsters of the 3 × 3 chunks around the player (`wildMonsters`), rebuilt as the player crosses a
// chunk. The trigger, cooldown, turns, progression and hostiles closing in are `combatLoop.ts`,
// exactly as in 3D; this only says where the walker stands and what ground a hostile may cross (the
// walker's own `canStandAt`). The shot flies the way the player faces. The fallen stay down in the
// save until they respawn (`landFelled.ts`).

import { translate } from "@renderer/i18n";
import { useEncounterStore, useEngineStore, useLandStore, useRunStore, useSessionStore } from "@renderer/state";
import { chunkOf, wildMonsters } from "@shared/chunks";
import type { TerritoryMap } from "@shared/continent";
import { FOE_TUNING } from "@shared/foes";
import type { GameplayRules } from "@shared/gameplay";
import type { MonsterKind, MonsterSpec, SceneGraph } from "@shared/world";
import { type RefObject, useCallback, useEffect, useMemo, useRef } from "react";
import { spawnPoint } from "../engine/colliders";
import {
  type CombatAim,
  type FireResult,
  fireWeapon,
  newCombatClock,
  passTurn,
  stepCombat,
} from "../engine/combat/combatLoop";
import { buildEncounter, carryWounds, PLAYER_ID, shotBlockers } from "../engine/combat/encounter";
import { shownAt } from "../engine/combat/hostiles";
import { createShove } from "../engine/combat/livePositions";
import { felledBook } from "./landFelled";
import { findPath } from "./walkTo";

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

type Stand = (x: number, z: number) => boolean;

export interface LandCombat {
  /** True while the player holds a weapon on this land. */
  armed(): boolean;
  fire(now: number): void;
  passTurn(): void;
  /** One frame of the fight; `stand` is where the walker (and so a hostile) can stand this frame. */
  step(delta: number, stand: Stand): void;
  /** The living hostiles near the player where they stand now, or null with no combat. */
  foes(): Foe[] | null;
  shot: RefObject<ShotTrace | null>;
}

export function useLandCombat(input: {
  graph: SceneGraph;
  rules: GameplayRules | null;
  seed: number;
  /** On a continent, other worlds' territory; their wild monsters are theirs to meet, not ours. */
  land?: TerritoryMap | null;
  player: RefObject<{ x: number; z: number; yaw: number }>;
  /** Monsters standing on the land beyond the origin's and the wild ones (a story chapter's). */
  extra?: readonly MonsterSpec[];
  onFelled?: (id: string) => void;
}): LandCombat {
  const { graph, rules, seed, player, extra, onFelled } = input;
  const land = input.land ?? null;
  const chunk = useEngineStore((state) => state.chunk);
  const instanceId = useLandStore((state) => state.instanceId);
  const clock = useRef(newCombatClock());
  const shot = useRef<ShotTrace | null>(null);
  const landKey = `${instanceId ?? "unsaved"}:${seed}:${graph.contract?.sceneId ?? graph.name}`;
  const book = useMemo(() => felledBook(landKey), [landKey]);
  const stand = useRef<Stand>(() => false);
  const shove = useMemo(() => createShove(), []);
  const combat = rules?.combat ?? null;
  const blockers = useMemo(() => shotBlockers(graph.walls), [graph.walls]);

  useEffect(() => {
    if (combat !== null) useRunStore.getState().begin(rules?.progression ?? []);
  }, [combat, rules]);

  // Whoever is near makes up the fight. Crossing a chunk rebuilds it; everyone's wounds carry.
  const cx = chunk?.cx ?? chunkOf(player.current.x, player.current.z).cx;
  const cz = chunk?.cz ?? chunkOf(player.current.x, player.current.z).cz;
  const hp = useRef<number | null>(null);
  // Who this land last put in the fight: only their wounds carry into the next roster, never those
  // of a place's fight that has not been torn down yet.
  const own = useRef(new Set<string>());
  const rebuild = useCallback((): void => {
    const store = useEncounterStore.getState();
    if (rules === null || rules.combat === null) {
      store.clear();
      return;
    }
    const wild: MonsterSpec[] = [];
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const near = { cx: cx + dx, cz: cz + dz };
        if ((land?.at(near) ?? null) !== null) continue;
        wild.push(...wildMonsters(seed, near, graph));
      }
    }
    const monsters = [...graph.monsters, ...(extra ?? []), ...wild].filter(
      (one) => !book.isDown(one.id),
    );
    const built = buildEncounter({ ...graph, monsters }, rules, { armedAlone: true });
    if (built === null) {
      store.clear();
      return;
    }
    const ours = store.combatants.every((one) => own.current.has(one.id));
    store.begin(carryWounds(built, ours ? store.combatants : [], hp.current));
    own.current = new Set(built.combatants.map((one) => one.id));
  }, [graph, rules, seed, cx, cz, extra, land, book]);

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

  // Getting back up after a fall ("keep looking"): at home, whole again, with a moment's guard; the
  // hostiles go back to where they stood and whoever was felled stays down.
  useEffect(
    () =>
      useRunStore.subscribe((state, previous) => {
        if (previous.outcome !== "defeated" || state.outcome !== "running") return;
        if (rules?.combat === null || rules?.combat === undefined) return;
        const [x, , z] = spawnPoint(graph);
        player.current.x = x;
        player.current.z = z;
        hp.current = null;
        clock.current.hostiles.clear();
        clock.current.guard = FOE_TUNING.reviveGuardSeconds;
        shove.drop();
        rebuild();
        useSessionStore.getState().toast("info", translate("land.revived"));
      }),
    [graph, rules, player, rebuild, shove],
  );

  useEffect(
    () => () => {
      book.flush();
      useEncounterStore.getState().clear();
    },
    [book],
  );

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
      ground: {
        stand: (x, z) => stand.current(x, z),
        route: (from, to) => findPath(from, to, stand.current),
      },
      shove: (dx, dz) => shove.push(dx, dz),
    }),
    [player, shove],
  );

  const felled = useRef(onFelled);
  felled.current = onFelled;
  const remember = useCallback((): void => {
    for (const one of useEncounterStore.getState().combatants) {
      if (one.side !== "hostile" || one.hp > 0) continue;
      if (book.fell(one.id)) felled.current?.(one.id);
    }
  }, [book]);

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
    step: (delta, standHere) => {
      if (combat === null) return;
      stand.current = standHere;
      // A blow's push plays out over a few frames, through the walker's own collision.
      const push = shove.take(delta);
      const walker = player.current;
      const trapped = !standHere(walker.x, walker.z);
      if (trapped || standHere(walker.x + push.x, walker.z)) walker.x += push.x;
      if (trapped || standHere(walker.x, walker.z + push.z)) walker.z += push.z;
      stepCombat(clock.current, aim, blockers, rules, delta);
      remember();
      if (book.tick(delta).length > 0) rebuild();
    },
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
