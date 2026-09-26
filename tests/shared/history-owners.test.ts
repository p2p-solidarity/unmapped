// Co-owners and the chain opt-in (rev 6 phase 4, D5, D6; world protocol 2). Who owns a world is
// decided in three places that must agree — the fold's admit, verifyLog's ownership pass, and an
// invitee reading a link offline — and none of it is reachable by E2E before a bad key or a
// crafted link shows up (Rule 0). What this file guards, written before the code:
//   1. The last owner is removed, leaving a world nobody can run; or a member removal takes an
//      owner out.
//   2. A `sequencer` written by an owner removed before it installs a key: its receipts would be
//      trusted from there on.
//   3. A co-owner's rehost does not switch keys from its own entry on, or older receipts stop
//      verifying; a batch continued from a cursor judges its sequencers by the genesis author only.
//   4. The ownership pass and the fold disagree (a repeated owner.add after a removal, an owner
//      change by a non-owner), so the receipt schedule and the door name different owners.
//   5. A co-owner invite whose `&o=` chain does not reach the genesis author is accepted: a
//      missing link, another world's additions, a forged one, a circle, too many, one that does
//      not end at the signer; or an invite by a co-owner removed since still admits.
//   6. A protocol-1 build folds a world with co-owners differently and the world does not say it
//      needs protocol 2.
//   7. An adoption carries `owner.add`, `owner.remove` or `chain` into the adopted world.
//   8. The owner kinds change the land's physics: they add care, or the beat over a history with
//      them decides fog, seasons, care or rumors differently from the same history without them
//      (PHYSICS_VERSION stays; tests/shared/physics.test.ts keeps BEAT_RECORDED).

import { adoptLog } from "@main/histories/adopt";
import type { DeviceKey } from "@main/identity/deviceKey";
import { canonicalJson } from "@shared/canonical";
import { inviteLink, inviteRoot, readInviteLink } from "@shared/history/access";
import { verifyInvite } from "@shared/history/admit";
import { computeBeat } from "@shared/history/beat";
import { CARE_POINTS } from "@shared/history/decay";
import { applyEntry, chainRecording, emptyNow, foldEntries } from "@shared/history/fold";
import { base32, base64Url, sha256Bytes, utf8 } from "@shared/history/ids";
import { type LogCursor, logStart, sequenceEvent, verifyLog } from "@shared/history/log";
import {
  currentOwners,
  isOwner,
  OWNER_PATH_MAX,
  ownerPath,
  ownershipOf,
} from "@shared/history/owners";
import {
  authorKeyFor,
  signatureVerdict,
  signEvent,
  signInvite,
  signJoinProof,
} from "@shared/history/sign";
import type {
  EventBodies,
  EventKind,
  HistoryEventOf,
  LogEntry,
  StoredEvent,
  UnsignedEventOf,
  WorldNow,
} from "@shared/history/types";
import { protocolFor } from "@shared/worldProtocol";
import { describe, expect, it } from "vitest";
import { at, GENESIS, keyOf, OWNER, secretOf, sign, witnessBody } from "../service/support";

const BEN = secretOf("owners:ben");
const CAT = secretOf("owners:cat");
const DOT = secretOf("owners:dot");
const EVE = secretOf("owners:eve");
const FAY = secretOf("owners:fay");
const S1 = secretOf("owners:service-1");
const S2 = secretOf("owners:service-2");

function genesisOf(name: string) {
  const body = { ...GENESIS, name };
  return signEvent(
    { v: 1, world: "", kind: "genesis", author: keyOf(OWNER), at: at(0), seen: 0, body },
    OWNER,
  );
}

/**
 * A log written event by event, each signed against the fold so far, all received at one time,
 * receipts by `keyAt(n)`.
 */
class Script {
  readonly genesis;
  readonly entries: LogEntry[] = [];
  now: WorldNow;
  private cursor: LogCursor;

  constructor(
    private readonly keyAt: (n: number) => Uint8Array | null = () => null,
    name = "Salt Orchard",
  ) {
    this.genesis = genesisOf(name);
    this.now = emptyNow(this.genesis);
    this.cursor = logStart(this.genesis.id);
    this.push(this.genesis);
  }

