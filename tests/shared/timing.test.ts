import {
  activeActor,
  advance,
  BAR_FULL,
  beginEncounter,
  chargeBars,
  commit,
  removeActor,
  roundOrder,
  type TurnActor,
} from "@shared/timing";
import { describe, expect, it } from "vitest";

const SQUAD: TurnActor[] = [
  { id: "player", side: "party", speed: 10, alive: true },
  { id: "ally", side: "party", speed: 6, alive: true },
  { id: "drone", side: "hostile", speed: 14, alive: true },
  { id: "golem", side: "hostile", speed: 4, alive: true },
];

/** Plays a whole round, returning the ids in the order they actually got the turn. */
function playRound(system: Parameters<typeof beginEncounter>[0]): string[] {
  let state = beginEncounter(system, SQUAD);
  const acted: string[] = [];
  for (let guard = 0; guard < 20; guard += 1) {
    const actor = activeActor(state);
    if (actor === null) break;
    acted.push(actor);
    const before = state.round;
    state = advance(commit(state), SQUAD);
    if (state.round !== before) break;
  }
  return acted;
}

describe("round order", () => {
  it("skips the dead", () => {
    const fallen = SQUAD.map((actor) =>
      actor.id === "drone" ? { ...actor, alive: false } : actor,
    );
    expect(roundOrder("turn_based", fallen)).not.toContain("drone");
  });
});

describe("turn loop", () => {
  it("gives every living actor exactly one turn per round", () => {
    for (const system of ["turn_based", "initiative", "revolver"] as const) {
      expect([...playRound(system)].sort()).toEqual(["ally", "drone", "golem", "player"]);
    }
  });

  it("rolls into a fresh round once the order is spent", () => {
    let state = beginEncounter("turn_based", SQUAD);
    for (let turn = 0; turn < SQUAD.length; turn += 1) state = advance(commit(state), SQUAD);
    expect(state.round).toBe(2);
    expect(state.index).toBe(0);
    expect(activeActor(state)).toBe("ally");
  });
});

describe("phase_based", () => {
  it("lets the whole squad commit before anything resolves", () => {
    let state = beginEncounter("phase_based", SQUAD);
    expect(state.phase).toBe("planning");
    // Three of four have committed: still planning.
    state = commit(commit(commit(state)));
    expect(state.phase).toBe("planning");
    expect(activeActor(state)).toBe("golem");
    // The last commit flips the whole round to resolution.
    state = commit(state);
    expect(state.phase).toBe("resolving");
    // Resolving the round ends it; it does not hand the turn back to one actor.
    state = advance(state, SQUAD);
    expect(state.round).toBe(2);
    expect(state.phase).toBe("planning");
  });
});

describe("turn_bar", () => {
  it("carries the overflow so a fast actor keeps its lead", () => {
    const state = chargeBars(beginEncounter("turn_bar", SQUAD), SQUAD, BAR_FULL / 10);
    // player crossed exactly; drone crossed earlier and keeps the remainder.
    expect(state.bars.drone).toBeGreaterThan(0);
    expect(state.order).toEqual(["drone", "player"]);
  });
});

describe("removeActor", () => {
  it("drops a casualty from the rest of the round without skipping the next actor", () => {
    const state = beginEncounter("turn_based", SQUAD); // ally, player, drone, golem
    const afterFirst = advance(commit(state), SQUAD); // active: player
    expect(activeActor(afterFirst)).toBe("player");
    const dropped = removeActor(afterFirst, "drone");
    expect(dropped.order).toEqual(["ally", "player", "golem"]);
    expect(activeActor(dropped)).toBe("player");
  });

  it("keeps the cursor on the right actor when the casualty was earlier in the round", () => {
    const state = beginEncounter("turn_based", SQUAD);
    const third = advance(commit(advance(commit(state), SQUAD)), SQUAD); // active: drone
    expect(activeActor(third)).toBe("drone");
    const dropped = removeActor(third, "ally");
    expect(activeActor(dropped)).toBe("drone");
  });
});
