// The world service's door and quotas (rev 6 phase 3, WP4: D8 access, D9 anti-flood, D10 blobs).
// Only what E2E cannot reach: keys that are not who they say, and floods. What this file guards,
// written before the code:
//   1. An unauthorized read: a non-member opens a friends world, a member opens a private one, an
//      invite proof made for another key (or a forged one) lets a key in, a removed member keeps
//      receiving entries or reopens, a blob is served to someone who may not read the world.
//   2. An unauthorized write is sequenced: a visitor's witness, an event signed by another key
//      than the connection's, a sequencer naming another key, a client's beat, a visitor's blob.
//   3. Spent quotas block members: the visitors' shared budget, the per-visitor-key count and the
//      new-visitor-keys-per-address cap refuse visitors only; a full world still takes the owner's
//      door changes; per-kind member quotas refuse only that kind.
//   4. One author writes more than one variant of the same target.

import { mayRead } from "@shared/history/access";
import { blobAuthHeader, signJoinProof } from "@shared/history/sign";
import { describe, expect, it } from "vitest";
import { handleHttp } from "../../src/service/http";
import { sha256File } from "../../src/service/store";
import {
  ANN,
  at,
  attach,
  BEN,
  Client,
  headOf,
  keyOf,
  LocalWorld,
  makeService,
  noteBody,
  OWNER,
  secretOf,
  sign,
  VIC,
  witnessBody,
} from "./support";

function setup(access: "friends" | "public" | "private" = "friends", limits = {}) {
  const service = makeService({ limits });
  const world = new LocalWorld({ access });
  const owner = new Client(service.hub, OWNER);
  attach(owner, world);
  const next = (secret: Uint8Array) => (kind: Parameters<typeof sign>[1], body: never) =>
    sign(world.id, kind, body, secret, headOf(service.hub, world.id));
  return { ...service, world, owner, next };
}

/** Joins `who` through the service with a fresh invite; returns its client. */
function join(s: ReturnType<typeof setup>, who: Uint8Array, name: string, ip = "10.0.0.1"): Client {
  const ticket = s.world.invite();
  const client = new Client(s.hub, who, ip);
  const proof = signJoinProof(ticket.secret, ticket.invite, keyOf(who));
  client.open(s.world.id, 0, null, { join: { invite: ticket.invite, proof } } as never);
  const seen = headOf(s.hub, s.world.id);
  client.submit(
    s.world.id,
    sign(s.world.id, "member.join", { invite: ticket.invite, name, proof }, who, seen),
  );
  return client;
}

