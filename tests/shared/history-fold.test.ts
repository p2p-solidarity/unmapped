// The fold and admission of a world's history (rev 6 phase 3, WP1b: D3–D5, D8, D15). Untrusted
// input from peers and services, invariants over many seeds, and silent data loss — nothing E2E
// can reach (Rule 0). Beats and rumors: history-beat.test.ts; many seeds: history-order.test.ts.
// What this file guards, written before the code:
//   1. An expired, used-up, revoked, tampered, foreign or non-owner invite admits a member; a
//      logged `member.join` replayed by another key admits it (the proof); a use counts twice.
//   2. A visitor writes a witness in a public world; anyone in a friends world who is not a
//      member writes; a member changes the door, hides or announces a pack; a private world takes
//      a member's event; a removed key keeps writing; anyone but the beater beats.
//   3. A race loses data instead of making a variant: offline writers of one chunk, chapter or
//      next chapter — every write stays (one live, the rest variants) whatever the order, and a
//      writer who had already folded the live one is refused. A child of a variant (a note's
//      anchor or contest, a deed's ref, a chapter's story.more) is not a variant, or a pending
//      child does not follow its parent when the parent's receipt makes it one.
//   4. A legend is lost on re-witness (after fog or a hide), or lore ids collide in the lore view
//      (`activate()` keys by id): non-live nodes must be re-identified, links and errand places
//      must reach live lore only, and a re-witness may reuse the old slugs.
//   8. An invalid entry is applied or stops the fold: a verdict that is not ok, a bad signature,
//      an unknown kind (counted as newer), a duplicate, a second take of a gift, a second visit on
//      one day, a place on a taken or far spot, a deed or contest that does not resolve, a pack for
//      another revision, a hide of nothing, a log whose first entry is not its genesis.

import { spotFree } from "@shared/history/admit";
import { computeBeat } from "@shared/history/beat";
import { applyEntry, emptyNow, newerCount, withPending, worldLore } from "@shared/history/fold";
import { logStart, sequenceEvent } from "@shared/history/log";
import { eventIdOf, signatureVerdict, signText } from "@shared/history/sign";
import { describe, expect, it } from "vitest";
import {
  ANN,
  BEN,
  chapter,
  day,
  HASH,
  ITEM,
  key,
  lore,
  note,
  OWNER,
  pending,
  place,
  SERVICE,
  TILE,
  VISITOR,
  World,
  witness,
} from "../fixtures/history";

