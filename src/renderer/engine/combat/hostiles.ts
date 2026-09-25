// Real-time hostiles (`shooter_combat@1` when the timing system is continuous): each notices the
// player, closes in over ground the player could stand on too, stops at arm's length, draws back,
// strikes, recovers, and walks home once the player has led it past its leash.
//
// Pure — no store, no renderer, no clock of its own. `combatLoop.ts` owns the one mutable map of
// these states (in the caller's ref, Rule 4), resolves the blows this returns, and the land and 3D
// controllers only say where things can stand. The invariant test drives this same code.

import { FOE_TUNING, foeSpeed } from "@shared/foes";

export interface Point {
  x: number;
  z: number;
}

export type HostileMode = "idle" | "chase" | "windup" | "recover" | "return";

export interface HostileState {
  /** Where it stands when calm: the roster position it was placed at. */
  home: Point;
  x: number;
  z: number;
  mode: HostileMode;
  /** Seconds left of the wind-up or the recovery. */
  timer: number;
  /** Seconds the current walk has been held up by the ground. */
  stuck: number;
  /** Waypoints around whatever blocks the straight line, and seconds until it may be re-planned. */
  route: Point[] | null;
  replan: number;
  /** Unit direction of the blow being wound up or just thrown. */
  aimX: number;
  aimZ: number;
}

/** Where hostiles may stand, and optionally how to route around what is in the way. */
export interface HostileGround {
  stand(x: number, z: number): boolean;
  route?(from: Point, to: Point): Point[] | null;
}

/** A living hostile as the roster knows it (position = its home). */
export interface RosterHostile {
  id: string;
  x: number;
  z: number;
  radius: number;
  level: number;
}

export function newHostile(x: number, z: number): HostileState {
  return {
    home: { x, z },
    x,
    z,
    mode: "idle",
    timer: 0,
    stuck: 0,
    route: null,
    replan: 0,
    aimX: 0,
    aimZ: 1,
  };
}

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.z - b.z);
const ARRIVE = 0.15;
const HOME = 0.06;
/** A step that covers less than this share of what it asked for counts as held up. */
const HEADWAY = 0.3;

type Move = "moved" | "ground" | "crowd";

function tryMove(
  self: HostileState,
  x: number,
  z: number,
  ground: HostileGround,
  others: readonly Point[],
): Move {
  // Something standing inside a collider (a prop that appeared under it) may always walk out.
  if (ground.stand(self.x, self.z) && !ground.stand(x, z)) return "ground";
  for (const other of others) {
    const after = Math.hypot(other.x - x, other.z - z);
    if (after < FOE_TUNING.spacing && after < Math.hypot(other.x - self.x, other.z - self.z)) {
      return "crowd";
    }
  }
  self.x = x;
  self.z = z;
  return "moved";
}

/** One step toward `target`, sliding along whatever refuses the straight line. */
function stepToward(
  self: HostileState,
  target: Point,
  length: number,
  ground: HostileGround,
  others: readonly Point[],
): { moved: number; blocked: boolean } {
  const dx = target.x - self.x;
  const dz = target.z - self.z;
  const span = Math.hypot(dx, dz);
  if (span < 1e-6 || length <= 0) return { moved: 0, blocked: false };
  const step = Math.min(length, span);
  const ux = (dx / span) * step;
  const uz = (dz / span) * step;
  const before = { x: self.x, z: self.z };
  const straight = tryMove(self, self.x + ux, self.z + uz, ground, others);
  let blocked = straight === "ground";
  if (straight !== "moved") {
    const alongX = ux === 0 ? "moved" : tryMove(self, self.x + ux, self.z, ground, others);
    const alongZ = uz === 0 ? "moved" : tryMove(self, self.x, self.z + uz, ground, others);
    blocked = blocked || alongX === "ground" || alongZ === "ground";
  }
  return { moved: distance(before, self), blocked };
}

/** Walks toward `goal` until within `stopAt`, planning a route when the straight line is held up. */
function walk(
  self: HostileState,
  goal: Point,
  stopAt: number,
  speed: number,
  delta: number,
  ground: HostileGround,
  others: readonly Point[],
): void {
  self.replan = Math.max(0, self.replan - delta);
  const left = distance(self, goal) - stopAt;
  if (left <= 0) {
    self.stuck = 0;
    self.route = null;
    return;
  }
  let target = goal;
  if (self.route !== null) {
    while (self.route.length > 0 && distance(self, self.route[0] as Point) < ARRIVE) {
      self.route.shift();
    }
    const next = self.route[0];
    if (next === undefined) self.route = null;
    else target = next;
  }
  const want = Math.min(speed * delta, target === goal ? left : speed * delta);
  const { moved, blocked } = stepToward(self, target, want, ground, others);
  if (moved >= want * HEADWAY || !blocked) {
    self.stuck = Math.max(0, self.stuck - delta);
    // A planned route goes stale as the player moves; plan it again now and then.
    if (self.route !== null && self.replan <= 0 && ground.route !== undefined) {
      self.route = ground.route(self, goal);
      self.replan = FOE_TUNING.replanSeconds;
    }
    return;
  }
  self.stuck += delta;
  if (self.replan <= 0 && ground.route !== undefined) {
    self.route = ground.route(self, goal);
    self.replan = FOE_TUNING.replanSeconds;
  }
}

