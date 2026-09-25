// The protocol core of a world's shared history (rev 6 phase 3, WP1a: D2, D5 steps 1–3, D8, D9).
// Crypto, untrusted input and identity on disk: none of it is reachable by E2E (Rule 0). What this
// file guards, written before the code:
//   1. A forged signature verifies: another key's signature, a body changed after signing, a
//      signature moved onto another event, a non-canonical spelling of a key or a signature.
//   2. An event whose id does not match its content is accepted.
//   3. Canonical JSON depends on key order, or differs from the copy main hashes cartridges with
//      (`main/cartridges/integrity.ts`), so one value would get two ids; or it drops an own
//      "__proto__" key (JSON.parse makes one), so a value changed after signing keeps its id and
//      signature — found by review.
//   4. A broken, reordered or wrong-key chain verifies: an entry skipped, swapped or edited, a
//      receipt time going backwards; or the receipt schedule (D2) is wrong — a receipt missing or
//      from another key once the log has a sequencer, a receipt on a local log, a rehost that does
//      not switch keys at its own entry, a sequencer event not written by the owner installing a
//      key, or a batch that attaches the world being verified without the prefix it re-receipts.
//   5. A malformed or oversized event is read: an unknown kind or format not reported as such
//      (the fold counts those as "from a newer build"), extra envelope fields, a genesis naming a
//      world, more than 128 KiB, a control character in a name; or reading changes the value.
//   6. An oversized or malformed frame is read: over 256 KiB, not JSON, an unknown message, more
//      than 16 events per submit, a bad claim target, a presence out of range — or a frame the
//      writer produced is refused by the reader.
//   7. A tampered invite link still carries a valid invite, or one whose secret is not the
//      invite's key reads; a join proof made for one key verifies for another (a replayed
//      `member.join`); a blob request verifies with another body or a stale time; a WebSocket
//      answer verifies for another challenge.

import { canonicalJson as mainCanonicalJson } from "@main/cartridges/integrity";
import { canonicalJson } from "@shared/canonical";
import { inviteLink, readInviteLink } from "@shared/history/access";
import { readEvent } from "@shared/history/event";
import { base32, base64Url, fromBase32, fromBase64Url, sha256Bytes } from "@shared/history/ids";
import {
  type LogCursor,
  logStart,
  sequenceEvent,
  verifyLog,
  withReceipt,
} from "@shared/history/log";
import {
  authorKeyFor,
  blobAuthHeader,
  eventIdOf,
  inviteSigned,
  joinProofValid,
  readBlobAuth,
  signEvent,
  signInvite,
  signJoinProof,
  signWsAuth,
  verifyEvent,
  verifyWsAuth,
} from "@shared/history/sign";
import type { GenesisBody, LogEntry, StoredEvent } from "@shared/history/types";
import { frameText, readFromService, readToService } from "@shared/worldProtocol";
import { describe, expect, it } from "vitest";

const secret = (name: string) => sha256Bytes(`history-test:${name}`);
const OWNER = secret("owner");
const OTHER = secret("other");
const SERVICE = secret("service");
const HASH = `sha256:${"ab".repeat(32)}` as const;

function genesisBody(name = "Glass Harbor"): GenesisBody {
  return {
    name,
    cartridge: { cartridgeId: "glass-harbor", version: "1.0.0", contentHash: HASH },
    seed: "K7QM-2PXD",
    language: "en",
    physicsVersion: 1,
    createdAt: "2026-09-26T10:00:00.000Z",
    access: "friends",
    gates: [{ id: "e1", cx: 2, cz: 1 }],
    from: { instanceId: "glass-harbor-1" },
  };
}

function genesis(name?: string) {
  return signEvent(
    {
      v: 1,
      world: "",
      kind: "genesis",
      author: authorKeyFor(OWNER),
      at: "2026-09-26T10:00:00.000Z",
      seen: 0,
      body: genesisBody(name),
    },
    OWNER,
  );
}