describe("the door (1, 2)", () => {
  it("admits a member only with a live, unspent, unrevoked invite and its proof", () => {
    const world = new World();
    const once = world.invite();
    const joined = world.join(ANN, "Ann", day(1), once);
    expect(world.now.members[key(ANN)]?.name).toBe("Ann");
    expect(world.code(world.join(BEN, "Ben", day(1, 1), once).id)).toBe("invite-used-up");
    world.append(joined, day(1, 2));
    expect(world.code(joined.id)).toBe("event-duplicate");
    expect(world.now.invites[once.invite.nonce]?.uses).toBe(1);

    const replay = world.event("member.join", { ...joined.body, name: "Ben" }, BEN);
    world.append(replay, day(1, 3));
    expect(world.code(replay.id)).toBe("invite-used-up");
    const open = world.invite({ uses: 5 });
    const fair = world.join(BEN, "Ben", day(1, 4), open);
    const copied = world.event("member.join", { ...fair.body, name: "Vic" }, VISITOR);
    world.append(copied, day(1, 5));
    expect(world.code(copied.id)).toBe("invite-proof-invalid");

    const expired = world.join(VISITOR, "Vic", day(3), world.invite({ exp: day(2) }));
    expect(world.code(expired.id)).toBe("invite-expired");
    const withdrawn = world.invite({ uses: 5 });
    world.write("invite.revoke", { nonce: withdrawn.invite.nonce }, OWNER, day(3, 1));
    expect(world.code(world.join(VISITOR, "Vic", day(3, 2), withdrawn).id)).toBe("invite-revoked");
    const ticket = world.invite();
    const tampered = { ...ticket, invite: { ...ticket.invite, uses: 5 } };
    expect(world.code(world.join(VISITOR, "Vic", day(3, 3), tampered).id)).toBe(
      "invite-sig-invalid",
    );
    const byMember = world.invite({ by: ANN });
    expect(world.code(world.join(VISITOR, "Vic", day(3, 4), byMember).id)).toBe("invite-not-owner");
    const foreign = world.invite({ world: new World({ name: "Elsewhere" }).id });
    expect(world.code(world.join(VISITOR, "Vic", day(3, 5), foreign).id)).toBe(
      "invite-wrong-world",
    );
    world.join(VISITOR, "Vic", day(4), open);
    expect(Object.keys(world.now.members).sort()).toEqual(
      [key(ANN), key(BEN), key(VISITOR)].sort(),
    );
    expect(world.code(world.join(ANN, "Ann", day(4, 2)).id)).toBe("member-already");
  });

  it("keeps AI content to members and the door to the owner", () => {
    const world = new World();
    world.join(ANN, "Ann", day(1));
    expect(world.code(world.write("note", note([]), VISITOR, day(1, 1)).id)).toBe(
      "access-members-only",
    );
    for (const [kind, body] of [
      ["access", { policy: "public" }],
      ["hide", { id: world.genesis.id, hidden: true }],
      ["pack", { cartridge: HASH, pack: HASH, bytes: 10 }],
    ] as const) {
      expect(world.code(world.write(kind, body as never, ANN, day(1, 2)).id)).toBe(
        "access-owner-only",
      );
    }
    world.write("access", { policy: "public" }, OWNER, day(1, 3));
    expect(world.code(world.write("note", note([]), VISITOR, day(1, 4)).id)).toBeUndefined();
    const sign = { coord: TILE(2, 2), text: "north", toward: null };
    expect(world.code(world.write("signpost", sign, VISITOR, day(1, 5)).id)).toBeUndefined();
    const claim = world.write("witness", witness(4, 4, "Moor"), VISITOR, day(1, 6));
    expect(world.code(claim.id)).toBe("access-visitor-kind");
    expect(world.now.chunks["4,4"]).toBeUndefined();

    world.write("witness", witness(4, 4, "Moor"), ANN, day(1, 7));
    world.write("member.remove", { key: key(ANN) }, OWNER, day(1, 8));
    expect(world.code(world.write("profile", { name: "Ann" }, ANN, day(1, 9)).id)).toBe(
      "access-removed",
    );
    expect(world.now.chunks["4,4"]?.live.author).toBe(key(ANN));

    world.join(BEN, "Ben", day(2));
    world.write("access", { policy: "private" }, OWNER, day(2, 1));
    expect(world.code(world.write("profile", { name: "B" }, BEN, day(2, 2)).id)).toBe(
      "access-private",
    );
    const mine = world.write("profile", { name: "Mira" }, OWNER, day(2, 3));
    expect(world.code(mine.id)).toBeUndefined();
  });

  it("lets only the beater beat: the owner, then the attached service", () => {
    const world = new World();
    world.join(ANN, "Ann", day(0, 1));
    expect(world.code(world.beat(day(1), ANN).id)).toBe("access-not-beater");
    expect(world.code(world.beat(day(1, 1)).id)).toBeUndefined();
    world.write("sequencer", { url: "wss://worlds.example", key: key(SERVICE) }, OWNER, day(2));
    expect(world.code(world.beat(day(2, 1)).id)).toBe("access-not-beater");
    expect(world.code(world.beat(day(2, 2), SERVICE).id)).toBeUndefined();
  });
});

