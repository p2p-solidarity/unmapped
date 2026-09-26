// The world service with co-owners (rev 6 phase 4, D5; world protocol 2). Only what E2E cannot
// reach: an old build's client, and keys that own a world without ever joining it. What this file
// guards, written before the code:
//   1. A protocol-1 client opens (or keeps reading) a world whose history holds co-owners or the
//      chain opt-in, and folds it differently from everyone else; or a protocol-1 client is
//      refused a world that holds none of them.
//   2. A co-owner who never joined as a member is treated as a visitor: its writes are refused or
//      paid from the visitors' shared budget.
//   3. An invite signed by a co-owner is refused while it owns the world, or still admits after
//      its owner.remove.

import { chainRecording } from "@shared/history/fold";
import { base32, sha256Bytes } from "@shared/history/ids";
import { signInvite, signJoinProof } from "@shared/history/sign";
import { describe, expect, it } from "vitest";
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
  OWNER,
  secretOf,
  sign,
  VIC,
  witnessBody,
} from "./support";

function setup() {
  const service = makeService();
  const world = new LocalWorld();
  const owner = new Client(service.hub, OWNER);
  attach(owner, world);
  const write = (who: Client, secret: Uint8Array, kind: Parameters<typeof sign>[1], body: never) =>
    who.submit(world.id, sign(world.id, kind, body, secret, headOf(service.hub, world.id)));
  const served = () => {
    const held = service.hub.worlds.get(world.id);
    if (held === undefined) throw new Error("the service lost the world");
    return held;
  };
  return { ...service, world, owner, write, served };
}

function inviteBy(world: string, who: Uint8Array, nonce: number) {
  const secret = secretOf(`owners-service:invite:${nonce}`);
  const invite = signInvite(
    {
      v: 1,
      world,
      svc: "ws://127.0.0.1:8787",
      by: keyOf(who),
      key: keyOf(secret),
      nonce: base32(sha256Bytes(`owners-service:nonce:${nonce}`)).slice(0, 20),
      exp: at(60),
      uses: 1,
    },
    who,
  );
  return { invite, secret };
}

describe("world protocol 2 (1)", () => {
  it("serves protocol 1 until the world holds co-owners, then refuses it", () => {
    const s = setup();
    const old = new Client(s.hub, OWNER, "10.0.0.2");
    old.open(s.world.id, 0, null, { protocol: 1 } as never);
    expect(old.last("opened")?.role).toBe("owner");
    old.clear();
    s.write(s.owner, OWNER, "owner.add", { key: keyOf(BEN) } as never);
    expect(old.codes()).toEqual(["protocol-newer"]);
    expect(old.all("entries")).toEqual([]);
    old.open(s.world.id, 0, null, { protocol: 1 } as never);
    expect(old.last("refused")?.error.code).toBe("protocol-newer");
    old.open(s.world.id, 0, null, { protocol: 3 } as never);
    expect(old.last("refused")?.error.code).toBe("protocol-unsupported");
    old.open(s.world.id);
    expect(old.last("opened")?.role).toBe("owner");
  });

  it("refuses protocol 1 once the world opted into the chain", () => {
    const s = setup();
    s.write(s.owner, OWNER, "chain", { record: true } as never);
    expect(chainRecording(s.served().now)).toBe(true);
    const old = new Client(s.hub, OWNER, "10.0.0.2");
    old.open(s.world.id, 0, null, { protocol: 1 } as never);
    expect(old.last("refused")?.error.code).toBe("protocol-newer");
  });
});

describe("co-owners on the service (2, 3)", () => {
  it("lets a co-owner who never joined write as an owner, paid as a member", () => {
    const s = setup();
    s.write(s.owner, OWNER, "owner.add", { key: keyOf(BEN) } as never);
    const ben = new Client(s.hub, BEN, "10.0.0.3");
    ben.open(s.world.id);
    expect(ben.last("opened")?.role).toBe("owner");
    const before = s.served().state.usage;
    s.write(ben, BEN, "witness", witnessBody(3, 1, "Well") as never);
    s.write(ben, BEN, "access", { policy: "public" } as never);
    expect(ben.codes()).toEqual([]);
    const after = s.served().state.usage;
    expect(after.visitorBytes).toBe(before.visitorBytes);
    expect(after.memberBytes).toBeGreaterThan(before.memberBytes);
    expect(s.served().now.chunks["3,1"]?.live.author).toBe(keyOf(BEN));
  });

  it("admits by a co-owner's invite only while it owns the world", () => {
    const s = setup();
    s.write(s.owner, OWNER, "owner.add", { key: keyOf(BEN) } as never);
    const ticket = inviteBy(s.world.id, BEN, 1);
    const ann = new Client(s.hub, ANN, "10.0.0.4");
    const proof = signJoinProof(ticket.secret, ticket.invite, keyOf(ANN));
    ann.open(s.world.id, 0, null, { join: { invite: ticket.invite, proof } } as never);
    expect(ann.last("opened")?.role).toBe("invitee");
    const join = { invite: ticket.invite, name: "Ann", proof };
    s.write(ann, ANN, "member.join", join as never);
    expect(s.served().now.members[keyOf(ANN)]).toBeDefined();

    s.write(s.owner, OWNER, "owner.remove", { key: keyOf(BEN) } as never);
    const late = inviteBy(s.world.id, BEN, 2);
    const vic = new Client(s.hub, VIC, "10.0.0.5");
    const vicProof = signJoinProof(late.secret, late.invite, keyOf(VIC));
    vic.open(s.world.id, 0, null, { join: { invite: late.invite, proof: vicProof } } as never);
    expect(vic.last("refused")?.error.code).toBe("invite-not-owner");
  });
});