  get world(): string {
    return this.genesis.id;
  }

  push(event: StoredEvent, verdict = signatureVerdict(event)): LogEntry {
    const entry = sequenceEvent(this.cursor, event, at(1), this.keyAt(this.cursor.n + 1));
    this.cursor = { n: entry.n, chain: entry.chain, rt: entry.rt };
    this.entries.push(entry);
    this.now = applyEntry(this.now, entry, verdict);
    return entry;
  }

  write<K extends EventKind>(
    kind: K,
    body: EventBodies[K],
    who: Uint8Array,
    seen = this.now.head.n,
  ) {
    const event = sign(this.world, kind, body, who, seen);
    this.push(event);
    return event;
  }

  sequencer(who: Uint8Array, service: Uint8Array) {
    return this.write("sequencer", { url: "wss://s.example", key: authorKeyFor(service) }, who);
  }

  ignored(): string[] {
    return this.now.ignored.map((one) => one.code);
  }
}

function inviteBy(world: string, who: Uint8Array, nonce = 1) {
  const secret = secretOf(`owners:invite:${nonce}`);
  const invite = signInvite(
    {
      v: 1,
      world,
      svc: "wss://s.example",
      by: keyOf(who),
      key: authorKeyFor(secret),
      nonce: base32(sha256Bytes(`owners:nonce:${nonce}`)).slice(0, 20),
      exp: at(30),
      uses: 1,
    },
    who,
  );
  return { invite, secret };
}

