// Traces on the land (rev 6 phase 3, D3, D15): who gets a gift two people took at once, and which
// telling a note belongs to. Isolated because both are silent data loss or duplication that only
// shows on another machine, after a receipt, or after a reopen — arrival order across many seeds
// is not something an E2E run can sweep.
//
// Failure modes guarded here (each test names one):
// 1. A gift race lost on this client adds the item anyway: someone else's take was sequenced
//    first (whatever order the two takes reached the sequencer in), or this client's own take was
//    still waiting in its outbox when the other's receipt arrived.
// 2. A take still waiting for its receipt puts the item in the bag: it may yet lose, and the
//    loser's bag must stay as it was.
// 3. A received gift handed out twice: after a re-fold, a reopened save, or another read of the
//    same entries (the save's flag must stop it), or under an item id that differs between folds.
// 4. A refusal for another reason (a quota) told as "someone took it first", so the player never
//    learns why; or a take refused because the gift was gone told as a failure.
// 5. A note left on a losing variant (異聞) counted as a note of the standing telling, or dropped
//    from the variant: a child of a variant stays with its parent and is marked as one.
// 6. A gift the owner hid received into the bag (its item is another player's words).

import { landFromHistory } from "@renderer/history";
import type { GiftBody } from "@shared/history/types";
import type { RefusedEvent } from "@shared/worldApi";
import { describe, expect, it } from "vitest";
import {
  giftItemId,
  giftOutcome,
  giftsToReceive,
  noteStanding,
  receivedFlag,
  receivedItem,
  tellingsOf,
} from "../../src/renderer/app/land/traces";
import { emptyNow, foldEntries, withPending } from "../../src/shared/history/fold";
import {
  ANN,
  BEN,
  day,
  ITEM,
  key,
  note,
  OWNER,
  pending,
  prng,
  TILE,
  World,
  witness,
} from "../fixtures/history";

const GIFT: GiftBody = { coord: TILE(2, 2), item: ITEM, for: null, words: "for the road" };

/** A world with Ann and Ben as members and one gift the owner left for anyone. */
function giftWorld() {
  const world = new World();
  world.join(ANN, "Ann", day(0, 1));
  world.join(BEN, "Ben", day(0, 2));
  const gift = world.write("gift", GIFT, OWNER, day(1));
  return { world, gift };
}

function refusal(id: string, code: string): RefusedEvent {
  return {
    event: { id, kind: "gift.take" },
    error: { code, message: "refused" },
    at: day(1, 9),
  };
}

describe("a gift two people take at once (1, 2)", () => {
  it("gives it to whoever was sequenced first, over many arrival orders", () => {
    const random = prng(7);
    for (let seed = 0; seed < 64; seed += 1) {
      const { world, gift } = giftWorld();
      const seen = world.now.head.n;
      const takes = [
        { who: ANN, event: world.event("gift.take", { gift: gift.id }, ANN, seen) },
        { who: BEN, event: world.event("gift.take", { gift: gift.id }, BEN, seen) },
      ];
      if (random() < 0.5) takes.reverse();
      for (const [index, take] of takes.entries()) world.append(take.event, day(2, index));
      const [first, second] = takes;
      if (first === undefined || second === undefined) throw new Error("two takes");
      const winner = key(first.who);
      const loser = key(second.who);
      expect(giftOutcome(world.now, [], gift.id, first.event.id, winner)).toEqual({ kind: "mine" });
      expect(giftOutcome(world.now, [], gift.id, second.event.id, loser)).toEqual({ kind: "lost" });
      expect(giftsToReceive(world.now, winner, {}).map((one) => one.id)).toEqual([gift.id]);
      expect(giftsToReceive(world.now, loser, {})).toEqual([]);
    }
  });

  it("never gives it to a take still in the outbox, even while this client's fold shows it", () => {
    const { world, gift } = giftWorld();
    const mine = world.event("gift.take", { gift: gift.id }, ANN);
    const overlay = withPending(world.now, [pending(mine)], day(2));
    expect(overlay.gifts[gift.id]?.taken).toEqual({ by: key(ANN), id: mine.id, pending: true });
    expect(giftOutcome(world.now, [], gift.id, mine.id, key(ANN))).toEqual({ kind: "waiting" });
    expect(giftsToReceive(overlay, key(ANN), {})).toEqual([]);
    expect(giftsToReceive(world.now, key(ANN), {})).toEqual([]);
  });

  it("leaves the waiting take with nothing once someone else's receipt comes first", () => {
    const { world, gift } = giftWorld();
    const mine = world.event("gift.take", { gift: gift.id }, ANN);
    world.write("gift.take", { gift: gift.id }, BEN, day(2));
    const overlay = withPending(world.now, [pending(mine)], day(2, 1));
    expect(overlay.gifts[gift.id]?.taken?.by).toBe(key(BEN));
    expect(giftOutcome(world.now, [], gift.id, mine.id, key(ANN))).toEqual({ kind: "lost" });
    expect(giftsToReceive(overlay, key(ANN), {})).toEqual([]);
  });
});