describe("reads (1)", () => {
  it("keeps a friends world to members and invitees with their own proof", () => {
    const s = setup();
    const stranger = new Client(s.hub, VIC);
    stranger.open(s.world.id);
    expect(stranger.last("refused")?.error.code).toBe("access-members-only");
    expect(stranger.last("opened")).toBeUndefined();

    const ticket = s.world.invite({ uses: 3 });
    const forger = new Client(s.hub, BEN);
    const stolen = signJoinProof(ticket.secret, ticket.invite, keyOf(ANN));
    forger.open(s.world.id, 0, null, { join: { invite: ticket.invite, proof: stolen } } as never);
    expect(forger.last("refused")?.error.code).toBe("invite-proof-invalid");

    const ann = new Client(s.hub, ANN);
    ann.open(s.world.id, 0, null, { join: { invite: ticket.invite, proof: stolen } } as never);
    expect(ann.last("opened")?.role).toBe("invitee");
    const joinEvent = sign(
      s.world.id,
      "member.join",
      { invite: ticket.invite, name: "Ann", proof: stolen },
      ANN,
      headOf(s.hub, s.world.id),
    );
    ann.submit(s.world.id, joinEvent);
    expect(ann.entries(s.world.id).at(-1)?.event.id).toBe(joinEvent.id);
    // Ben holds an invite of his own, but copies Ann's logged join (her proof, a use left).
    const own = s.world.invite();
    const ownProof = signJoinProof(own.secret, own.invite, keyOf(BEN));
    forger.open(s.world.id, 0, null, { join: { invite: own.invite, proof: ownProof } } as never);
    expect(forger.last("opened")?.role).toBe("invitee");
    const copied = { invite: ticket.invite, name: "Ben", proof: stolen };
    forger.submit(
      s.world.id,
      sign(s.world.id, "member.join", copied, BEN, headOf(s.hub, s.world.id)),
    );
    expect(forger.last("rejected")?.error.code).toBe("invite-proof-invalid");
    expect(s.hub.worlds.get(s.world.id)?.now.members[keyOf(BEN)]).toBeUndefined();
  });

  it("drops a removed member at once and keeps a private world to its owner", () => {
    const s = setup();
    const ann = join(s, ANN, "Ann");
    expect(s.hub.worlds.get(s.world.id)?.now.members[ann.key]).toBeDefined();
    ann.clear();
    s.owner.submit(s.world.id, s.next(OWNER)("member.remove", { key: ann.key } as never));
    expect(ann.last("refused")?.error.code).toBe("access-removed");
    expect(ann.all("entries")).toEqual([]);
    ann.open(s.world.id);
    expect(ann.last("refused")?.error.code).toBe("access-removed");
    s.owner.submit(s.world.id, s.next(OWNER)("note", noteBody() as never));
    expect(ann.all("entries")).toEqual([]);

    const ben = join(s, BEN, "Ben");
    s.owner.submit(s.world.id, s.next(OWNER)("access", { policy: "private" } as never));
    expect(ben.last("refused")?.error.code).toBe("access-private");
    ben.open(s.world.id);
    expect(ben.last("refused")?.error.code).toBe("access-private");
  });

  it("serves blobs only to readers, and takes them only from writers", async () => {
    const s = setup();
    const bytes = new TextEncoder().encode("a cartridge pack");
    const hash = sha256File(bytes);
    const path = `/v1/worlds/${s.world.id}/blobs/${hash}`;
    const context = { hub: s.hub, test: false, advance: () => 0 };
    const request = (method: string, who: Uint8Array, body = new Uint8Array(0), ts?: number) =>
      handleHttp(
        context,
        new Request(`http://127.0.0.1${path}`, {
          method,
          ...(method === "PUT" ? { body } : {}),
          headers: {
            "x-unmapped-auth": blobAuthHeader(who, {
              method,
              path,
              ts: ts ?? Math.floor(Date.now() / 1000),
              body,
            }),
          },
        }),
      );
    expect((await request("PUT", VIC, bytes)).status).toBe(403);
    expect((await request("PUT", OWNER, new TextEncoder().encode("other"))).status).toBe(400);
    expect((await request("PUT", OWNER, bytes, Math.floor(Date.now() / 1000) - 400)).status).toBe(
      401,
    );
    expect((await request("PUT", OWNER, bytes)).status).toBe(201);
    expect((await request("GET", VIC)).status).toBe(403);
    const got = await request("GET", OWNER);
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(bytes);

    const ticket = s.world.invite();
    const invitee = new Client(s.hub, ANN);
    const proof = signJoinProof(ticket.secret, ticket.invite, keyOf(ANN));
    invitee.open(s.world.id, 0, null, { join: { invite: ticket.invite, proof } } as never);
    expect(mayRead(s.hub.worlds.get(s.world.id)?.now ?? ({} as never), keyOf(ANN))).toBe(false);
    expect((await request("GET", ANN)).status).toBe(200);
  });
});

describe("writes (2)", () => {
  it("sequences nothing a key may not write", () => {
    const s = setup("public");
    const vic = new Client(s.hub, VIC);
    vic.open(s.world.id);
    expect(vic.last("opened")?.role).toBe("visitor");
    const head = headOf(s.hub, s.world.id);
    const claims = [
      s.next(VIC)("witness", witnessBody(4, 4, "Moor") as never),
      s.next(OWNER)("note", noteBody() as never),
      s.next(VIC)("beat", {
        upTo: head,
        at: at(10),
        season: 1,
        fog: [],
        slots: [],
        fingerprint: `sha256:${"0".repeat(64)}`,
      } as never),
    ];
    vic.submit(s.world.id, ...claims);
    expect(vic.all("rejected").map((one) => one.error.code)).toEqual([
      "access-visitor-kind",
      "event-not-yours",
      "access-not-beater",
    ]);
    s.owner.submit(
      s.world.id,
      s.next(OWNER)("sequencer", { url: "wss://elsewhere.example", key: vic.key } as never),
    );
    expect(s.owner.last("rejected")?.error.code).toBe("sequencer-key-foreign");
    expect(headOf(s.hub, s.world.id)).toBe(head);
    vic.submit(s.world.id, s.next(VIC)("note", noteBody() as never));
    expect(headOf(s.hub, s.world.id)).toBe(head + 1);
  });
});