describe("races make variants, never losses (3)", () => {
  function pair() {
    const world = new World();
    world.join(ANN, "Ann", day(0, 1));
    world.join(BEN, "Ben", day(0, 2));
    return world;
  }

  it("keeps both writers of one chunk, in either order, and refuses one who knew", () => {
    for (const [first, second] of [
      [ANN, BEN],
      [BEN, ANN],
    ] as const) {
      const world = pair();
      const offline = world.now.head.n;
      const a = world.write("witness", witness(3, 3, "Mill"), first, day(1), offline);
      const b = world.write("witness", witness(3, 3, "Ford"), second, day(1, 1), offline);
      const chunk = world.now.chunks["3,3"];
      expect(chunk?.live.id).toBe(a.id);
      expect(chunk?.variants.map((one) => one.id)).toEqual([b.id]);
      expect(world.now.events[b.id]?.status).toBe("variant");
      const knew = world.write("witness", witness(3, 3, "Moor"), second, day(1, 2));
      expect(world.code(knew.id)).toBe("chunk-already-witnessed");
    }
  });

  it("does the same for chapters and continued chapters", () => {
    const world = pair();
    const offline = world.now.head.n;
    const a = world.write("chapter", chapter("e1", "Lantern"), ANN, day(1), offline);
    const b = world.write("chapter", chapter("e1", "Lamp"), BEN, day(1, 1), offline);
    expect(world.now.chapters.e1?.live?.id).toBe(a.id);
    expect(world.now.chapters.e1?.variants.map((one) => one.id)).toEqual([b.id]);
    const write = (body: Parameters<typeof chapter>, at: string) =>
      world.code(world.write("chapter", chapter(...body), BEN, at).id);
    expect(write(["e1", "X"], day(1, 2))).toBe("chapter-already-written");
    expect(write(["e9", "X"], day(1, 3))).toBe("chapter-episode-unknown");

    const episode = (id: string, cx: number) => ({
      episode: { id, title: `T${id}`, place: "P", kind: "meet", brief: "B", cx, cz: 4 },
    });
    const behind = world.now.head.n;
    const more = world.write("story.more", episode("e3", 3), ANN, day(2), behind);
    const raced = world.write("story.more", episode("e3", 5), BEN, day(2, 1), behind);
    expect(world.now.more.e3?.live?.id).toBe(more.id);
    expect(world.now.more.e3?.variants.map((one) => one.id)).toEqual([raced.id]);
    const story = (id: string, cx: number, at: string) =>
      world.code(world.write("story.more", episode(id, cx), BEN, at).id);
    expect(story("e5", 8, day(2, 2))).toBe("more-not-next");
    expect(story("e1", 9, day(2, 3))).toBe("more-authored");
    expect(story("e4", 3, day(2, 4))).toBe("more-gate-taken");
    expect(write(["e3", "Tea"], day(2, 5))).toBe("chapter-episode-unknown");
    expect(write(["e3", "Tea", world.genesis.id], day(2, 6))).toBe("chapter-more-unknown");

    const branch = world.write("chapter", chapter("e3", "Other tea", raced.id), ANN, day(2, 7));
    expect(world.now.events[branch.id]?.status).toBe("variant");
    expect(world.now.chapters.e3).toMatchObject({ live: null, variants: [{ id: branch.id }] });
    const tea = world.write("chapter", chapter("e3", "Tea", more.id), ANN, day(2, 8));
    expect(world.now.chapters.e3?.live?.id).toBe(tea.id);
  });

  it("makes a child of a variant a variant, and a pending child follows its parent", () => {
    const world = pair();
    const offline = world.now.head.n;
    const keepsake = { keepsakes: [{ id: "k1", name: "Brass Key" }] };
    const errand = { id: "lamp", giver: "ada", place: null, reward: "k1" };
    const ford = world.event(
      "witness",
      witness(3, 3, "Ford", ["ada"], [], { ...keepsake, errands: [errand] }),
      BEN,
      offline,
    );
    const left = world.event("note", note([ford.id]), BEN, offline);
    const provisional = withPending(world.now, [ford, left].map(pending), day(1));
    expect([ford, left].map((one) => provisional.events[one.id]?.status)).toEqual(["live", "live"]);

    const mill = world.write("witness", witness(3, 3, "Mill"), ANN, day(1), offline);
    const behind = withPending(world.now, [ford, left].map(pending), day(1, 1));
    expect([ford, left].map((one) => behind.events[one.id]?.status)).toEqual([
      "variant",
      "variant",
    ]);
    world.append(ford, day(1, 2));
    world.append(left, day(1, 3));
    expect(world.now.events[left.id]?.status).toBe("variant");
    const answer = world.write("note", note([mill.id], left.id), ANN, day(1, 4));
    expect(world.now.events[answer.id]?.status).toBe("variant");
    const plain = world.write("note", note([mill.id]), ANN, day(1, 5));
    expect(world.now.events[plain.id]?.status).toBe("live");

    const done = { what: "errand.done" as const, ref: `${ford.id}:lamp` };
    const deed = world.write("deed", done, BEN, day(2));
    expect(world.now.events[deed.id]?.status).toBe("variant");
    const unknown = { what: "errand.done" as const, ref: `${ford.id}:nope` };
    expect(world.code(world.write("deed", unknown, BEN, day(2, 1)).id)).toBe("deed-ref-unknown");
  });
});