describe("owners (D5)", () => {
  it("never removes the last owner, nor an owner as a member (1)", () => {
    const log = new Script();
    log.write("owner.remove", { key: keyOf(OWNER) }, OWNER);
    expect(log.ignored().at(-1)).toBe("owner-last");
    log.write("owner.add", { key: keyOf(BEN) }, OWNER);
    log.write("member.remove", { key: keyOf(BEN) }, OWNER);
    expect(log.ignored().at(-1)).toBe("member-remove-owner");
    log.write("owner.remove", { key: keyOf(OWNER) }, BEN);
    expect(currentOwners(log.now)).toEqual([keyOf(BEN)]);
    log.write("owner.remove", { key: keyOf(BEN) }, BEN);
    expect(log.ignored().at(-1)).toBe("owner-last");
    log.write("access", { policy: "public" }, OWNER);
    expect(log.ignored().at(-1)).toBe("access-owner-only");
    const check = verifyLog(log.world, log.entries);
    expect(check.ok && check.value.ownership.owners).toEqual([keyOf(BEN)]);
  });

  it("installs no key from a sequencer by an owner removed before it (2)", () => {
    const log = new Script((n) => (n >= 1 ? S1 : null));
    log.write("owner.add", { key: keyOf(BEN) }, OWNER);
    log.sequencer(OWNER, S1);
    log.write("owner.remove", { key: keyOf(BEN) }, OWNER);
    log.sequencer(BEN, S2);
    log.write("profile", { name: "After" }, OWNER);
    expect(log.ignored().at(-1)).toBe("access-owner-only");
    expect(log.now.sequencer?.key).toBe(authorKeyFor(S1));
    const check = verifyLog(log.world, log.entries);
    if (!check.ok) throw new Error(check.error.message);
    expect(check.value.schedule.map((step) => [step.n, step.key])).toEqual([[3, authorKeyFor(S1)]]);
    // Receipts under the removed owner's service key from its entry on do not verify.
    const forged = new Script((n) => (n >= 5 ? S2 : S1));
    forged.write("owner.add", { key: keyOf(BEN) }, OWNER);
    forged.sequencer(OWNER, S1);
    forged.write("owner.remove", { key: keyOf(BEN) }, OWNER);
    forged.sequencer(BEN, S2);
    const refused = verifyLog(forged.world, forged.entries);
    expect(refused.ok ? null : refused.error.code).toBe("entry-rsig-invalid");
  });

  it("switches keys from a co-owner's rehost on, also continued from a cursor (3)", () => {
    const keyAt = (n: number) => (n >= 5 ? S2 : S1);
    const log = new Script(keyAt);
    log.write("owner.add", { key: keyOf(BEN) }, OWNER);
    log.sequencer(OWNER, S1);
    log.write("profile", { name: "Before" }, BEN);
    log.sequencer(BEN, S2);
    log.write("profile", { name: "After" }, BEN);
    expect(log.now.sequencer?.key).toBe(authorKeyFor(S2));
    const check = verifyLog(log.world, log.entries);
    if (!check.ok) throw new Error(check.error.message);
    expect(check.value.schedule.map((step) => step.n)).toEqual([3, 5]);

    const head = verifyLog(log.world, log.entries.slice(0, 4));
    if (!head.ok) throw new Error(head.error.message);
    const prefix = foldEntries(
      emptyNow(log.genesis),
      log.entries.slice(0, 4).map((entry) => ({ entry, verdict: signatureVerdict(entry.event) })),
    );
    expect(ownershipOf(prefix)).toEqual(head.value.ownership);
    const rest = log.entries.slice(4);
    const options = { from: head.value.cursor, schedule: head.value.schedule };
    expect(verifyLog(log.world, rest, { ...options, ownership: ownershipOf(prefix) }).ok).toBe(
      true,
    );
    // Judged by the genesis author alone, the co-owner's rehost would install nothing.
    const legacy = verifyLog(log.world, rest, { ...options, owner: keyOf(OWNER) });
    expect(legacy.ok ? null : legacy.error.code).toBe("entry-rsig-invalid");
    // Every receipt before the rehost still verifies under the first service's key only.
    const wrong = new Script(() => S2);
    wrong.write("owner.add", { key: keyOf(BEN) }, OWNER);
    wrong.sequencer(OWNER, S1);
    const early = verifyLog(wrong.world, wrong.entries);
    expect(early.ok ? null : early.error.code).toBe("entry-rsig-invalid");
  });

  it("agrees with the fold on repeats and on changes by non-owners (4)", () => {
    const log = new Script();
    const add = log.write("owner.add", { key: keyOf(BEN) }, OWNER);
    log.write("owner.remove", { key: keyOf(BEN) }, OWNER);
    log.push(add);
    log.write("owner.add", { key: keyOf(CAT) }, BEN);
    log.write("owner.add", { key: keyOf(DOT) }, OWNER, 99);
    expect(log.ignored()).toEqual(["event-duplicate", "access-owner-only", "event-seen-future"]);
    const check = verifyLog(log.world, log.entries);
    if (!check.ok) throw new Error(check.error.message);
    expect(check.value.ownership.owners).toEqual([keyOf(OWNER)]);
    expect(ownershipOf(log.now)).toEqual(check.value.ownership);
    const again = log.write("owner.add", { key: keyOf(BEN) }, OWNER);
    expect(isOwner(log.now, keyOf(BEN))).toBe(true);
    expect(log.now.owners[keyOf(BEN)]?.added?.id).toBe(add.id);
    expect(again.id).not.toBe(add.id);
    log.write("owner.add", { key: keyOf(CAT) }, OWNER);
    const after = verifyLog(log.world, log.entries);
    expect(after.ok && after.value.ownership).toEqual(ownershipOf(log.now));
  });
});