describe("quotas (3, 4)", () => {
  it("spends the visitors' shared budget without ever refusing a member", () => {
    const s = setup("public", { visitorEventsPerDay: 3, visitorEventsPerKeyPerDay: 2 });
    const member = join(s, ANN, "Ann");
    const visitors = [VIC, secretOf("v2"), secretOf("v3")].map((secret) => {
      const client = new Client(s.hub, secret);
      client.open(s.world.id);
      return { client, secret };
    });
    const note = (secret: Uint8Array, text: string) =>
      s.next(secret)("note", noteBody(text) as never);
    const [first, second, third] = visitors;
    if (first === undefined || second === undefined || third === undefined)
      throw new Error("setup");
    first.client.submit(s.world.id, note(first.secret, "one"));
    first.client.submit(s.world.id, note(first.secret, "two"));
    first.client.submit(s.world.id, note(first.secret, "three"));
    expect(first.client.codes()).toEqual(["quota-visitor-key"]);
    second.client.submit(s.world.id, note(second.secret, "four"));
    third.client.submit(s.world.id, note(third.secret, "five"));
    expect(third.client.codes()).toEqual(["quota-visitors"]);
    const head = headOf(s.hub, s.world.id);
    member.submit(s.world.id, note(ANN, "a member's note"));
    s.owner.submit(s.world.id, note(OWNER, "the owner's note"));
    expect(headOf(s.hub, s.world.id)).toBe(head + 2);
    expect([...member.codes(), ...s.owner.codes()]).toEqual([]);

    s.clock.ms += 86_400_000;
    third.client.submit(s.world.id, note(third.secret, "tomorrow"));
    expect(headOf(s.hub, s.world.id)).toBe(head + 3);
  });

  it("caps new visitor keys per address, not keys it already knows", () => {
    const s = setup("public", { newVisitorKeysPerIp: 2 });
    const from = (name: string) => {
      const secret = secretOf(name);
      const client = new Client(s.hub, secret, "10.9.9.9");
      client.open(s.world.id);
      client.submit(
        s.world.id,
        s.next(secret)("signpost", {
          coord: { cx: 1, cz: 1, x: 1, z: 1 },
          text: name,
          toward: null,
        } as never),
      );
      return client;
    };
    expect(from("a").codes()).toEqual([]);
    expect(from("b").codes()).toEqual([]);
    expect(from("c").codes()).toEqual(["quota-visitor-keys"]);
    expect(from("a").codes()).toEqual([]);
    const elsewhere = new Client(s.hub, secretOf("c"), "10.8.8.8");
    elsewhere.open(s.world.id);
    elsewhere.submit(s.world.id, s.next(secretOf("c"))("note", noteBody() as never));
    expect(elsewhere.codes()).toEqual([]);
  });

  it("refuses one kind when its share is spent, and all but the owner's door when full", () => {
    const s = setup("friends", { notePerDay: 1 });
    s.owner.submit(s.world.id, s.next(OWNER)("note", noteBody("one") as never));
    s.owner.submit(
      s.world.id,
      s.next(OWNER)("signpost", {
        coord: { cx: 1, cz: 1, x: 1, z: 1 },
        text: "up",
        toward: null,
      } as never),
    );
    expect(s.owner.codes()).toEqual(["quota-note"]);
    s.owner.submit(s.world.id, s.next(OWNER)("profile", { name: "Mira" } as never));
    expect(s.owner.codes()).toEqual(["quota-note"]);

    const full = setup("friends");
    const usage = full.hub.worlds.get(full.world.id)?.state.usage;
    full.hub.limits.worldBytes = (usage?.memberBytes ?? 0) + 10;
    full.owner.submit(full.world.id, full.next(OWNER)("profile", { name: "Mira" } as never));
    expect(full.owner.codes()).toEqual(["world-full"]);
    full.owner.submit(full.world.id, full.next(OWNER)("access", { policy: "public" } as never));
    expect(full.hub.worlds.get(full.world.id)?.now.access).toBe("public");
  });

  it("takes one variant per author and target", () => {
    const s = setup();
    const ann = join(s, ANN, "Ann");
    const seen = headOf(s.hub, s.world.id);
    s.owner.submit(s.world.id, s.next(OWNER)("witness", witnessBody(4, 0, "Moor") as never));
    const race = (name: string) => sign(s.world.id, "witness", witnessBody(4, 0, name), ANN, seen);
    ann.submit(s.world.id, race("Heath"));
    ann.submit(s.world.id, race("Fen"));
    expect(ann.codes()).toEqual(["quota-variant"]);
    const chunk = s.hub.worlds.get(s.world.id)?.now.chunks["4,0"];
    expect(chunk?.live.author).toBe(keyOf(OWNER));
    expect(chunk?.variants.map((one) => one.body.index.name)).toEqual(["Heath"]);
  });
});
