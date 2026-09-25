// Claims, leases and the stream relay (rev 6 phase 3, WP4: D15, D16). Only what E2E cannot reach:
// time running out and keys misbehaving. What this file guards, written before the code:
//   1. A lease never expires (a crashed claimant blocks a chunk forever): 90 s without a delta, or
//      10 minutes from its grant however many deltas, must end it — viewers get `end: "abort"`, the
//      holder is told, and the next claim is granted.
//   2. Two keys are granted the same target at once, or a late viewer misses the text so far.
//   3. A relayed delta carries a `from` the sender chose, comes from a key without the lease, or
//      exceeds the stream limits (size, deltas per second, one open stream, two live claims).
//   4. A claim is granted for what is already written, or to a key that may not write it; a
//      refusal leaves the client waiting (it must get `claimed: refused` with the code before it).
//   5. A lease outlives its target being written, or its holder's disconnect.

import { signJoinProof } from "@shared/history/sign";
import { describe, expect, it } from "vitest";
import {
  ANN,
  attach,
  BEN,
  Client,
  headOf,
  keyOf,
  LocalWorld,
  makeService,
  OWNER,
  sign,
  VIC,
  witnessBody,
} from "./support";

function world(access: "friends" | "public" = "friends", limits = {}) {
  const service = makeService({ limits });
  const local = new LocalWorld({ access });
  const owner = new Client(service.hub, OWNER);
  attach(owner, local);
  // Ben joins as a member: the viewer of every stream below.
  const ticket = local.invite();
  const proof = signJoinProof(ticket.secret, ticket.invite, keyOf(BEN));
  const viewer = new Client(service.hub, BEN);
  viewer.open(local.id, 0, null, { join: { invite: ticket.invite, proof } } as never);
  const body = { invite: ticket.invite, name: "Ben", proof };
  viewer.submit(local.id, sign(local.id, "member.join", body, BEN, headOf(service.hub, local.id)));
  if (viewer.codes().length > 0) throw new Error(viewer.codes().join());
  return { ...service, id: local.id, owner, viewer };
}

const chunk = (cx: number, cz = 0) => `chunk:${cx},${cz}` as const;

describe("leases (1, 2, 5)", () => {
  it("expires 90 s after the last delta, and 10 minutes after the grant in any case", () => {
    const { hub, clock, id, owner, viewer } = world("public");
    owner.send({ t: "claim", world: id, target: chunk(3) });
    const granted = owner.last("claimed");
    expect(granted?.status).toBe("granted");
    const sid = granted?.sid ?? "";
    owner.send({ t: "stream", world: id, sid, k: 0, text: "Scene(" });
    expect(viewer.last("stream")).toMatchObject({ from: owner.key, sid, k: 0, text: "Scene(" });

    viewer.send({ t: "claim", world: id, target: chunk(3) });
    expect(viewer.last("claimed")).toMatchObject({
      status: "writing",
      sid,
      by: owner.key,
      text: "Scene(",
    });

    clock.tick(89_000);
    hub.sweep();
    expect(viewer.last("stream")?.end).toBeUndefined();
    clock.tick(2_000);
    hub.sweep();
    expect(viewer.last("stream")).toMatchObject({ sid, k: 1, end: "abort" });
    expect(owner.last("refused")?.error.code).toBe("lease-expired");
    viewer.send({ t: "claim", world: id, target: chunk(3) });
    expect(viewer.last("claimed")?.status).toBe("granted");

    owner.send({ t: "claim", world: id, target: chunk(4) });
    const long = owner.last("claimed")?.sid ?? "";
    for (let k = 0; k < 11; k += 1) {
      clock.tick(60_000);
      owner.send({ t: "stream", world: id, sid: long, k, text: "." });
      hub.sweep();
    }
    expect(viewer.last("stream")).toMatchObject({ sid: long, end: "abort" });
  });

  it("frees a lease when its target is written or its holder leaves", () => {
    const { hub, id, owner, viewer } = world();
    owner.send({ t: "claim", world: id, target: chunk(3) });
    owner.submit(id, sign(id, "witness", witnessBody(3, 0, "Reed Ford"), OWNER, headOf(hub, id)));
    expect(hub.leases.all()).toEqual([]);
    const probe = new Client(hub, OWNER);
    probe.open(id);
    probe.send({ t: "claim", world: id, target: chunk(3) });
    expect(probe.last("claimed")).toMatchObject({ status: "written", n: headOf(hub, id) });

    owner.send({ t: "claim", world: id, target: chunk(5) });
    const sid = owner.last("claimed")?.sid;
    hub.disconnect(owner.session);
    expect(viewer.last("stream")).toMatchObject({ sid, end: "abort" });
    probe.send({ t: "claim", world: id, target: chunk(5) });
    expect(probe.last("claimed")?.status).toBe("granted");
  });
});