describe("invites by a co-owner (&o=)", () => {
  /** OWNER → BEN → CAT → DOT → EVE → FAY, each added by the one before. */
  function ladder() {
    const log = new Script();
    const adds: HistoryEventOf<"owner.add">[] = [];
    const keys = [OWNER, BEN, CAT, DOT, EVE, FAY];
    for (let index = 1; index < keys.length; index += 1) {
      const by = keys[index - 1] ?? OWNER;
      adds.push(log.write("owner.add", { key: keyOf(keys[index] ?? OWNER) }, by));
    }
    return { log, adds };
  }

  it("carries the path back to the maker and refuses one that does not reach it (5)", () => {
    const { log, adds } = ladder();
    expect(ownerPath(log.now, keyOf(OWNER))).toEqual([]);
    const path = ownerPath(log.now, keyOf(DOT));
    expect(path?.map((add) => add.id)).toEqual(adds.slice(0, 3).map((add) => add.id));
    expect(ownerPath(log.now, keyOf(EVE))?.length).toBe(OWNER_PATH_MAX);
    expect(ownerPath(log.now, keyOf(FAY))).toBeNull();
    expect(ownerPath(log.now, keyOf(secretOf("stranger")))).toBeNull();

    const { invite, secret } = inviteBy(log.world, EVE);
    const link = inviteLink(invite, secret, ownerPath(log.now, keyOf(EVE)) ?? []);
    expect(link.length).toBeLessThan(8000);
    const read = readInviteLink(link);
    if (!read.ok) throw new Error(read.error.message);
    expect(inviteRoot(read.value)).toBe(log.genesis.author);
    expect(read.value.owners?.adds).toHaveLength(4);

    const withPath = (raw: unknown) =>
      readInviteLink(`${inviteLink(invite, secret)}&o=${base64Url(utf8(canonicalJson(raw)))}`);
    const codeOf = (raw: unknown) => {
      const result = withPath(raw);
      return result.ok ? null : result.error.code;
    };
    // A missing first link reads, but its root is not the world's maker: the join refuses it.
    const short = withPath(adds.slice(1, 4));
    expect(short.ok && inviteRoot(short.value)).toBe(keyOf(BEN));
    expect(codeOf([adds[0], adds[2], adds[3]])).toBe("invite-owners-invalid");
    expect(codeOf(adds.slice(0, 3))).toBe("invite-owners-invalid");
    expect(codeOf(adds.slice(0, 5))).toBe("invite-owners-invalid");
    expect(codeOf([])).toBe("invite-owners-invalid");
    expect(codeOf([{ ...adds[0], body: { key: keyOf(CAT) } }, ...adds.slice(1, 4)])).toBe(
      "invite-owners-invalid",
    );
    const other = new Script(undefined, "Another Orchard");
    const elsewhere = other.write("owner.add", { key: keyOf(BEN) }, OWNER);
    expect(codeOf([elsewhere, ...adds.slice(1, 4)])).toBe("invite-owners-invalid");
    const toMaker = sign(log.world, "owner.add", { key: keyOf(OWNER) }, CAT, 1);
    const toEve = sign(log.world, "owner.add", { key: keyOf(EVE) }, OWNER, 1);
    expect(codeOf([adds[0], adds[1], toMaker, toEve])).toBe("invite-owners-invalid");
    expect(readInviteLink(`${inviteLink(invite, secret)}&o=!!`).ok).toBe(false);
  });

  it("admits by a co-owner's invite only while the signer owns the world (5)", () => {
    const log = new Script();
    log.write("owner.add", { key: keyOf(BEN) }, OWNER);
    const ticket = inviteBy(log.world, BEN, 7);
    const proof = signJoinProof(ticket.secret, ticket.invite, keyOf(CAT));
    expect(verifyInvite(log.now, ticket.invite, proof, keyOf(CAT), at(2)).ok).toBe(true);
    const { sig: _sig, ...unsigned } = ticket.invite;
    const forged = verifyInvite(log.now, signInvite(unsigned, CAT), proof, keyOf(CAT), at(2));
    expect(forged.ok ? null : forged.error.code).toBe("invite-sig-invalid");
    log.write("owner.remove", { key: keyOf(BEN) }, OWNER);
    const late = verifyInvite(log.now, ticket.invite, proof, keyOf(CAT), at(2));
    expect(late.ok ? null : late.error.code).toBe("invite-not-owner");
  });
});

