// Chat in a shared world through its service (simplify-together → Chat) — only what E2E cannot
// reach (Rule 0): hostile frames and old/new builds meeting. What this file guards, written before
// the code:
//   1. Old and new meet badly: a line reaches a session that never said `hear` (an older app reads
//      an unknown frame and drops its link), or someone who has not opened the world; a service's
//      version is misread, so main sends chat to an older service (which closes the socket).
//   2. The wrong people talk: a visitor to a public world, or an invitee who has not joined yet.
//   3. Untrusted input: `from` is the sender's choice, or an empty, control-character-laden or
//      over-long line is relayed as sent.
//   4. A flood is relayed (more than 5 lines per 5 s), or answered by closing the socket (a quota is
//      not a protocol violation).
//   5. Silent keeping: a line is written into the service's data directory.
//   6. A session that closed the world still hears it.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { signJoinProof } from "@shared/history/sign";
import { serviceSpeaksChat } from "@shared/worldProtocol";
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
} from "./support";

function setup(access: "friends" | "public" = "friends") {
  const service = makeService();
  const world = new LocalWorld({ access });
  const owner = new Client(service.hub, OWNER);
  attach(owner, world);
  return { ...service, world, owner };
}

/** `who` joins through the service with a fresh invite (an invitee until its join is sequenced). */
function joinAs(s: ReturnType<typeof setup>, who: Uint8Array, name: string, submit = true): Client {
  const ticket = s.world.invite();
  const client = new Client(s.hub, who);
  const proof = signJoinProof(ticket.secret, ticket.invite, keyOf(who));
  client.open(s.world.id, 0, null, { join: { invite: ticket.invite, proof } } as never);
  if (submit) {
    const seen = headOf(s.hub, s.world.id);
    client.submit(
      s.world.id,
      sign(s.world.id, "member.join", { invite: ticket.invite, name, proof }, who, seen),
    );
  }
  return client;
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe("who hears (1, 6)", () => {
  it("relays only to sessions that said hear, in the world they opened", () => {
    const s = setup();
    const ann = joinAs(s, ANN, "Ann");
    const ben = joinAs(s, BEN, "Ben");
    s.owner.send({ t: "hear", world: s.world.id });
    ann.send({ t: "hear", world: s.world.id });
    // Ben is on an older app: it never says hear.
    ann.send({ t: "chat", world: s.world.id, text: "hello" });
    expect(s.owner.last("chat")).toMatchObject({ from: ann.key, text: "hello" });
    expect(ben.all("chat")).toEqual([]);
    expect(ann.all("chat")).toEqual([]);

    const outsider = new Client(s.hub, VIC);
    outsider.send({ t: "hear", world: s.world.id });
    expect(outsider.last("refused")?.error.code).toBe("world-not-open");

    s.owner.send({ t: "close", world: s.world.id });
    s.owner.clear();
    ann.send({ t: "chat", world: s.world.id, text: "still there?" });
    expect(s.owner.all("chat")).toEqual([]);
  });

  it("reads the service version the way main does", () => {
    const s = setup();
    expect(serviceSpeaksChat(s.owner.challenge.version)).toBe(true);
    for (const old of [
      "unmapped-service/1",
      "unmapped-service/",
      "other/9",
      "unmapped-service/2x",
    ]) {
      expect(serviceSpeaksChat(old)).toBe(false);
    }
  });
});

describe("who talks (2, 3)", () => {
  it("lets owners and members talk; visitors and invitees are refused", () => {
    const s = setup("public");
    s.owner.send({ t: "hear", world: s.world.id });
    const visitor = new Client(s.hub, VIC);
    visitor.open(s.world.id);
    visitor.send({ t: "chat", world: s.world.id, text: "hi from outside" });
    expect(visitor.last("refused")?.error.code).toBe("chat-members-only");
    expect(visitor.peer.closed).toBeNull();

    const invitee = joinAs(s, BEN, "Ben", false);
    invitee.send({ t: "chat", world: s.world.id, text: "not yet" });
    expect(invitee.last("refused")?.error.code).toBe("chat-members-only");
    expect(s.owner.all("chat")).toEqual([]);
  });

  it("stamps from itself and cleans the line", () => {
    const s = setup();
    const ann = joinAs(s, ANN, "Ann");
    s.owner.send({ t: "hear", world: s.world.id });
    ann.send({ t: "chat", world: s.world.id, text: "  hi\u0000 there\u202e  " });
    const seen = s.owner.last("chat");
    expect(seen?.from).toBe(ann.key);
    expect(seen?.text).toBe("hi there");
    ann.send({ t: "chat", world: s.world.id, text: " \u0007 " });
    ann.send({ t: "chat", world: s.world.id, text: "x".repeat(201) });
    expect(ann.codes()).toEqual(["chat-invalid", "chat-invalid"]);
    expect(s.owner.all("chat")).toHaveLength(1);
  });
});

describe("floods and keeping (4, 5)", () => {
  it("relays at most 5 lines per 5 s, refuses the rest without closing, keeps nothing", () => {
    const s = setup();
    const ann = joinAs(s, ANN, "Ann");
    s.owner.send({ t: "hear", world: s.world.id });
    for (let index = 0; index < 8; index += 1) {
      ann.send({ t: "chat", world: s.world.id, text: `secret line ${index}` });
    }
    expect(s.owner.all("chat")).toHaveLength(5);
    expect(ann.codes().filter((code) => code === "quota-chat")).toHaveLength(3);
    expect(ann.peer.closed).toBeNull();
    s.clock.tick(5_000);
    ann.send({ t: "chat", world: s.world.id, text: "secret line again" });
    expect(s.owner.all("chat")).toHaveLength(6);

    const served = s.hub.worlds.get(s.world.id);
    if (served !== undefined) s.hub.snapshot(served);
    const written = filesUnder(s.dir).map((path) => readFileSync(path, "utf8"));
    expect(written.some((text) => text.includes("secret line"))).toBe(false);
  });
});
