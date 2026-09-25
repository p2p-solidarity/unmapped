// Beats and rumors of a world's history (rev 6 phase 3, WP1b: D13, D14). Every client and the
// world service must compute the same beat and judge a rumor the same way, and a rumor must retell
// only what the history holds — nothing E2E can pin down (Rule 0). What this file guards, written
// before the code:
//   6. A rumor that cites nothing, is out of scope (unknown or expired beat, unknown slot), does
//      not name what it retells, or names any label the fold knows that the slot does not allow
//      (another member, place, resident, item or title) is accepted — or a good one is refused:
//      one naming its listener's place, one whose cited place is named after a member, one in
//      other ASCII case. A gift (player-made item names) or a visitor's event becomes a slot. An
//      uncited label slips through because it begins with, or contains, an allowed one ("Ben" is
//      allowed, "Benton Hollow" is not) — found by review.
//   7. A beat that differs from its recomputation (fog, season, slots, time, upTo, fingerprint)
//      is applied, or a correct one is not; a place fogs before day 69 or near home, or a weekly
//      visit fails to keep it; care touches older than 180 days are kept (the fold would grow
//      with every visit) or pruning changes care.

import { computeBeat } from "@shared/history/beat";
import { asciiFold, openRumorSlots, rumorsFor, validateRumor } from "@shared/history/rumor";
import type { BeatBody } from "@shared/history/types";
import { describe, expect, it } from "vitest";
import {
  ANN,
  BEN,
  chapter,
  day,
  ITEM,
  key,
  OWNER,
  place,
  TILE,
  VISITOR,
  World,
  witness,
} from "../fixtures/history";

describe("rumors (6)", () => {
  function town() {
    const world = new World();
    world.join(ANN, "Ann", day(0, 1));
    world.join(BEN, "Ben", day(0, 2));
    world.write("witness", witness(5, 0, "Ford", ["bo"]), ANN, day(0, 3));
    world.write("witness", witness(4, 1, "Ann's Mill", ["cy"]), BEN, day(0, 4));
    const lantern = world.write("chapter", chapter("e1", "The Lantern"), BEN, day(0, 5));
    world.write("deed", { what: "chapter.cleared", ref: lantern.id }, BEN, day(0, 6));
    const gift = { coord: TILE(5, 0), item: ITEM, for: null, words: "tell everyone" };
    world.write("gift", gift, BEN, day(0, 7));
    const beat = world.beat(day(1));
    return { world, beat };
  }

  it("slots cite recent facts, deeds first, told by residents 1–3 rings away", () => {
    const { world, beat } = town();
    const slots = beat.body.slots;
    expect(slots.length).toBeGreaterThan(0);
    expect(world.now.events[slots[0]?.cite ?? ""]?.kind).toBe("deed");
    for (const slot of slots) {
      const where = world.now.events[slot.cite]?.where;
      const ring = Math.max(
        Math.abs(slot.listener.cx - (where?.cx ?? 0)),
        Math.abs(slot.listener.cz - (where?.cz ?? 0)),
      );
      expect(ring).toBeGreaterThanOrEqual(1);
      expect(ring).toBeLessThanOrEqual(3);
      expect(
        world.now.chunks[`${slot.listener.cx},${slot.listener.cz}`]?.index.npcs.map(
          (npc) => npc.id,
        ),
      ).toContain(slot.listener.npc);
      expect(["witness", "chapter", "deed", "member.join", "place"]).toContain(
        world.now.events[slot.cite]?.kind,
      );
    }
  });

  it("accepts a rumor that names what it retells and whom it is about, and nothing else", () => {
    const { world, beat } = town();
    const deed = beat.body.slots[0];
    const rumor = (text: string, slot = 0, beatId = beat.id) => ({ beat: beatId, slot, text });
    const good = world.write(
      "rumor",
      rumor("They say Ben cleared The Lantern at last."),
      ANN,
      day(1, 1),
    );
    expect(world.code(good.id)).toBeUndefined();
    const second = world.write(
      "rumor",
      rumor("Ben and the lantern — the lantern!"),
      BEN,
      day(1, 2),
    );
    expect(world.now.events[second.id]?.status).toBe("variant");
    expect(
      rumorsFor(world.now, deed?.listener ?? { cx: 0, cz: 0, npc: "" }).map((one) => one.id),
    ).toEqual([good.id]);
    expect(openRumorSlots(world.now).some((open) => open.slot.slot === 0)).toBe(false);

    const check = (text: string, slot = 0, beatId = beat.id) =>
      validateRumor(world.now, { author: key(ANN), body: rumor(text, slot, beatId) });
    expect(check("Ann says Ben cleared The Lantern")).toMatchObject({
      error: { code: "rumor-names-other" },
    });
    expect(check("Someone cleared something")).toMatchObject({ error: { code: "rumor-uncited" } });
    expect(check("The Lantern\nis lit")).toMatchObject({ error: { code: "rumor-text-invalid" } });
    expect(check("The Lantern", 5)).toMatchObject({ error: { code: "rumor-slot-unknown" } });
    expect(check("The Lantern", 0, world.id)).toMatchObject({
      error: { code: "rumor-beat-unknown" },
    });
    const mill = beat.body.slots.find(
      (slot) => world.now.events[slot.cite]?.label === "Ann's Mill",
    );
    if (mill !== undefined) {
      const byBen = validateRumor(world.now, {
        author: key(BEN),
        body: rumor("Ann's Mill turns again, Ben says", mill.slot),
      });
      expect(byBen.ok).toBe(true);
    }
    const listener = deed?.listener ?? { cx: 0, cz: 0, npc: "" };
    const there = world.now.chunks[`${listener.cx},${listener.cz}`]?.index.name ?? "";
    const elsewhere = there === "Ford" ? "Ann's Mill" : "Ford";
    expect(check(`The Lantern shone as far as ${there}`).ok).toBe(true);
    expect(check(`The Lantern shone as far as ${elsewhere}`)).toMatchObject({
      error: { code: "rumor-names-other" },
    });
    expect(check("The Lantern and a Tin Lamp")).toMatchObject({
      error: { code: "rumor-names-other" },
    });
    expect(check("THE LANTERN is lit, says BEN").ok).toBe(true);
    expect(asciiFold("ÀNN Élan")).toBe("Ànn Élan");
    world.write("access", { policy: "public" }, OWNER, day(1, 3));
    const visiting = world.write(
      "rumor",
      rumor("They say Ben cleared The Lantern", 1),
      VISITOR,
      day(1, 4),
    );
    expect(world.code(visiting.id)).toBe("access-visitor-kind");
    for (let index = 0; index < 4; index += 1) world.beat(day(2 + index));
    expect(check("They say Ben cleared The Lantern")).toMatchObject({
      error: { code: "rumor-beat-expired" },
    });
  });

  it("refuses an uncited label that only begins with an allowed one", () => {
    const { world, beat } = town();
    // "Ben" (the deed's author) is allowed; the place "Benton Hollow" is known but not cited.
    const hollow = world.write("place", place("Benton Hollow", 9, 9), OWNER, day(1, 1));
    expect(world.code(hollow.id)).toBeUndefined();
    const check = (text: string) =>
      validateRumor(world.now, { author: key(ANN), body: { beat: beat.id, slot: 0, text } });
    expect(check("Ben says Benton Hollow saw The Lantern cleared")).toMatchObject({
      error: { code: "rumor-names-other" },
    });
    expect(check("They say Ben cleared The Lantern").ok).toBe(true);
  });
});

