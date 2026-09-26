// The land as a view of its world's history (rev 6 phase 3, WP5): `landFromHistory` draws the
// fold, and `composeProgress` / `withErrand` / `withEpisode` / `withPlace` keep the player's own
// progress (progress.json) keyed into it. Isolated because these are silent-data-loss and
// hidden-content failures that only show later, on another device or after a fog beat.
//
// Failure modes guarded here (each test names one):
// 1. An errand accepted from a witness that is no longer the chunk's live one (a legend after fog
//    and a re-witness, or a race's losing variant) is offered on the land again — or its stage is
//    dropped from progress.json when the land writes another stage.
// 2. A chunk that does not stand (fogged, or its live witness hidden) is drawn as written, so it
//    can never be witnessed again; or a fogged chunk forgets what it was called (the legend).
// 3. A hidden event is named in a view: a hidden witness as a legend, variant or live mark, a
//    hidden note in the notes.
// 4. A losing variant's programs replace the live witness, or the variant vanishes from the marks.
// 5. A chunk drawn from this device's frozen legacy files hides the shared world's live witness at
//    the same chunk, or loses its legacy-only mark.
// 6. The land's setters move the player's progress backwards: an errand stage, a cleared episode
//    or a crossed place.

import {
  composeProgress,
  landFromHistory,
  withEpisode,
  withErrand,
  withPlace,
} from "@renderer/history";
import type { ChunkStatus } from "@renderer/state/landStore";
import type { WorldProgress } from "@shared/worldProgress";
import { describe, expect, it } from "vitest";
import { ANN, BEN, day, note, OWNER, World, witness } from "../fixtures/history";

const LIVE = { home: { cx: 0, cz: 0, keepsakes: [] }, door: [null, null, null, null] };

const errandIndex = {
  errands: [{ id: "lost_key", giver: "ada", place: null, reward: "bell" }],
  keepsakes: [{ id: "bell", name: "Rusty bell" }],
};

function progressOf(world: World, errands: Record<string, "accepted" | "reached" | "done">) {
  const personal: WorldProgress = { v: 1, worldId: world.id, errands, episodes: {}, places: {} };
  return personal;
}

describe("errands keyed by witness (1)", () => {
  it("offers only the live witness's errands and keeps every stage through a re-witness", () => {
    const world = new World();
    const first = world.write(
      "witness",
      witness(5, 5, "Moor", ["ada"], [], errandIndex),
      OWNER,
      day(1),
    );
    let personal = progressOf(world, { [`${first.id}:lost_key`]: "reached" });
    let view = landFromHistory(world.now);
    expect(composeProgress(LIVE, personal, view.world).errands).toEqual({
      "5,5:lost_key": "reached",
    });

    world.beat(day(70));
    expect(world.now.chunks["5,5"]?.fogged).toBe(true);
    const again = world.write(
      "witness",
      { ...witness(5, 5, "New Moor", ["ada"], [], errandIndex), supersedes: first.id },
      OWNER,
      day(71),
    );
    view = landFromHistory(world.now);
    expect(view.world.witnessOf["5,5"]).toBe(again.id);
    // The old errand is not offered on the new place …
    expect(composeProgress(LIVE, personal, view.world).errands).toEqual({});
    // … and taking the new one leaves the old stage where it was.
    personal = withErrand(personal, view.world, "5,5:lost_key", "accepted");
    expect(personal.errands).toEqual({
      [`${first.id}:lost_key`]: "reached",
      [`${again.id}:lost_key`]: "accepted",
    });
  });

  it("never offers a losing variant's errand", () => {
    const world = new World();
    world.join(ANN, "Ann", day(0, 1));
    world.join(BEN, "Ben", day(0, 2));
    // Ann began writing before Ben's witness arrived: hers is a variant (異聞), not a refusal.
    const seen = world.now.head.n;
    const live = world.write("witness", witness(7, 7, "Ben's field"), BEN, day(1, 1));
    const lost = world.write(
      "witness",
      witness(7, 7, "Ann's field", ["ada"], [], errandIndex),
      ANN,
      day(1, 2),
      seen,
    );
    expect(world.now.chunks["7,7"]?.variants.map((one) => one.id)).toEqual([lost.id]);
    const personal = progressOf(world, { [`${lost.id}:lost_key`]: "accepted" });
    const view = landFromHistory(world.now);
    expect(view.world.witnessOf["7,7"]).toBe(live.id);
    expect(composeProgress(LIVE, personal, view.world).errands).toEqual({});
    // (4) the variant stays listed, and the live witness is what the land draws.
    expect(view.marks["7,7"]?.variants.map((one) => one.name)).toEqual(["Ann's field"]);
    expect(view.marks["7,7"]?.live?.name).toBe("Ben's field");
  });
});