function goHome(self: HostileState): void {
  self.mode = "return";
  self.route = null;
  self.stuck = 0;
}

/**
 * Advances one hostile by `delta` seconds. True when a blow lands on the player this frame (the
 * caller applies it, so guard windows and damage stay in one place). With no ground to stand on it
 * holds its spot and still swings at whoever comes within reach.
 */
export function stepHostile(
  self: HostileState,
  input: {
    player: Point;
    level: number;
    /** Its body radius; reach is measured from the edge of it. */
    radius: number;
    delta: number;
    ground: HostileGround | null;
    /** Where the other hostiles stand, so a pack keeps apart. */
    others: readonly Point[];
  },
): boolean {
  const { player, delta, ground, others } = input;
  const reach = FOE_TUNING.reach + input.radius;
  const gap = distance(self, player);
  const led = distance(self.home, player) > FOE_TUNING.leashRadius;
  const strayed = distance(self, self.home) > FOE_TUNING.leashRadius + 2;
  const speed = foeSpeed(input.level);
  switch (self.mode) {
    case "idle":
      if (gap <= FOE_TUNING.aggroRadius && !led) {
        self.mode = "chase";
        self.stuck = 0;
      }
      return false;
    case "chase":
      if (led || strayed || self.stuck > FOE_TUNING.giveUpSeconds) {
        goHome(self);
        return false;
      }
      if (gap <= reach) {
        self.mode = "windup";
        self.timer = FOE_TUNING.windUpSeconds;
        self.aimX = gap > 1e-6 ? (player.x - self.x) / gap : 0;
        self.aimZ = gap > 1e-6 ? (player.z - self.z) / gap : 1;
        return false;
      }
      if (ground !== null) walk(self, player, reach * 0.9, speed, delta, ground, others);
      return false;
    case "windup":
      self.timer -= delta;
      if (self.timer > 0) return false;
      self.mode = "recover";
      self.timer = FOE_TUNING.recoverSeconds;
      return gap <= reach + FOE_TUNING.reachSlack;
    case "recover":
      self.timer -= delta;
      if (self.timer <= 0) self.mode = "chase";
      return false;
    case "return": {
      if (ground !== null) {
        walk(self, self.home, 0, speed * FOE_TUNING.returnFactor, delta, ground, others);
      }
      // Wedged on the way back: it slips home rather than standing lost in the field.
      if (
        ground === null ||
        distance(self, self.home) <= HOME ||
        self.stuck > FOE_TUNING.giveUpSeconds
      ) {
        self.x = self.home.x;
        self.z = self.home.z;
        self.mode = "idle";
        self.route = null;
        self.stuck = 0;
      }
      return false;
    }
  }
}

/**
 * Keeps `states` in step with the fight's living hostiles: newcomers stand where the roster put
 * them, the fallen and the departed are forgotten, everyone else keeps where they walked to.
 */
export function syncHostiles(
  states: Map<string, HostileState>,
  roster: readonly RosterHostile[],
): void {
  const living = new Set(roster.map((one) => one.id));
  for (const id of states.keys()) if (!living.has(id)) states.delete(id);
  for (const one of roster) {
    if (!states.has(one.id)) states.set(one.id, newHostile(one.x, one.z));
  }
}

/**
 * Steps every living hostile once; returns the ids whose blow lands this frame, in roster order.
 * `stop` is asked after each blow so a fallen player ends the frame.
 */
export function stepHostiles(
  states: Map<string, HostileState>,
  roster: readonly RosterHostile[],
  input: { player: Point; delta: number; ground: HostileGround | null },
  onBlow: (id: string, from: Point) => boolean,
): void {
  syncHostiles(states, roster);
  const standing = roster
    .map((one) => ({ one, self: states.get(one.id) }))
    .filter((pair): pair is { one: RosterHostile; self: HostileState } => pair.self !== undefined);
  for (const { one, self } of standing) {
    const others = standing.filter((pair) => pair.self !== self).map((pair) => pair.self);
    const blow = stepHostile(self, {
      player: input.player,
      level: one.level,
      radius: one.radius,
      delta: input.delta,
      ground: input.ground,
      others,
    });
    if (blow && onBlow(one.id, { x: self.x, z: self.z })) return;
  }
}

/** Where to draw a hostile: its spot, drawn back while winding up and thrown forward as it hits. */
export function shownAt(self: HostileState): Point {
  if (self.mode === "windup") {
    const drawn = FOE_TUNING.drawBack * (1 - Math.max(0, self.timer) / FOE_TUNING.windUpSeconds);
    return { x: self.x - self.aimX * drawn, z: self.z - self.aimZ * drawn };
  }
  if (self.mode === "recover") {
    const since = FOE_TUNING.recoverSeconds - self.timer;
    if (since < FOE_TUNING.lungeSeconds) {
      const thrown = FOE_TUNING.lunge * (1 - since / FOE_TUNING.lungeSeconds);
      return { x: self.x + self.aimX * thrown, z: self.z + self.aimZ * thrown };
    }
  }
  return { x: self.x, z: self.z };
}