describe("legends survive a re-witness, and lore never collides (4)", () => {
  it("fogs a quiet far place, keeps it as a legend, and lets the new one reuse its slugs", () => {
    const world = new World();
    world.join(ANN, "Ann", day(0));
    world.join(BEN, "Ben", day(0));
    const well = lore("well", 5, 5);
    const old = world.write("witness", witness(5, 5, "Old Mill", ["ada"], [well]), ANN, day(0));
    world.beat(day(80));
    expect(world.now.chunks["5,5"]?.fogged).toBe(true);
    expect(worldLore(world.now)).toEqual([
      { node: { ...well, id: `#${old.id}:well@5,5` }, live: false, witness: old.id },
    ]);

    const spring = lore("spring", 5, 5, ["well@5,5"]);
    const reaching = world.write(
      "witness",
      witness(5, 5, "New Mill", ["bo"], [spring]),
      BEN,
      day(81),
    );
    expect(world.code(reaching.id)).toBe("lore-link-unknown");
    const lost = { id: "fetch", giver: "bo", place: "well@5,5", reward: "k" };
    const errand = witness(5, 5, "New Mill", ["bo"], [], { errands: [lost] });
    expect(world.code(world.write("witness", errand, BEN, day(81, 1)).id)).toBe(
      "errand-place-unknown",
    );
    const again = { ...witness(5, 5, "New Mill", ["bo"], [well, spring]), supersedes: old.id };
    const fresh = world.write("witness", again, BEN, day(81, 2));
    const chunk = world.now.chunks["5,5"];
    expect(chunk).toMatchObject({
      fogged: false,
      live: { id: fresh.id },
      legends: [{ id: old.id }],
    });
    expect(chunk?.legends[0]?.body.lore).toEqual([well]);
    const view = worldLore(world.now);
    expect(view.map(({ node, live }) => [node.id, live])).toEqual([
      [`#${old.id}:well@5,5`, false],
      ["well@5,5", true],
      ["spring@5,5", true],
    ]);
    expect(new Set(view.map(({ node }) => node.id)).size).toBe(view.length);
    expect(world.entries.some((entry) => entry.event.id === old.id)).toBe(true);
    expect(world.code(world.write("witness", witness(5, 5, "Third"), ANN, day(82)).id)).toBe(
      "chunk-already-witnessed",
    );
    const bogus = { ...witness(6, 5, "X"), supersedes: old.id };
    expect(world.code(world.write("witness", bogus, ANN, day(82, 1)).id)).toBe(
      "witness-supersedes-unknown",
    );
  });

  it("treats a hidden live witness as gone from every view, and its chunk as open", () => {
    const world = new World();
    world.join(ANN, "Ann", day(0));
    const rude = world.write(
      "witness",
      witness(2, 2, "Rude", ["ada"], [lore("sign", 2, 2)]),
      ANN,
      day(0),
    );
    world.write("hide", { id: rude.id, hidden: true }, OWNER, day(1));
    expect(world.now.hidden[rude.id]).toBe(true);
    expect(worldLore(world.now)).toEqual([]);
    const kind = world.write(
      "witness",
      witness(2, 2, "Kind", ["bo"], [lore("sign", 2, 2)]),
      ANN,
      day(2),
    );
    expect(world.now.chunks["2,2"]).toMatchObject({
      live: { id: kind.id },
      legends: [{ id: rude.id }],
    });
    expect(worldLore(world.now).map(({ node }) => node.id)).toEqual(["sign@2,2"]);
    world.write("hide", { id: rude.id, hidden: false }, OWNER, day(3));
    expect(worldLore(world.now).map(({ node }) => node.id)).toEqual([
      `#${rude.id}:sign@2,2`,
      "sign@2,2",
    ]);
  });
});

