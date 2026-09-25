// A continent is open to anyone who dials its door number, and before rev 6 its Y.Doc synced the
// moment a peer connected. Untrusted peers are exactly what E2E cannot stage, so the gate is tested
// here, with two documents and a fake wire. What could go wrong:
//   1. A peer whose hello fails (other physics, other continent) still receives this world's entry,
//      home, chunks or notes — before or after the handshake.
//   2. A peer that never says hello pushes land into this world's document.
//   3. A verified peer's malformed or forged entry (a chunk that does not parse, a world filed
//      under someone else's id) lands in the document.
//   5. A verified peer writes another world's entry or chunks, or overwrites a chunk or a note that
//      is already history (found by review) — while a visitor's note on someone else's land, which
//      is filed under that land's owner, must still arrive.
//   4. Two verified worlds do not end up with each other's land, or miss a later change or a leave.

import {
  publishChunks,
  publishNotes,
  publishWorld,
  readContinent,
} from "@renderer/net/continentDoc";
import { type ContinentTransport, gateContinent } from "@renderer/net/continentGate";
import { CONTINENT_PROTOCOL, type ContinentWorldEntry } from "@shared/continent";
import { type ContinentMessage, continentHello } from "@shared/continentHello";
import type { LandNote } from "@shared/land";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

const CODE = "K7QM2PXD";

function entry(worldId: string, owner: string): ContinentWorldEntry {
  return {
    protocol: CONTINENT_PROTOCOL,
    worldId,
    owner,
    title: `${owner}'s land`,
    anchor: { cx: 0, cz: 0 },
    joinedAt: 1,
    seed: 7,
    origin: 'root = Scene("Home", "meadow", [ground])\nground = Floor(16, 16, "grass")',
    originDialogues: {},
    home: { cx: 0, cz: 0, keepsakes: [] },
    door: [null, null, null, null],
  };
}

const chunk = { cx: 1, cz: 0, scene: "root = Chunk()", dialogues: {} };

const note: LandNote = {
  id: "n1",
  author: "Ai",
  at: "2026-09-25T00:00:00.000Z",
  coord: { cx: 0, cz: 0, x: 3, z: 4 },
  anchors: [],
  text: "The bell rang twice.",
  contests: null,
};

/** One end of a fake data channel: messages cross as JSON, like the real frame. */
interface End extends ContinentTransport {
  id: string;
  received: ContinentMessage[];
  deliver(from: string, message: ContinentMessage): void;
  ready(peerId: string): void;
  gone(peerId: string): void;
}

function end(id: string, wire: Map<string, End>): End {
  const peers = new Set<(peerId: string) => void>();
  const left = new Set<(peerId: string) => void>();
  const messages = new Set<(peerId: string, message: ContinentMessage) => void>();
  const self: End = {
    id,
    received: [],
    send(peerId, message) {
      const other = wire.get(peerId);
      if (other === undefined) return false;
      other.deliver(id, JSON.parse(JSON.stringify(message)) as ContinentMessage);
      return true;
    },
    onPeer(listener) {
      peers.add(listener);
      return () => peers.delete(listener);
    },
    onPeerLeft(listener) {
      left.add(listener);
      return () => left.delete(listener);
    },
    onMessage(listener) {
      messages.add(listener);
      return () => messages.delete(listener);
    },
    deliver(from, message) {
      self.received.push(message);
      for (const listener of messages) listener(from, message);
    },
    ready(peerId) {
      for (const listener of peers) listener(peerId);
    },
    gone(peerId) {
      for (const listener of left) listener(peerId);
    },
  };
  wire.set(id, self);
  return self;
}

function connect(a: End, b: End): void {
  a.ready(b.id);
  b.ready(a.id);
}

function landOf(doc: Y.Doc) {
  const snapshot = readContinent(doc);
  return {
    worlds: snapshot.worlds.map((one) => one.worldId).sort(),
    chunks: [...snapshot.chunks.keys()].sort(),
    notes: [...snapshot.notes.keys()].sort(),
  };
}

function world(id: string, owner: string, physicsVersion = 1) {
  const doc = new Y.Doc();
  publishWorld(doc, entry(id, owner));
  publishChunks(doc, id, [chunk]);
  publishNotes(doc, id, [note]);
  return { doc, hello: continentHello({ code: CODE, worldId: id, physicsVersion }) };
}