describe("the door and the limits (3, 4)", () => {
  it("refuses claims a key may not make, with the code first", () => {
    const { hub, id } = world("public");
    const visitor = new Client(hub, VIC);
    visitor.open(id);
    visitor.send({ t: "claim", world: id, target: chunk(2) });
    expect(visitor.peer.frames.slice(-2).map((frame) => frame.t)).toEqual(["refused", "claimed"]);
    expect(visitor.last("refused")?.error.code).toBe("access-visitor-kind");
    expect(visitor.last("claimed")?.status).toBe("refused");

    const owner = new Client(hub, OWNER);
    owner.open(id);
    owner.send({ t: "claim", world: id, target: "chapter:e9" });
    expect(owner.last("refused")?.error.code).toBe("chapter-episode-unknown");
    owner.send({ t: "claim", world: id, target: "more:e3" });
    expect(owner.last("refused")?.error.code).toBe("more-not-next");
    owner.send({ t: "claim", world: id, target: "more:e2" });
    expect(owner.last("claimed")?.status).toBe("granted");
  });

  it("holds each author to two claims, one open stream and the stream limits", () => {
    const { hub, clock, id, owner, viewer } = world("friends", {
      streamChars: 10,
      streamDeltasPerSecond: 3,
    });
    const grant = (target: string) => {
      owner.send({ t: "claim", world: id, target: target as never });
      return owner.last("claimed");
    };
    const a = grant(chunk(2))?.sid ?? "";
    const b = grant(chunk(3))?.sid ?? "";
    expect(grant(chunk(4))?.status).toBe("refused");
    expect(owner.last("refused")?.error.code).toBe("quota-claims");

    owner.send({ t: "stream", world: id, sid: a, k: 0, text: "abc" });
    owner.send({ t: "stream", world: id, sid: b, k: 0, text: "xyz" });
    expect(owner.last("refused")?.error.code).toBe("quota-streams");
    owner.send({ t: "stream", world: id, sid: a, k: 1, text: "defghijk" });
    expect(owner.last("refused")?.error.code).toBe("quota-stream-size");
    owner.send({ t: "stream", world: id, sid: a, k: 2, text: "d" });
    owner.send({ t: "stream", world: id, sid: a, k: 3, text: "e" });
    expect(owner.last("refused")?.error.code).toBe("quota-stream-rate");
    clock.tick(1_000);

    const stranger = new Client(hub, ANN);
    stranger.open(id);
    stranger.send({ t: "stream", world: id, sid: a, k: 9, text: "forged" });
    expect(stranger.last("refused")?.error.code).toBe("world-not-open");
    viewer.send({ t: "stream", world: id, sid: a, k: 9, text: "forged" });
    expect(viewer.last("refused")?.error.code).toBe("stream-no-lease");
    const relayed = viewer.all("stream").filter((frame) => frame.sid === a);
    expect(relayed.map((frame) => frame.text)).toEqual(["abc", "d"]);
    expect(relayed.every((frame) => frame.from === keyOf(OWNER))).toBe(true);

    owner.send({ t: "stream", world: id, sid: a, k: 5, end: "abort" });
    expect(hub.leases.get(id, chunk(2))).toBeNull();
    expect(grant(chunk(4))?.status).toBe("granted");
  });
});