describe("a gift received once (3, 6)", () => {
  it("hands a received gift out once, under the same item id on every fold", () => {
    const { world, gift } = giftWorld();
    world.write("gift.take", { gift: gift.id }, ANN, day(2));
    const refolded = foldEntries(emptyNow(world.genesis), world.verdictEntries());
    const items = [world.now, refolded].map((now) =>
      giftsToReceive(now, key(ANN), undefined).map(receivedItem),
    );
    expect(items[0]).toEqual([{ ...ITEM, id: giftItemId(gift.id) }]);
    expect(items[1]).toEqual(items[0]);
    expect(giftItemId(gift.id).startsWith("gift-")).toBe(true);
    const flags = { [receivedFlag(gift.id)]: true };
    expect(giftsToReceive(world.now, key(ANN), flags)).toEqual([]);
    expect(giftsToReceive(refolded, key(ANN), flags)).toEqual([]);
  });

  it("never hands out a gift the owner hid", () => {
    const { world, gift } = giftWorld();
    world.write("gift.take", { gift: gift.id }, ANN, day(2));
    world.write("hide", { id: gift.id, hidden: true }, OWNER, day(2, 1));
    expect(giftsToReceive(world.now, key(ANN), {})).toEqual([]);
  });
});

describe("what a refused take says (4)", () => {
  it("tells a lost race as lost and any other refusal with its own reason", () => {
    const { world, gift } = giftWorld();
    const mine = world.event("gift.take", { gift: gift.id }, ANN);
    expect(
      giftOutcome(world.now, [refusal(mine.id, "gift-taken")], gift.id, mine.id, key(ANN)),
    ).toEqual({ kind: "lost" });
    const quota = refusal(mine.id, "quota-member-day");
    expect(giftOutcome(world.now, [quota], gift.id, mine.id, key(ANN))).toEqual({
      kind: "refused",
      error: quota.error,
    });
  });
});

describe("notes on the tellings of a chunk (5)", () => {
  it("keeps a note left on a losing variant with that variant, marked as one", () => {
    const world = new World();
    world.join(ANN, "Ann", day(0, 1));
    world.join(BEN, "Ben", day(0, 2));
    const seen = world.now.head.n;
    const live = world.write("witness", witness(3, 3, "Ben's hollow"), BEN, day(1));
    const lost = world.write("witness", witness(3, 3, "Ann's hollow"), ANN, day(1, 1), seen);
    const onLost = world.write("note", note([lost.id]), ANN, day(1, 2), seen);
    const onLive = world.write("note", note([live.id]), BEN, day(1, 3));
    const view = landFromHistory(world.now);
    const tellings = tellingsOf(view.marks["3,3"], view.notes);
    expect(tellings?.live?.mark.id).toBe(live.id);
    expect(tellings?.live?.notes).toBe(1);
    expect(tellings?.variants.map((one) => [one.mark.id, one.notes])).toEqual([[lost.id, 1]]);
    expect(noteStanding(view.noteMarks[onLost.id], true)).toBe("variant");
    expect(noteStanding(view.noteMarks[onLive.id], true)).toBeNull();
  });
});