function profile(world: string, name: string, who = OWNER, seen = 1) {
  return signEvent(
    {
      v: 1,
      world,
      kind: "profile",
      author: authorKeyFor(who),
      at: "2026-09-26T10:05:00.000Z",
      seen,
      body: { name },
    },
    who,
  );
}

/** Sequences `events` from the log's start; `keyAt(n)` signs entry n's receipt (null: none). */
function logOf(
  events: StoredEvent[],
  rts: string[],
  keyAt: (n: number) => Uint8Array | null = () => null,
): LogEntry[] {
  let cursor: LogCursor = logStart(events[0]?.id ?? "");
  return events.map((event, index) => {
    const entry = sequenceEvent(cursor, event, rts[index] ?? RTS[2] ?? "", keyAt(index + 1));
    cursor = { n: entry.n, chain: entry.chain, rt: entry.rt };
    return entry;
  });
}

function sequencer(world: string, key: Uint8Array, seen: number, by = OWNER) {
  return signEvent(
    {
      v: 1,
      world,
      kind: "sequencer",
      author: authorKeyFor(by),
      at: "2026-09-26T12:00:00.000Z",
      seen,
      body: { url: "wss://worlds.example", key: authorKeyFor(key) },
    },
    by,
  );
}

const RTS = ["2026-09-26T10:00:01.000Z", "2026-09-26T10:06:00.000Z", "2026-09-26T11:00:00.000Z"];

describe("event signatures and ids (1, 2)", () => {
  it("verifies what its author signed, and nothing else", () => {
    const event = genesis();
    expect(verifyEvent(event).ok).toBe(true);
    expect(event.id).toMatch(/^h[a-z2-7]{52}$/);

    const byOther = signEvent({ ...event, author: authorKeyFor(OWNER) }, OTHER);
    expect(verifyEvent(byOther)).toMatchObject({ ok: false, error: { code: "event-sig-invalid" } });

    const renamed = { ...event, body: { ...event.body, name: "Stolen Harbor" } };
    expect(verifyEvent(renamed)).toMatchObject({
      ok: false,
      error: { code: "event-id-mismatch" },
    });

    const moved = { ...genesis("Other Harbor"), sig: event.sig };
    expect(verifyEvent(moved)).toMatchObject({ ok: false, error: { code: "event-sig-invalid" } });

    const wrongId = { ...event, id: genesis("Other Harbor").id };
    expect(verifyEvent(wrongId)).toMatchObject({ ok: false, error: { code: "event-id-mismatch" } });
  });

  it("gives a key and a signature exactly one spelling", () => {
    const event = genesis();
    const key = event.author;
    // 32 bytes end on one data bit: 'a' or 'q' is canonical, 'b' decodes to the same bytes.
    const respelled = `${key.slice(0, -1)}${key.endsWith("a") ? "b" : "r"}`;
    expect(fromBase32(respelled.slice(1))).toBeNull();
    expect(verifyEvent({ ...event, author: respelled }).ok).toBe(false);

    const sig = event.sig;
    const last = sig.at(-1) ?? "A";
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const sibling = alphabet[(alphabet.indexOf(last) & ~15) | ((alphabet.indexOf(last) + 1) & 15)];
    const resigned = `${sig.slice(0, -1)}${sibling}`;
    expect(fromBase64Url(resigned)).toBeNull();
    expect(verifyEvent({ ...event, sig: resigned }).ok).toBe(false);

    const bytes = sha256Bytes("round trip");
    expect(fromBase32(base32(bytes))).toEqual(bytes);
    expect(fromBase64Url(base64Url(bytes))).toEqual(bytes);
  });
});