describe("what the land draws (2, 3, 5)", () => {
  it("draws only standing chunks and keeps a fogged chunk's name as its legend", () => {
    const world = new World();
    world.write("witness", witness(5, 5, "Moor"), OWNER, day(1));
    world.beat(day(70));
    const view = landFromHistory(world.now);
    expect(view.chunks["5,5"]).toBeUndefined();
    expect(view.marks["5,5"]?.fogged).toBe(true);
    expect(view.marks["5,5"]?.live?.name).toBe("Moor");
    expect(view.world.witnessOf["5,5"]).toBeUndefined();
  });

  it("names a hidden witness or note nowhere", () => {
    const world = new World();
    const moor = world.write("witness", witness(5, 5, "Moor"), OWNER, day(1));
    const said = world.write("note", note([moor.id]), OWNER, day(1, 1));
    world.write("hide", { id: moor.id, hidden: true }, OWNER, day(1, 2));
    world.write("hide", { id: said.id, hidden: true }, OWNER, day(1, 3));
    const view = landFromHistory(world.now);
    expect(view.chunks["5,5"]).toBeUndefined();
    expect(view.marks["5,5"]?.live).toBeNull();
    expect(view.marks["5,5"]?.hidden).toBe(true);
    expect(view.notes.map((one) => one.id)).not.toContain(said.id);
    expect(JSON.stringify(view)).not.toContain("Moor");
    // Re-witnessed, the hidden one is not listed as its legend either.
    world.write("witness", witness(5, 5, "Heath"), OWNER, day(2));
    const after = landFromHistory(world.now);
    expect(after.marks["5,5"]?.live?.name).toBe("Heath");
    expect(after.marks["5,5"]?.legends).toEqual([]);
  });

  it("draws a legacy-only chunk from this device, but never over a shared live witness", () => {
    const world = new World();
    world.write("witness", witness(3, 3, "Shared"), OWNER, day(1));
    const local: ChunkStatus = { status: "writing" };
    const view = landFromHistory(world.now, { "3,3": local, "9,9": local });
    expect(view.chunks["3,3"]).not.toBe(local);
    expect(view.marks["3,3"]?.localCopy).toBe(true);
    expect(view.marks["3,3"]?.legacyOnly).toBe(false);
    expect(view.chunks["9,9"]).toBe(local);
    expect(view.marks["9,9"]?.legacyOnly).toBe(true);
  });
});

describe("the player's progress only moves forward (6)", () => {
  it("keeps a finished errand, a cleared episode and a crossed place", () => {
    const world = new World();
    const moor = world.write(
      "witness",
      witness(5, 5, "Moor", ["ada"], [], errandIndex),
      OWNER,
      day(1),
    );
    const view = landFromHistory(world.now);
    let personal = progressOf(world, { [`${moor.id}:lost_key`]: "done" });
    personal = withErrand(personal, view.world, "5,5:lost_key", "accepted");
    expect(personal.errands[`${moor.id}:lost_key`]).toBe("done");
    personal = withEpisode(personal, "e1", { cleared: true, summary: "Met Ada." });
    personal = withEpisode(personal, "e1", { cleared: false });
    expect(personal.episodes.e1).toMatchObject({ cleared: true, summary: "Met Ada." });
    personal = withPlace(personal, "p1", { cleared: true });
    personal = withPlace(personal, "p1", { cleared: false, playId: "p-0123456789abcdef" });
    expect(personal.places.p1).toEqual({ cleared: true, playId: "p-0123456789abcdef" });
  });
});
