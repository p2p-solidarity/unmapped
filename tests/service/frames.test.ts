// The world service's socket (rev 6 phase 3, WP4: D9 frames, auth, connection limits, presence).
// Only what E2E cannot reach: hostile frames and forged keys. What this file guards, written
// before the code:
//   1. A malformed frame is acted on instead of closing the socket: over 256 KiB, not JSON, an
//      unknown message or field, binary data.
//   2. A socket that never authenticates stays open, or a frame before auth is acted on.
//   3. A forged auth is accepted: signed by another key than it names, over another connection's
//      nonce (a replay), or for another service's key; a second auth re-keys a session.
//   4. A flood is acted on, answered once per frame (amplification), or closes the socket (a quota
//      is not a protocol violation): frames per second, presence per second, sockets per address.
//   5. A relayed presence carries a `from` the sender chose, reaches someone who did not open the
//      world, or outlives its sender.
//   6. The service sends a frame a client cannot read (an error message over 500 characters).

import { signWsAuth } from "@shared/history/sign";
import { frameText, readFromService } from "@shared/worldProtocol";
import { describe, expect, it } from "vitest";
import { wireError } from "../../src/service/wire";
import { ANN, attach, BEN, Client, LocalWorld, makeService, OWNER, sign, VIC } from "./support";

const presence = { x: 3, z: 4, facing: "north", moving: false, place: null, emote: null } as const;

describe("frames and auth (1, 2, 3)", () => {
  it("closes the socket on a malformed frame, and only then", () => {
    const { hub } = makeService();
    const bad: (string | Uint8Array)[] = [
      "x".repeat(256 * 1024 + 1),
      "{not json",
      JSON.stringify({ t: "delete", world: "h".padEnd(53, "a") }),
      JSON.stringify({ t: "close", world: "h".padEnd(53, "a"), extra: 1 }),
      new Uint8Array([1, 2, 3]),
    ];
    const codes = bad.map((frame) => {
      const client = new Client(hub, OWNER);
      client.send(frame);
      expect(client.peer.closed).not.toBeNull();
      expect(hub.sessions.has(client.session)).toBe(false);
      return client.last("refused")?.error.code;
    });
    expect(codes).toEqual([
      "frame-too-large",
      "frame-not-json",
      "frame-invalid",
      "frame-invalid",
      "frame-binary",
    ]);
    expect(new Client(hub, OWNER).peer.closed).toBeNull();
  });

  it("acts on nothing before auth and closes a socket that never authenticates", () => {
    const { hub, clock } = makeService();
    const early = new Client(hub, OWNER, "10.0.0.2", false);
    early.open("h".padEnd(53, "a"));
    expect(early.last("refused")?.error.code).toBe("auth-required");
    expect(early.peer.closed).not.toBeNull();

    const idle = new Client(hub, OWNER, "10.0.0.2", false);
    clock.tick(9_000);
    hub.sweep();
    expect(idle.peer.closed).toBeNull();
    clock.tick(1_001);
    hub.sweep();
    expect(idle.last("refused")?.error.code).toBe("auth-timeout");
    expect(idle.peer.closed).not.toBeNull();
  });

  it("refuses forged, replayed and foreign auth", () => {
    const { hub } = makeService();
    const other = new Client(hub, BEN);
    const cases: ((client: Client) => void)[] = [
      (client) => {
        const { nonce, key } = client.challenge;
        client.send({ t: "auth", key: client.key, sig: signWsAuth(VIC, nonce, key) });
      },
      (client) => client.auth(OWNER, other.challenge.nonce),
      (client) => client.auth(OWNER, client.challenge.nonce, other.key),
    ];
    for (const forge of cases) {
      const client = new Client(hub, OWNER, "10.0.0.3", false);
      forge(client);
      expect(client.last("refused")?.error.code).toBe("auth-invalid");
      expect(client.peer.closed).not.toBeNull();
    }
    const twice = new Client(hub, OWNER);
    twice.auth(ANN);
    expect(twice.last("refused")?.error.code).toBe("auth-repeated");
    expect(twice.session.key).toBe(twice.key);
  });
});

describe("floods (4)", () => {
  it("drops frames over the rate with one refusal per second, without closing", () => {
    const { hub, clock } = makeService({ limits: { framesPerSecond: 5 } });
    const client = new Client(hub, OWNER);
    for (let index = 0; index < 20; index += 1)
      client.send({ t: "close", world: "h".padEnd(53, "a") });
    expect(client.codes()).toEqual(["quota-frames"]);
    expect(client.peer.closed).toBeNull();
    clock.tick(1_000);
    client.send({ t: "close", world: "h".padEnd(53, "a") });
    expect(client.codes()).toEqual(["quota-frames"]);
  });

  it("caps sockets per address", () => {
    const { hub } = makeService({ limits: { socketsPerIp: 2 } });
    const first = new Client(hub, OWNER, "10.1.1.1");
    new Client(hub, ANN, "10.1.1.1");
    expect(hub.admitSocket("10.1.1.1")?.code).toBe("quota-sockets");
    expect(() => new Client(hub, BEN, "10.1.1.1")).toThrow();
    expect(hub.admitSocket("10.1.1.2")).toBeNull();
    hub.disconnect(first.session);
    expect(hub.admitSocket("10.1.1.1")).toBeNull();
  });
});

describe("presence (4, 5, 6)", () => {
  it("stamps from, reaches only readers, is rate-limited and cleared on close", () => {
    const { hub, clock } = makeService();
    const world = new LocalWorld({ access: "public" });
    const owner = new Client(hub, OWNER);
    attach(owner, world);
    const visitor = new Client(hub, VIC);
    const outsider = new Client(hub, ANN);
    visitor.open(world.id);
    visitor.send({ t: "presence", world: world.id, p: presence });
    const seen = owner.last("presence");
    expect(seen).toMatchObject({ from: visitor.key, p: presence });
    expect(outsider.all("presence")).toEqual([]);

    outsider.send({ t: "presence", world: world.id, p: presence });
    expect(outsider.last("refused")?.error.code).toBe("world-not-open");
    expect(owner.all("presence")).toHaveLength(1);

    const late = new Client(hub, BEN);
    late.open(world.id);
    expect(late.last("presence")?.from).toBe(visitor.key);

    for (let index = 0; index < 10; index += 1) {
      visitor.send({ t: "presence", world: world.id, p: { ...presence, x: index } });
    }
    expect(owner.all("presence").length).toBeLessThanOrEqual(5);
    expect(visitor.codes()).toEqual(["quota-presence"]);
    clock.tick(1_000);

    hub.disconnect(visitor.session);
    expect(owner.last("presence")).toMatchObject({ from: visitor.key, p: null });
  });

  it("clips an error too long for a frame, and rejects an event by its id", () => {
    const long = wireError({
      code: "x".repeat(80),
      message: "m".repeat(900),
      hint: "h".repeat(900),
    });
    const text = frameText({ t: "refused", world: "", error: long });
    expect(text.ok && readFromService(text.value).ok).toBe(true);
    expect(long.code).toBe("service-error");

    const { hub } = makeService();
    const world = new LocalWorld();
    const owner = new Client(hub, OWNER);
    attach(owner, world);
    const bad = sign(world.id, "profile", { name: "x".repeat(900) }, OWNER, 2);
    owner.submit(world.id, bad);
    expect(owner.last("rejected")).toMatchObject({ id: bad.id, error: { code: "event-invalid" } });
  });
});