describe("invalid entries are skipped, never applied, never fatal (8)", () => {
  it("skips what its verdict, reading or admission refuses, and folds on", () => {
    const world = new World();
    world.join(ANN, "Ann", day(0, 1));
    const claimed = world.event("profile", { name: "Anna" }, ANN);
    world.append(claimed, day(1), { ok: false, code: "witness-scene-invalid" });
    expect(world.code(claimed.id)).toBe("witness-scene-invalid");
    const forged = { ...claimed, sig: world.event("profile", { name: "Anna" }, BEN).sig };
    world.append(forged, day(1));
    const codes = world.now.ignored.filter((one) => one.id === claimed.id).map((one) => one.code);
    expect(codes).toEqual(["witness-scene-invalid", "event-sig-invalid"]);
    expect(world.now.names[key(ANN)]).toBe("Ann");

    const unsigned = {
      v: 1,
      world: world.id,
      kind: "trade",
      author: key(ANN),
      at: "x",
      seen: 1,
      body: {},
    };
    const id = eventIdOf(unsigned);
    world.append({ ...unsigned, id, sig: signText(ANN, `unmapped-event:v1\n${id}`) }, day(1, 1));
    expect(world.code(id)).toBe("event-kind-unknown");
    expect(newerCount(world.now)).toBe(1);

    const gift = { coord: TILE(3, 3), item: ITEM, for: null, words: "for anyone" };
    const left = world.write("gift", gift, OWNER, day(2));
    world.join(BEN, "Ben", day(2, 1));
    world.write("gift.take", { gift: left.id }, ANN, day(2, 2));
    const late = world.write("gift.take", { gift: left.id }, BEN, day(2, 3));
    expect(world.code(late.id)).toBe("gift-taken");
    expect(world.now.gifts[left.id]?.taken?.by).toBe(key(ANN));
    const forAnn = world.write("gift", { ...gift, for: key(ANN) }, OWNER, day(2, 4));
    expect(world.code(world.write("gift.take", { gift: forAnn.id }, BEN, day(2, 5)).id)).toBe(
      "gift-not-yours",
    );

    const visit = (at: string) => world.write("visit", { chunks: [{ cx: 1, cz: 1 }] }, ANN, at);
    expect(world.code(visit(day(3)).id)).toBeUndefined();
    expect(world.code(visit(day(3, 600)).id)).toBe("visit-today");
    expect(world.code(visit(day(4)).id)).toBeUndefined();

    const crossed = { what: "place.crossed" as const, ref: left.id };
    expect(world.code(world.write("deed", crossed, ANN, day(5)).id)).toBe("deed-ref-unknown");
    const lantern = world.write("chapter", chapter("e1", "Lantern"), ANN, day(5, 1));
    const cleared = { what: "chapter.cleared" as const, ref: lantern.id };
    world.write("deed", cleared, BEN, day(5, 2));
    expect(world.code(world.write("deed", cleared, BEN, day(5, 3)).id)).toBe("deed-duplicate");
    expect(world.code(world.write("note", note([], left.id), ANN, day(5, 4)).id)).toBe(
      "note-contests-unknown",
    );
    expect(world.code(world.write("note", note([left.id]), ANN, day(5, 5)).id)).toBe(
      "note-anchor-unknown",
    );
    const sign = (index: number) =>
      world.write(
        "signpost",
        { coord: TILE(2, 2), text: `way ${index}`, toward: null },
        ANN,
        day(6, index),
      );
    for (let index = 0; index < 3; index += 1) expect(world.code(sign(index).id)).toBeUndefined();
    expect(world.code(sign(3).id)).toBe("signpost-quota");

    const put = (body: ReturnType<typeof place>, who = ANN) =>
      world.code(world.write("place", body, who, day(7)).id);
    expect(put(place("Old Course", 3, 3, "p1"))).toBe("place-legacy-owner");
    expect(put(place("Old Course", 3, 3, "p1"), OWNER)).toBeUndefined();
    expect(put(place("Again", 3, 3))).toBe("place-spot-taken");
    expect(put(place("Home", 0, 0))).toBe("place-spot-taken");
    expect(put(place("Gate", 6, 0))).toBe("place-spot-taken");
    expect(put(place("Far", 65, 0))).toBe("place-spot-far");
    const next = world.write("place", place("Next", 3, 4), ANN, day(7, 1));
    expect(world.now.places.map((one) => [one.place, one.cx, one.cz])).toEqual([
      ["p1", 3, 3],
      [`p${next.id.slice(1, 9)}`, 3, 4],
    ]);
    expect(spotFree(world.now, { cx: 3, cz: 4 })).toMatchObject({
      error: { code: "place-spot-taken" },
    });

    const pack = { cartridge: `sha256:${"ab".repeat(32)}` as const, pack: HASH, bytes: 1 };
    expect(world.code(world.write("pack", pack, OWNER, day(8)).id)).toBe("pack-cartridge-mismatch");
    world.write("pack", { ...pack, cartridge: HASH }, OWNER, day(8, 1));
    expect(world.now.pack?.bytes).toBe(1);
    expect(world.code(world.write("hide", { id: id, hidden: true }, OWNER, day(8, 2)).id)).toBe(
      "hide-unknown",
    );
    const beat = world.beat(day(9));
    expect(
      world.code(world.write("hide", { id: beat.id, hidden: true }, OWNER, day(9, 1)).id),
    ).toBe("hide-kind");
    world.write("profile", { name: "Ann Again" }, ANN, day(10));
    expect(world.now.names[key(ANN)]).toBe("Ann Again");
  });

  it("refuses a log whose first entry is not its genesis", () => {
    const world = new World();
    const stray = world.event("profile", { name: "x" }, OWNER, 0);
    const entry = sequenceEvent(logStart(world.id), stray, day(0), null);
    const now = applyEntry(emptyNow(world.genesis), entry, signatureVerdict(stray));
    expect(now.ignored[0]?.code).toBe("genesis-missing");
    expect(now.head.n).toBe(1);
    expect(computeBeat(now, day(1))).toMatchObject({ error: { code: "beat-no-genesis" } });
  });
});