describe("canonical JSON (3)", () => {
  const samples: unknown[] = [
    { b: 1, a: { d: [3, { z: 1, y: 2 }], c: null }, é: "ü", "": 0 },
    [{ b: 2, a: 1 }, "x", 1.5, -0, 1e21, true, null],
    { keep: undefined, n: Number.NaN, nested: { list: [] as unknown[], empty: {} } },
    "a line\ud800",
    42,
  ];

  it("does not depend on key order", () => {
    const a = { world: "", kind: "profile", body: { name: "Ann", z: [1, 2] } };
    const b = { body: { z: [1, 2], name: "Ann" }, kind: "profile", world: "" };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(eventIdOf(a)).toBe(eventIdOf(b));
  });

  it("is byte-identical to the copy main hashes cartridges with", () => {
    for (const sample of samples) expect(canonicalJson(sample)).toBe(mainCanonicalJson(sample));
  });

  it("keeps an own __proto__ key, so a value changed after signing no longer verifies", () => {
    const plain = JSON.parse('{"a":1}');
    const smuggled = JSON.parse('{"a":1,"__proto__":"x"}');
    expect(canonicalJson(smuggled)).toBe('{"__proto__":"x","a":1}');
    expect(canonicalJson(smuggled)).not.toBe(canonicalJson(plain));
    const signed = profile(genesis().id, "Mira");
    const tampered = JSON.parse(
      JSON.stringify(signed).replace('"name":"Mira"', '"name":"Mira","__proto__":"injected"'),
    );
    expect(verifyEvent(tampered).ok).toBe(false);
  });
});

describe("the log chain and its receipts (4)", () => {
  const first = genesis();
  const events = [first, profile(first.id, "Mira"), profile(first.id, "Mira again", OWNER, 2)];
  const code = (result: { ok: boolean; error?: { code: string } }) =>
    result.ok ? "ok" : result.error?.code;

  it("verifies a local log and refuses a skipped, swapped or edited one", () => {
    const log = logOf(events, RTS);
    expect(verifyLog(first.id, log)).toMatchObject({ ok: true, value: { cursor: { n: 3 } } });

    const skipped = [log[0], log[2]] as LogEntry[];
    expect(code(verifyLog(first.id, skipped))).toBe("entry-out-of-order");
    const swapped = [log[0], { ...log[2], n: 2 }, { ...log[1], n: 3 }] as LogEntry[];
    expect(code(verifyLog(first.id, swapped))).toBe("entry-chain-broken");
    const edited = log.map((entry, index) =>
      index === 1 ? { ...entry, rt: "2026-09-26T10:07:00.000Z" } : entry,
    );
    expect(verifyLog(first.id, edited).ok).toBe(false);
    const otherWorld = logOf([genesis("Elsewhere"), ...events.slice(1)], RTS);
    expect(code(verifyLog(first.id, otherWorld))).toBe("log-no-genesis");
    expect(
      code(
        verifyLog(
          first.id,
          log.map((entry) => withReceipt(entry, SERVICE)),
        ),
      ),
    ).toBe("entry-rsig-unexpected");
  });

  it("never lets receipt time run backwards, and a sequencer clamps it", () => {
    const backwards = logOf(events, [RTS[0], RTS[2], RTS[1]] as string[]);
    expect(backwards[2]?.rt).toBe(RTS[2]);
    expect(verifyLog(first.id, backwards).ok).toBe(true);
    const second = backwards[1] as LogEntry;
    const early = sequenceEvent(
      { n: 2, chain: second.chain, rt: null },
      (backwards[2] as LogEntry).event,
      RTS[1] as string,
      null,
    );
    expect(code(verifyLog(first.id, [...backwards.slice(0, 2), early]))).toBe("entry-rt-backwards");
  });

  it("follows the receipt schedule: K1 from the first sequencer back to entry 1, then each rehost", () => {
    const attach = sequencer(first.id, SERVICE, 3);
    const later = profile(first.id, "Mira at sea", OWNER, 4);
    const rehost = sequencer(first.id, OTHER, 5);
    const last = profile(first.id, "Mira ashore", OWNER, 6);
    const all = [...events, attach, later, rehost, last];
    const keyed = (n: number) => (n < 6 ? SERVICE : OTHER);
    const log = logOf(all, [], keyed);
    const checked = verifyLog(first.id, log);
    expect(checked.ok && checked.value.schedule.map((step) => step.n)).toEqual([4, 6]);

    expect(
      code(
        verifyLog(
          first.id,
          logOf(all, [], () => SERVICE),
        ),
      ),
    ).toBe("entry-rsig-invalid");
    expect(
      code(
        verifyLog(
          first.id,
          logOf(all, [], () => OTHER),
        ),
      ),
    ).toBe("entry-rsig-invalid");
    const unsignedPrefix = logOf(all, [], (n) => (n < 4 ? null : keyed(n)));
    expect(code(verifyLog(first.id, unsignedPrefix))).toBe("entry-rsig-invalid");

    const prefix = log.slice(0, 3);
    const cursor = { n: 3, chain: prefix[2]?.chain ?? "", rt: prefix[2]?.rt ?? null };
    const owner = authorKeyFor(OWNER);
    expect(code(verifyLog(first.id, log.slice(3), { from: cursor, owner }))).toBe(
      "log-attach-partial",
    );
    const head = verifyLog(first.id, log.slice(0, 5));
    if (!head.ok) throw new Error(head.error.message);
    const rest = verifyLog(first.id, log.slice(5), {
      ...head.value,
      from: head.value.cursor,
      owner,
    });
    expect(rest.ok && rest.value.schedule.map((step) => step.n)).toEqual([4, 6]);
  });

  it("installs no key from a sequencer event the owner did not write", () => {
    const forged = sequencer(first.id, OTHER, 3, OTHER);
    const log = logOf([...events, forged], []);
    const checked = verifyLog(first.id, log);
    expect(checked.ok && checked.value.schedule).toEqual([]);
    expect(
      code(
        verifyLog(
          first.id,
          logOf([...events, forged], [], () => OTHER),
        ),
      ),
    ).toBe("entry-rsig-unexpected");
  });
});