describe("world protocol 2", () => {
  it("says a world with co-owners needs 2, and shows how protocol 1 folds it apart (6)", () => {
    const log = new Script();
    log.write("witness", witnessBody(3, 1, "Well"), OWNER);
    expect(protocolFor(log.now)).toBe(1);
    log.write("owner.add", { key: keyOf(BEN) }, BEN);
    expect(protocolFor(log.now)).toBe(1);
    const add = log.write("owner.add", { key: keyOf(BEN) }, OWNER);
    const witness = log.write("witness", witnessBody(4, 1, "Mill"), BEN);
    expect(protocolFor(log.now)).toBe(2);
    expect(log.now.chunks["4,1"]?.live.id).toBe(witness.id);
    // A protocol-1 build does not know owner.add: it skips it, then refuses what Ben writes.
    const old = foldEntries(
      emptyNow(log.genesis),
      log.entries.map((entry) => ({
        entry,
        verdict:
          entry.event.id === add.id
            ? { ok: false as const, code: "event-kind-unknown" }
            : signatureVerdict(entry.event),
      })),
    );
    expect(old.chunks["4,1"]).toBeUndefined();
    const chained = new Script();
    chained.write("chain", { record: true }, OWNER);
    expect([protocolFor(chained.now), chainRecording(chained.now)]).toEqual([2, true]);
    chained.write("chain", { record: false }, OWNER);
    expect(chainRecording(chained.now)).toBe(false);
    expect(chainRecording(new Script().now)).toBe(false);
  });
});

describe("adoption (D1)", () => {
  it("leaves co-owners and the chain opt-in with the old world (7)", () => {
    const log = new Script();
    log.write("owner.add", { key: keyOf(BEN) }, OWNER);
    log.write("chain", { record: true }, OWNER);
    log.write("profile", { name: "Mira" }, OWNER);
    log.write("owner.remove", { key: keyOf(BEN) }, OWNER);
    const adopter = secretOf("owners:adopter");
    const key: DeviceKey = {
      author: authorKeyFor(adopter),
      signEvent: (unsigned) => signEvent(unsigned, adopter),
      signInvite: (unsigned) => signInvite(unsigned, adopter),
      signWsAuth: () => "",
      blobAuth: () => "",
      signWorldFile: () => "",
      account: { signIn: () => "", pairing: () => "", keyChange: () => "" },
    };
    const adopted = adoptLog(log.entries, log.genesis, key, signatureVerdict);
    const kinds = adopted.entries.map((entry) => entry.event.kind);
    expect(kinds).toEqual(["genesis", "profile"]);
    expect(adopted.dropped.map((one) => [one.what, one.code])).toEqual([
      ["owner.add", "adopt-not-carried"],
      ["chain", "adopt-not-carried"],
      ["owner.remove", "adopt-not-carried"],
    ]);
    const now = foldEntries(
      emptyNow(adopted.genesis),
      adopted.entries.map((entry) => ({ entry, verdict: signatureVerdict(entry.event) })),
    );
    expect([currentOwners(now), now.provenance, protocolFor(now)]).toEqual([[key.author], null, 1]);
  });
});

describe("physics (8)", () => {
  it("adds no care and changes no beat decision", () => {
    for (const kind of ["owner.add", "owner.remove", "chain"] as const) {
      expect(CARE_POINTS[kind]).toBeUndefined();
    }
    const plain = new Script();
    const mixed = new Script();
    const both = <K extends EventKind>(kind: K, body: EventBodies[K]) => {
      const event = signEvent(
        {
          v: 1,
          world: plain.world,
          kind,
          author: keyOf(OWNER),
          at: at(0),
          seen: 0,
          body,
        } as UnsignedEventOf<K>,
        OWNER,
      );
      plain.push(event);
      mixed.push(event);
    };
    both("witness", witnessBody(3, 1, "Well"));
    mixed.write("owner.add", { key: keyOf(BEN) }, OWNER);
    both("witness", witnessBody(4, 2, "Mill"));
    mixed.write("chain", { record: true }, OWNER);
    both("visit", { chunks: [{ cx: 3, cz: 1 }] });
    mixed.write("owner.remove", { key: keyOf(BEN) }, OWNER);
    expect(mixed.now.touches).toEqual(plain.now.touches);
    expect(mixed.now.lastTouch).toEqual(plain.now.lastTouch);
    const beat = (now: WorldNow) => {
      const computed = computeBeat(now, at(80));
      if (!computed.ok) throw new Error(computed.error.message);
      const { fog, season, slots } = computed.value.body;
      return { fog, season, slots, care: computed.value.care };
    };
    expect(beat(mixed.now)).toEqual(beat(plain.now));
  });
});
