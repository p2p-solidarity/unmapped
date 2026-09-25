// The fold over many random histories (rev 6 phase 3, WP1b: D4, D15). Three people write at
// random, often offline, for months — witnesses, chapters, story, notes, gifts, places, deeds,
// beats, hides, rumors — through a naive sequencer that sequences everything. Invariants over many
// seeds are what E2E cannot reach (Rule 0). What this file guards, written before the code:
//   3. A race loses data: some admitted witness is in no chunk's live, variants or legends, or a
//      variant sits in a chunk without the earlier witness it lost to.
//   4. The lore view repeats an id (`activate()` would collide).
//   5. The fold depends on arrival order or batching: one by one, in one batch, in random batches
//      and from a JSON snapshot (`FoldSnapshot`) the same log folds identically; folding or
//      overlaying never mutates an earlier `now`; an outbox overlay predicts exactly what its
//      receipts make live or a variant, children included.
//   6. Two places share a spot, or one stands on home or a gate.

import { nextFreeEpisode } from "@shared/history/admit";
import { applyEntry, emptyNow, foldEntries, withPending, worldLore } from "@shared/history/fold";
import { type LogCursor, sequenceEvent } from "@shared/history/log";
import { openRumorSlots } from "@shared/history/rumor";
import { signatureVerdict } from "@shared/history/sign";
import type { LogEntry, VerdictEntry, WorldNow } from "@shared/history/types";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ANN,
  BEN,
  canon,
  chapter,
  day,
  ITEM,
  note,
  OWNER,
  pending,
  place,
  prng,
  TILE,
  World,
  witness,
} from "../fixtures/history";

const SPOTS: readonly [number, number][] = [
  [1, 0],
  [3, 0],
  [3, 1],
  [5, 5],
  [-4, 2],
  [0, 4],
];