describe("beats equal their recomputation, and forget slowly (7)", () => {
  it("applies only a beat that equals its recomputation", () => {
    const world = new World();
    world.join(ANN, "Ann", day(0));
    world.write("witness", witness(5, 5, "Far"), ANN, day(0));
    world.write("witness", witness(4, 5, "Nearby", ["bo"]), ANN, day(0));
    world.write("witness", witness(4, 4, "Watch", ["cy"]), ANN, day(79));
    const tamper = (change: (body: BeatBody) => BeatBody, at = day(80), rt = at) => {
      const computed = computeBeat(world.now, at);
      if (!computed.ok) throw new Error(computed.error.message);
      return world.code(world.write("beat", change(computed.value.body), OWNER, rt).id);
    };
    expect(tamper((body) => ({ ...body, fog: [...body.fog, "9,9"] }))).toBe("beat-mismatch");
    expect(tamper((body) => ({ ...body, fog: [] }))).toBe("beat-mismatch");
    expect(tamper((body) => ({ ...body, season: ((body.season + 1) % 4) as 0 }))).toBe(
      "beat-mismatch",
    );
    expect(tamper((body) => ({ ...body, slots: body.slots.slice(1) }))).toBe("beat-mismatch");
    expect(tamper((body) => ({ ...body, upTo: body.upTo - 1 }))).toBe("beat-mismatch");
    expect(tamper((body) => ({ ...body, fingerprint: `sha256:${"0".repeat(64)}` }))).toBe(
      "beat-mismatch",
    );
    expect(tamper((body) => body, day(90), day(85))).toBe("beat-time");
    expect(world.now.beats).toEqual([]);
    expect(tamper((body) => body, day(86))).toBeUndefined();
    expect(world.now.beats[0]?.body.fog).toEqual(["4,5", "5,5"]);
    expect(world.now.chunks["5,5"]?.fogged).toBe(true);
  });

  it("fogs a lone witness on day 69, never near home, and not while visited weekly", () => {
    const world = new World();
    world.join(ANN, "Ann", day(0));
    world.write("witness", witness(5, 5, "Lone"), ANN, day(0));
    world.write("witness", witness(1, 1, "Home Edge"), ANN, day(0));
    world.write("witness", witness(-7, 3, "Visited"), ANN, day(0));
    const visit = (d: number) => world.write("visit", { chunks: [{ cx: -7, cz: 3 }] }, ANN, day(d));
    for (let d = 7; d <= 63; d += 7) visit(d);
    world.beat(day(68));
    expect(world.now.care["5,5"]).toBe(3 * 34_502);
    expect(world.now.chunks["5,5"]?.fogged).toBe(false);
    world.beat(day(69));
    expect(world.now.chunks["5,5"]?.fogged).toBe(true);
    for (let d = 70; d <= 140; d += 7) visit(d);
    world.beat(day(150));
    expect(world.now.chunks["-7,3"]?.fogged).toBe(false);
    expect(world.now.chunks["1,1"]?.fogged).toBe(false);
    expect(world.now.season).toBe(Math.floor(150 / 7) % 4);
    const keptBefore = world.now.care["-7,3"];
    expect(Object.keys(world.now.touches["1,1"] ?? {})).toHaveLength(1);
    world.beat(day(181 + 1 / 1440));
    expect(world.now.touches["1,1"]).toBeUndefined();
    expect(world.now.care["1,1"]).toBe(0);
    expect(world.now.care["-7,3"]).toBeLessThan(keptBefore ?? 0);
    expect(Object.keys(world.now.touches["-7,3"] ?? {}).length).toBeGreaterThan(0);
  });
});
