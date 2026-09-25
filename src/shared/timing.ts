// Turn scheduling (`turn_scheduler@1`). Pure, deterministic, no React and no Three.js, so the
// ordering rules can be unit-tested and so main can validate a cartridge's timing without a canvas.
//
// One scheduler covers five policies because they are the same machine with a different ordering
// rule. That is also what makes plan.md §4's `change_timing` ("把 turn bar 改成左輪制度") a data
// change rather than new code: the mod swaps `system`, not the engine.

export const TIMING_SYSTEMS = [
  "realtime",
  "real_time_with_pause",
  "tick",
  "turn_based",
  "turn_bar",
  "initiative",
  "phase_based",
  "revolver",
] as const;
export type TimingSystemId = (typeof TIMING_SYSTEMS)[number];

/** Who a single turn belongs to — the other half of plan.md §4's `change_timing`. */
export const TURN_RESOLUTIONS = [
  "shared_team",
  "per_player",
  "initiative",
  "simultaneous",
] as const;
export type TurnResolution = (typeof TURN_RESOLUTIONS)[number];

export const TURN_SIDES = ["party", "hostile"] as const;
export type TurnSide = (typeof TURN_SIDES)[number];

export interface TurnActor {
  id: string;
  side: TurnSide;
  /** Fills the action bar and breaks ties in initiative order. Clamped to 1..20 by the DSL. */
  speed: number;
  alive: boolean;
}

/**
 * `planning` lets the active actor aim and commit; `resolving` plays the committed actions out.
 * Only `phase_based` uses both for the whole party at once — the other policies resolve per actor.
 */
export type TurnPhase = "planning" | "resolving";

export interface TurnState {
  system: TimingSystemId;
  round: number;
  phase: TurnPhase;
  /** Actor ids in the order they act this round. Empty in realtime. */
  order: string[];
  /** Position in `order`; equals `order.length` when the round is spent. */
  index: number;
  /** Action-bar fill per actor id, 0..BAR_FULL. Only `turn_bar` fills these. */
  bars: Record<string, number>;
}

/** An action bar is "full" at this value; `chargeBars` adds `speed × seconds`. */
export const BAR_FULL = 100;

function living(actors: readonly TurnActor[]): TurnActor[] {
  return actors.filter((actor) => actor.alive);
}

/** Deterministic tie-break so the same encounter always plays out the same way. */
function bySpeedThenId(a: TurnActor, b: TurnActor): number {
  return b.speed - a.speed || a.id.localeCompare(b.id);
}

/** Party, then hostiles; stable inside each side. */
function bySideThenId(a: TurnActor, b: TurnActor): number {
  if (a.side !== b.side) return a.side === "party" ? -1 : 1;
  return a.id.localeCompare(b.id);
}

/** Strict alternation: party, hostile, party, hostile… with the longer side's leftovers appended. */
function alternating(actors: readonly TurnActor[]): string[] {
  const party = living(actors)
    .filter((actor) => actor.side === "party")
    .sort(bySideThenId);
  const hostile = living(actors)
    .filter((actor) => actor.side === "hostile")
    .sort(bySideThenId);
  const order: string[] = [];
  for (let slot = 0; slot < Math.max(party.length, hostile.length); slot += 1) {
    const next = party[slot];
    const foe = hostile[slot];
    if (next !== undefined) order.push(next.id);
    if (foe !== undefined) order.push(foe.id);
  }
  return order;
}

/** True for the systems that never hand out a turn: the world simply runs. */
export function isContinuous(system: TimingSystemId): boolean {
  return system === "realtime" || system === "real_time_with_pause";
}