describe("reading events (5)", () => {
  const event = genesis();

  it("reports unknown kinds and formats as their own codes", () => {
    expect(readEvent({ ...event, kind: "trade" })).toMatchObject({
      ok: false,
      error: { code: "event-kind-unknown" },
    });
    expect(readEvent({ ...event, v: 2 })).toMatchObject({
      ok: false,
      error: { code: "event-version-unknown" },
    });
  });

  it("refuses extra fields, a genesis that names a world, blank or control-character names", () => {
    expect(readEvent({ ...event, extra: 1 })).toMatchObject({ error: { code: "event-invalid" } });
    expect(readEvent({ ...event, world: event.id })).toMatchObject({
      error: { code: "event-invalid" },
    });
    const note = profile(event.id, "Ann");
    expect(readEvent({ ...note, world: "" })).toMatchObject({ error: { code: "event-invalid" } });
    expect(readEvent(profile(event.id, "An\u0007n"))).toMatchObject({
      error: { code: "event-invalid" },
    });
    expect(readEvent(profile(event.id, "   "))).toMatchObject({ error: { code: "event-invalid" } });
    expect(readEvent([event]).ok).toBe(false);
  });

  it("refuses more than 128 KiB, and returns exactly what the author hashed", () => {
    const big = { ...genesisBody(), seed: "x".repeat(96), name: "界".repeat(60) };
    const padded = { ...event, body: { ...big, pad: "界".repeat(50_000) } };
    expect(readEvent(padded)).toMatchObject({ error: { code: "event-too-large" } });
    const read = readEvent(JSON.parse(JSON.stringify(event)));
    expect(read.ok && verifyEvent(read.value).ok).toBe(true);
    expect(read.ok && canonicalJson(read.value)).toBe(canonicalJson(event));
  });
});

