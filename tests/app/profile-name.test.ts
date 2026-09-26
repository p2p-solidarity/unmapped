// The player's name in the open world (rev 6 phase 3, D3 `profile`): at most one event per real
// change. Isolated because the failures are floods and near-misses E2E cannot count: a history
// that gains a `profile` on every fold, or one per open for a name that only looks different.
//
// Failure modes guarded here (each test names one):
// 1. A name the world already holds, spelled as it keeps names, gets another `profile` (every open
//    of a joined world whose join name had a double space in it).
// 2. A failed or already-written name is appended again on every fold (a loop of appends).
// 3. A key the fold names nowhere (a visitor who never joined) gets a `profile` just by opening.

import { displayNameOf, profileToWrite } from "@renderer/history";
import { describe, expect, it } from "vitest";
import { ANN, key, OWNER, VISITOR, World } from "../fixtures/history";

const none = new Set<string>();

describe("the name a world keeps", () => {
  it("writes nothing for a name the world already says (1)", () => {
    const world = new World();
    world.join(ANN, "Ann  the Tall", "2026-09-26T01:00:00.000Z");
    expect(profileToWrite(world.now, key(OWNER), displayNameOf("Mira"), none)).toBeNull();
    expect(world.now.names[key(ANN)]).toBe("Ann  the Tall");
    expect(profileToWrite(world.now, key(ANN), displayNameOf(" Ann\tthe Tall "), none)).toBeNull();
    expect(profileToWrite(world.now, key(ANN), "Ann", none)).toBe("Ann");
    expect(displayNameOf(`${"名".repeat(59)}😀`)).toHaveLength(59);
  });

  it("does not ask again for a name it already asked for in that world (2)", () => {
    const world = new World();
    const asked = new Set([`${world.id}|${key(OWNER)}|Mira K`]);
    expect(profileToWrite(world.now, key(OWNER), "Mira K", asked)).toBeNull();
    expect(profileToWrite(world.now, key(OWNER), "Mira L", asked)).toBe("Mira L");
  });

  it("writes nothing for a key the fold does not name (3)", () => {
    const world = new World();
    expect(profileToWrite(world.now, key(VISITOR), "Vic", none)).toBeNull();
  });
});