export function roundOrder(system: TimingSystemId, actors: readonly TurnActor[]): string[] {
  switch (system) {
    case "realtime":
    case "real_time_with_pause":
      return [];
    // A tick round is the same order every time; the clock, not the player, advances it.
    case "tick":
      return living(actors)
        .sort(bySpeedThenId)
        .map((actor) => actor.id);
    case "turn_based":
      return living(actors)
        .sort(bySideThenId)
        .map((actor) => actor.id);
    case "initiative":
    case "phase_based":
      return living(actors)
        .sort(bySpeedThenId)
        .map((actor) => actor.id);
    case "revolver":
      return alternating(actors);
    // A bar round starts empty: `chargeBars` decides who acts, in the order their bars fill.
    case "turn_bar":
      return [];
  }
}

export function beginEncounter(system: TimingSystemId, actors: readonly TurnActor[]): TurnState {
  return {
    system,
    round: 1,
    // Everyone plans first in phase_based; every other policy plans one actor at a time.
    phase: "planning",
    order: roundOrder(system, actors),
    index: 0,
    bars: Object.fromEntries(living(actors).map((actor) => [actor.id, 0])),
  };
}

/** Whose turn it is, or null while the world runs continuously, a bar fills, or a round is spent. */
export function activeActor(state: TurnState): string | null {
  if (isContinuous(state.system)) return null;
  return state.order[state.index] ?? null;
}

/** True when every actor in this round has acted and the round must roll over. */
export function roundSpent(state: TurnState): boolean {
  return !isContinuous(state.system) && state.index >= state.order.length;
}

/**
 * Fills action bars by `speed × seconds` and promotes every actor that reached BAR_FULL into the
 * round order, spent bar reset. Only `turn_bar` uses it; other policies pass through unchanged.
 */
export function chargeBars(
  state: TurnState,
  actors: readonly TurnActor[],
  seconds: number,
): TurnState {
  if (state.system !== "turn_bar" || seconds <= 0) return state;
  const bars = { ...state.bars };
  const ready: TurnActor[] = [];
  for (const actor of living(actors)) {
    const filled = (bars[actor.id] ?? 0) + actor.speed * seconds;
    if (filled >= BAR_FULL) {
      bars[actor.id] = filled - BAR_FULL;
      ready.push(actor);
    } else {
      bars[actor.id] = filled;
    }
  }
  if (ready.length === 0) return { ...state, bars };
  return {
    ...state,
    bars,
    order: [...state.order, ...ready.sort(bySpeedThenId).map((actor) => actor.id)],
  };
}

/**
 * The active actor has committed. In `phase_based` the whole party commits before anything
 * resolves, so this only moves the cursor; everywhere else it flips straight to resolving.
 */
export function commit(state: TurnState): TurnState {
  if (isContinuous(state.system) || activeActor(state) === null) return state;
  if (state.system !== "phase_based") return { ...state, phase: "resolving" };
  const index = state.index + 1;
  return index >= state.order.length
    ? { ...state, index, phase: "resolving" }
    : { ...state, index };
}

/**
 * The committed action(s) finished playing out. Moves to the next actor, or starts a new round
 * when this one is spent. Dead actors are dropped from the next round's order.
 */
export function advance(state: TurnState, actors: readonly TurnActor[]): TurnState {
  if (isContinuous(state.system)) return state;

  // phase_based resolves the whole round at once, so resolving always ends the round.
  const index = state.system === "phase_based" ? state.order.length : state.index + 1;
  const spent = index >= state.order.length;
  if (!spent) return { ...state, index, phase: "planning" };

  return {
    ...state,
    round: state.round + 1,
    phase: "planning",
    order: roundOrder(state.system, actors),
    index: 0,
  };
}

/** Drops an actor that died mid-round so the rest of the round skips it. */
export function removeActor(state: TurnState, actorId: string): TurnState {
  const cut = state.order.indexOf(actorId);
  if (cut < 0) return state;
  const bars = { ...state.bars };
  delete bars[actorId];
  return {
    ...state,
    order: state.order.filter((id) => id !== actorId),
    index: cut < state.index ? state.index - 1 : state.index,
    bars,
  };
}