describe("service frames (6)", () => {
  const world = genesis().id;
  const events = Array.from({ length: 17 }, (_, index) => profile(world, `Ann ${index}`));

  it("refuses oversized, non-JSON and unknown frames", () => {
    expect(readToService("x".repeat(256 * 1024 + 1))).toMatchObject({
      error: { code: "frame-too-large" },
    });
    expect(readToService("{not json")).toMatchObject({ error: { code: "frame-not-json" } });
    expect(readToService(JSON.stringify({ t: "delete", world }))).toMatchObject({
      error: { code: "frame-invalid" },
    });
    expect(readToService(JSON.stringify({ t: "close", world, extra: true })).ok).toBe(false);
    expect(readToService(JSON.stringify({ t: "close", world: "nope" })).ok).toBe(false);
  });

  it("caps a submit at 16 events and checks claim targets and presence", () => {
    const submit = (count: number) =>
      readToService(JSON.stringify({ t: "submit", world, events: events.slice(0, count) }));
    expect(submit(16).ok).toBe(true);
    expect(submit(17).ok).toBe(false);
    const claim = (target: string) => readToService(JSON.stringify({ t: "claim", world, target }));
    expect(claim("chunk:3,-4").ok).toBe(true);
    expect(claim("chapter:e12").ok).toBe(true);
    expect(claim(`rumors:${world}`).ok).toBe(true);
    expect(claim("chunk:3").ok).toBe(false);
    expect(claim("chapter:e0").ok).toBe(false);
    expect(claim("rumors:beat").ok).toBe(false);
    const presence = (p: unknown) => readToService(JSON.stringify({ t: "presence", world, p }));
    const here = { x: 10.5, z: -3, facing: "east", moving: true, place: null, emote: null };
    expect(presence(here).ok).toBe(true);
    expect(presence(null).ok).toBe(true);
    expect(presence({ ...here, facing: "up" }).ok).toBe(false);
    expect(presence({ ...here, x: 1e12 }).ok).toBe(false);
    expect(presence({ ...here, emote: { kind: "dance", n: 1 } }).ok).toBe(false);
    expect(presence({ ...here, name: "spoofed" }).ok).toBe(false);
    expect(presence({ ...here, place: "pab2c3d4e" }).ok).toBe(true);
    expect(presence({ ...here, place: "p12345678" }).ok).toBe(false);
  });

  it("carries a join only as invite plus proof, and the sequencer only on the last attach", () => {
    const open = (extra: object) =>
      readToService(
        JSON.stringify({
          t: "open",
          world,
          have: 0,
          chain: null,
          protocol: 1,
          physics: [1],
          ...extra,
        }),
      );
    expect(open({}).ok).toBe(true);
    expect(open({ join: { invite: "x", proof: "y" } }).ok).toBe(false);
    expect(open({ invite: {} }).ok).toBe(false);
    const attach = (last: boolean, extra: object) =>
      readToService(JSON.stringify({ t: "attach", world, entries: [], last, ...extra }));
    const seq = sequencer(world, SERVICE, 1);
    expect(attach(true, { sequencer: seq }).ok).toBe(true);
    expect(attach(false, {}).ok).toBe(true);
    expect(attach(true, {}).ok).toBe(false);
    expect(attach(false, { sequencer: seq }).ok).toBe(false);
  });

  it("reads what the writer wrote, and the writer refuses what the reader would", () => {
    const log = logOf([genesis(), profile(world, "Mira")], RTS.slice(0, 2), () => SERVICE);
    const text = frameText({ t: "entries", world, entries: log, head: { n: 2, chain: "x" } });
    expect(text.ok).toBe(true);
    // A head whose chain is neither the world id nor a hash is malformed.
    expect(text.ok && readFromService(text.value).ok).toBe(false);
    const good = frameText({
      t: "entries",
      world,
      entries: log,
      head: { n: 2, chain: log[1]?.chain ?? "" },
    });
    expect(good.ok && readFromService(good.value)).toMatchObject({ ok: true });
    const huge = frameText({
      t: "stream",
      world,
      sid: "abcdefgh",
      k: 1,
      text: "界".repeat(90_000),
    });
    expect(huge).toMatchObject({ ok: false, error: { code: "frame-too-large" } });
  });
});