describe("continent gate", () => {
  it("gives a peer whose hello fails nothing of this world, before or after (1)", () => {
    const wire = new Map<string, End>();
    const a = world("world-a", "Ai");
    const b = world("world-b", "Bo", 2);
    const toA = end("peer-a", wire);
    const toB = end("peer-b", wire);
    const gateA = gateContinent(a.doc, a.hello, toA);
    const gateB = gateContinent(b.doc, b.hello, toB);
    connect(toA, toB);

    expect(toB.received.map((message) => message.type).sort()).toEqual(["hello", "reject"]);
    expect(landOf(b.doc)).toEqual({ worlds: ["world-b"], chunks: ["world-b"], notes: ["world-b"] });
    expect(landOf(a.doc)).toEqual({ worlds: ["world-a"], chunks: ["world-a"], notes: ["world-a"] });
    expect(gateA.rejected().map((error) => error.code)).toEqual(["continent-physics-mismatch"]);
    expect(gateB.rejected().map((error) => error.code)).toEqual(["continent-physics-mismatch"]);
    expect(gateA.verifiedWorlds().size).toBe(0);

    publishChunks(a.doc, "world-a", [{ ...chunk, cx: 2 }]);
    expect(toB.received.some((message) => message.type === "entries")).toBe(false);
    gateA.close();
    gateB.close();
  });

  it("drops land from a peer that never said hello, and tells it only its own hello (2)", () => {
    const wire = new Map<string, End>();
    const a = world("world-a", "Ai");
    const toA = end("peer-a", wire);
    const stranger = end("stranger", wire);
    const gate = gateContinent(a.doc, a.hello, toA);
    toA.ready(stranger.id);
    stranger.send(toA.id, {
      type: "entries",
      entries: [{ map: "worlds", key: "world-x", value: entry("world-x", "Xi") }],
    });

    expect(landOf(a.doc).worlds).toEqual(["world-a"]);
    expect(stranger.received.map((message) => message.type)).toEqual(["hello"]);
    gate.close();
  });

  it("stores nothing malformed or forged from a verified peer (3)", () => {
    const wire = new Map<string, End>();
    const a = world("world-a", "Ai");
    const toA = end("peer-a", wire);
    const peer = end("peer-b", wire);
    const gate = gateContinent(a.doc, a.hello, toA);
    toA.ready(peer.id);
    peer.send(toA.id, {
      type: "hello",
      hello: continentHello({ code: CODE, worldId: "world-b", physicsVersion: 1 }),
    });
    expect(gate.verifiedWorlds()).toEqual(new Set(["world-b"]));
    peer.send(toA.id, {
      type: "entries",
      entries: [
        { map: "worlds", key: "world-z", value: entry("world-b", "Bo") },
        { map: "chunks", key: "world-b|1,0", value: { cx: "one", scene: 4 } },
        { map: "notes", key: "world-b|n9", value: null },
        { map: "lore" as never, key: "world-b|x", value: {} },
      ],
    });
    expect(landOf(a.doc)).toEqual({ worlds: ["world-a"], chunks: ["world-a"], notes: ["world-a"] });
    gate.close();
  });

  it("lets a peer write only its own world and chunks, and never rewrite history (5)", () => {
    const wire = new Map<string, End>();
    const a = world("world-a", "Ai");
    const toA = end("peer-a", wire);
    const peer = end("peer-b", wire);
    const gate = gateContinent(a.doc, a.hello, toA);
    toA.ready(peer.id);
    peer.send(toA.id, {
      type: "hello",
      hello: continentHello({ code: CODE, worldId: "world-b", physicsVersion: 1 }),
    });
    peer.send(toA.id, {
      type: "entries",
      entries: [
        { map: "worlds", key: "world-c", value: entry("world-c", "Ci") },
        { map: "chunks", key: "world-c|1,0", value: chunk },
        { map: "chunks", key: "world-a|1,0", value: { ...chunk, scene: "forged" } },
        { map: "notes", key: "world-a|n1", value: { ...note, text: "forged" } },
        { map: "chunks", key: "world-b|2,0", value: { ...chunk, cx: 2 } },
        { map: "notes", key: "world-a|n2", value: { ...note, id: "n2", author: "Bo" } },
      ],
    });
    const land = readContinent(a.doc);
    expect(land.worlds.map((one) => one.worldId)).toEqual(["world-a"]);
    expect([...land.chunks.keys()].sort()).toEqual(["world-a", "world-b"]);
    expect(land.chunks.get("world-a")?.map((one) => one.scene)).toEqual([chunk.scene]);
    expect(land.chunks.get("world-b")?.map((one) => one.cx)).toEqual([2]);
    expect(
      land.notes
        .get("world-a")
        ?.map((one) => `${one.id}:${one.text}`)
        .sort(),
    ).toEqual([`n1:${note.text}`, `n2:${note.text}`]);
    gate.close();
  });

  it("merges two verified worlds, then every later change and a leave (4)", () => {
    const wire = new Map<string, End>();
    const a = world("world-a", "Ai");
    const b = world("world-b", "Bo");
    const toA = end("peer-a", wire);
    const toB = end("peer-b", wire);
    const gateA = gateContinent(a.doc, a.hello, toA);
    const gateB = gateContinent(b.doc, b.hello, toB);
    connect(toA, toB);

    const both = {
      worlds: ["world-a", "world-b"],
      chunks: ["world-a", "world-b"],
      notes: ["world-a", "world-b"],
    };
    expect(landOf(a.doc)).toEqual(both);
    expect(landOf(b.doc)).toEqual(both);

    publishChunks(a.doc, "world-a", [{ ...chunk, cx: 2 }]);
    expect(
      readContinent(b.doc)
        .chunks.get("world-a")
        ?.map((one) => one.cx)
        .sort(),
    ).toEqual([1, 2]);

    a.doc.getMap("worlds").delete("world-a");
    expect(landOf(b.doc).worlds).toEqual(["world-b"]);

    toB.gone(toA.id);
    expect(gateB.verifiedWorlds().size).toBe(0);
    publishChunks(b.doc, "world-b", [{ ...chunk, cx: 5 }]);
    expect(
      readContinent(a.doc)
        .chunks.get("world-b")
        ?.map((one) => one.cx),
    ).toEqual([1]);
    gateA.close();
    gateB.close();
  });
});