/** A world where three people write at random, often offline, across months. */
function randomWorld(seed: number): World {
  const rand = prng(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T;
  const world = new World();
  world.join(ANN, "Ann", day(0, 1));
  world.join(BEN, "Ben", day(0, 2));
  let minutes = 10;
  for (let step = 0; step < 40; step += 1) {
    minutes += 1 + Math.floor(rand() * (rand() < 0.15 ? 60 * 24 * 40 : 600));
    const rt = day(0, minutes);
    const who = pick([OWNER, ANN, BEN]);
    const seen = rand() < 0.4 ? Math.floor(rand() * (world.now.head.n + 1)) : world.now.head.n;
    const [cx, cz] = pick(SPOTS);
    const refs = Object.values(world.now.events);
    const witnesses = refs.filter((ref) => ref.kind === "witness").map((ref) => ref.id);
    const roll = rand();
    if (roll < 0.33) {
      world.write("witness", witness(cx, cz, `W${step}`, [`n${step % 3}`]), who, rt, seen);
    } else if (roll < 0.43) {
      world.write("chapter", chapter(pick(["e1", "e2"]), `C${step}`), who, rt, seen);
    } else if (roll < 0.48) {
      const id = rand() < 0.7 ? (nextFreeEpisode(world.now) ?? "e3") : "e3";
      const episode = {
        id,
        title: `M${step}`,
        place: "P",
        kind: "meet",
        brief: "B",
        cx: cx + 9,
        cz,
      };
      world.write("story.more", { episode }, who, rt, seen);
    } else if (roll < 0.56) {
      world.write("visit", { chunks: [{ cx, cz }] }, who, rt, seen);
    } else if (roll < 0.63) {
      const anchors = witnesses.length > 0 && rand() < 0.6 ? [pick(witnesses)] : [];
      world.write("note", note(anchors), who, rt, seen);
    } else if (roll < 0.69) {
      const gifts = Object.keys(world.now.gifts);
      if (gifts.length > 0 && rand() < 0.5) {
        world.write("gift.take", { gift: pick(gifts) }, who, rt, seen);
      } else {
        world.write(
          "gift",
          { coord: TILE(cx, cz), item: ITEM, for: null, words: "" },
          who,
          rt,
          seen,
        );
      }
    } else if (roll < 0.75) {
      world.write("place", place(`P${step}`, cx + (step % 3), cz - 1), who, rt, seen);
    } else if (roll < 0.83) {
      const target = refs.filter((ref) => ref.kind === "chapter" || ref.kind === "place");
      if (target.length > 0) {
        const ref = pick(target);
        const what =
          ref.kind === "chapter" ? ("chapter.cleared" as const) : ("place.crossed" as const);
        world.write("deed", { what, ref: ref.id }, who, rt, seen);
      }
    } else if (roll < 0.92) {
      world.beat(rt);
    } else if (roll < 0.95 && witnesses.length > 0) {
      world.write("hide", { id: pick(witnesses), hidden: rand() < 0.7 }, OWNER, rt, seen);
    } else {
      const open = openRumorSlots(world.now);
      if (open.length > 0) {
        const { beat, slot } = pick(open);
        const label = world.now.events[slot.cite]?.label ?? "";
        const text = rand() < 0.7 ? `They say ${label}` : `Mira heard of ${label}`;
        world.write("rumor", { beat, slot: slot.slot, text }, pick([ANN, BEN]), rt, seen);
      }
    }
  }
  return world;
}

const SEEDS = Array.from({ length: 16 }, (_, index) => index + 1);
const worlds = new Map<number, World>();
const worldFor = (seed: number): World => {
  const known = worlds.get(seed) ?? randomWorld(seed);
  worlds.set(seed, known);
  return known;
};

describe("the fold does not depend on arrival, batching or snapshots (3, 5)", () => {
  // Building the worlds signs and verifies every event once; the tests then refold them.
  beforeAll(() => {
    for (const seed of SEEDS) worldFor(seed);
  }, 60_000);

  it("folds a log the same way one by one, in one batch, in random batches and from a snapshot", () => {
    for (const seed of SEEDS) {
      const world = worldFor(seed);
      const all = world.verdictEntries();
      const once = canon(foldEntries(emptyNow(world.genesis), all));
      expect(canon(world.now), `seed ${seed}`).toBe(once);
      const rand = prng(seed * 7919);
      let now = emptyNow(world.genesis);
      for (let at = 0; at < all.length; ) {
        const size = 1 + Math.floor(rand() * 9);
        now = foldEntries(now, all.slice(at, at + size));
        at += size;
      }
      expect(canon(now), `seed ${seed}`).toBe(once);
      const cut = 1 + Math.floor(rand() * (all.length - 1));
      const snapshot = JSON.parse(canon(foldEntries(emptyNow(world.genesis), all.slice(0, cut))));
      expect(canon(foldEntries(snapshot as WorldNow, all.slice(cut))), `seed ${seed}`).toBe(once);
    }
  });

  it("never mutates an earlier now, and keeps every admitted witness", () => {
    for (const seed of SEEDS) {
      const world = worldFor(seed);
      const all = world.verdictEntries();
      let now = emptyNow(world.genesis);
      for (const [index, { entry, verdict }] of all.entries()) {
        const before = canon(now);
        withPending(
          now,
          all
            .slice(index, index + 3)
            .map(({ entry: one, verdict: v }) => ({ event: one.event, verdict: v })),
          entry.rt,
        );
        const next = applyEntry(now, entry, verdict);
        expect(canon(now), `seed ${seed} entry ${entry.n}`).toBe(before);
        now = next;
      }
      const admitted = Object.values(now.events)
        .filter((ref) => ref.kind === "witness")
        .map((ref) => ref.id)
        .sort();
      const kept = Object.values(now.chunks)
        .flatMap((chunk) => [chunk.live, ...chunk.variants, ...chunk.legends])
        .map((one) => one.id)
        .sort();
      expect(kept, `seed ${seed}`).toEqual(admitted);
      // A variant lost to whichever witness was live when it arrived: the live one or a legend.
      for (const chunk of Object.values(now.chunks)) {
        const winners = [chunk.live, ...chunk.legends].map((one) => one.n);
        for (const variant of chunk.variants) expect(winners.some((n) => n < variant.n)).toBe(true);
      }
      const view = worldLore(now).map(({ node }) => node.id);
      expect(new Set(view).size, `seed ${seed}`).toBe(view.length);
    }
  });

  it("shows an outbox exactly as its receipts will make it live or a variant", () => {
    const view = (now: WorldNow) => ({
      chunks: Object.entries(now.chunks).map(([at, chunk]) => [
        at,
        chunk.live.id,
        chunk.variants.map((one) => one.id),
        chunk.legends.map((one) => one.id),
      ]),
      chapters: Object.entries(now.chapters).map(([at, one]) => [
        at,
        one.live?.id ?? null,
        one.variants.map((v) => v.id),
      ]),
      notes: now.notes.map((one) => [one.id, now.events[one.id]?.status]),
    });
    for (const seed of SEEDS) {
      const world = worldFor(seed);
      const rand = prng(seed + 99);
      const head = world.now.head.n;
      const outbox = Array.from({ length: 6 }, (_, index) => {
        const [cx, cz] = SPOTS[Math.floor(rand() * SPOTS.length)] ?? [1, 0];
        const who = rand() < 0.5 ? ANN : BEN;
        const seen = Math.floor(rand() * (head + 1));
        const roll = rand();
        if (roll < 0.6) return world.event("witness", witness(cx, cz, `O${index}`), who, seen);
        if (roll < 0.8) {
          return world.event(
            "chapter",
            chapter(rand() < 0.5 ? "e1" : "e2", `O${index}`),
            who,
            seen,
          );
        }
        const witnesses = Object.values(world.now.events).filter((ref) => ref.kind === "witness");
        const anchor = witnesses[Math.floor(rand() * witnesses.length)]?.id;
        return world.event("note", note(anchor === undefined ? [] : [anchor]), who, seen);
      });
      const rt = world.now.rt ?? day(0);
      const overlay = withPending(world.now, outbox.map(pending), rt);
      const provisional = outbox.filter((event) => overlay.events[event.id]?.pending === true);
      const last = world.entries[world.entries.length - 1] as LogEntry;
      let cursor: LogCursor = { n: last.n, chain: last.chain, rt: last.rt };
      const receipts: VerdictEntry[] = outbox.map((event) => {
        const entry = sequenceEvent(cursor, event, rt, null);
        cursor = { n: entry.n, chain: entry.chain, rt: entry.rt };
        return { entry, verdict: signatureVerdict(event) };
      });
      const received = foldEntries(world.now, receipts);
      expect(view(overlay), `seed ${seed}`).toEqual(view(received));
      expect(overlay.pending).toBe(provisional.length);
      for (const event of provisional) {
        expect(received.events[event.id]?.status).toBe(overlay.events[event.id]?.status);
      }
    }
  });

  it("keeps every place on its own free spot", () => {
    for (const seed of SEEDS) {
      const now = worldFor(seed).now;
      const spots = now.places.map((one) => `${one.cx},${one.cz}`);
      expect(new Set(spots).size, `seed ${seed}`).toBe(spots.length);
      for (const gate of ["0,0", "6,0", "-6,2"]) expect(spots).not.toContain(gate);
    }
  });
});