describe("invites, join proofs, blob requests and WebSocket answers (7)", () => {
  const world = genesis().id;
  const secretOfInvite = secret("invite");
  const invite = signInvite(
    {
      v: 1,
      world,
      svc: "wss://worlds.example",
      by: authorKeyFor(OWNER),
      key: authorKeyFor(secretOfInvite),
      nonce: "abcdefghijklmnop",
      exp: "2026-10-01T00:00:00.000Z",
      uses: 2,
    },
    OWNER,
  );

  it("carries an invite and its secret through the link; a tampered one fails", () => {
    const link = inviteLink(invite, secretOfInvite);
    expect(readInviteLink(link)).toEqual({ ok: true, value: { invite, secret: secretOfInvite } });
    expect(inviteSigned(invite)).toBe(true);
    const tampered = readInviteLink(inviteLink({ ...invite, uses: 20 }, secretOfInvite));
    expect(tampered.ok && inviteSigned(tampered.value.invite)).toBe(false);
    expect(readInviteLink(inviteLink(invite, secret("someone else"))).ok).toBe(false);
    expect(readInviteLink(link.replace(/&k=.*$/, "")).ok).toBe(false);
    expect(readInviteLink(`${link.slice(0, -4)}!!!!`).ok).toBe(false);
    expect(readInviteLink("https://example.com").ok).toBe(false);
  });

  it("binds a join proof to the joiner's key", () => {
    const joiner = authorKeyFor(secret("joiner"));
    const proof = signJoinProof(secretOfInvite, invite, joiner);
    expect(joinProofValid(invite, proof, joiner)).toBe(true);
    expect(joinProofValid(invite, proof, authorKeyFor(OTHER))).toBe(false);
    expect(joinProofValid({ ...invite, nonce: "bbbbbbbbbbbbbbbb" }, proof, joiner)).toBe(false);
    const byOwnerKey = signJoinProof(OWNER, invite, joiner);
    expect(joinProofValid(invite, byOwnerKey, joiner)).toBe(false);
  });

  it("verifies a blob request only for its body and within ±300 s", () => {
    const body = new TextEncoder().encode("pack bytes");
    const header = blobAuthHeader(OWNER, { method: "PUT", path: "/v1/x", ts: 1_000, body });
    const request = { method: "PUT", path: "/v1/x", body, nowS: 1_200 };
    expect(readBlobAuth(header, request)).toEqual({ ok: true, value: authorKeyFor(OWNER) });
    expect(readBlobAuth(header, { ...request, body: new Uint8Array([1]) }).ok).toBe(false);
    expect(readBlobAuth(header, { ...request, path: "/v1/y" }).ok).toBe(false);
    expect(readBlobAuth(header, { ...request, nowS: 1_301 })).toMatchObject({
      error: { code: "blob-auth-stale" },
    });
  });

  it("answers one WebSocket challenge from one service only", () => {
    const service = authorKeyFor(SERVICE);
    const sig = signWsAuth(OWNER, "noncenoncenonce1", service);
    expect(verifyWsAuth(authorKeyFor(OWNER), sig, "noncenoncenonce1", service)).toBe(true);
    expect(verifyWsAuth(authorKeyFor(OWNER), sig, "noncenoncenonce2", service)).toBe(false);
    expect(verifyWsAuth(authorKeyFor(OWNER), sig, "noncenoncenonce1", authorKeyFor(OTHER))).toBe(
      false,
    );
  });
});
