// Chat on a continent (docs/plans/simplify-together.md → Chat). A chat line is text an untrusted
// peer typed, shown on this player's screen, so it is tested here with a fake wire — E2E cannot stage
// a hostile peer. Written before the code; each test names the failure it guards:
//   1. A line from a peer whose hello never passed (or failed, or who left) reaches the chat.
//   2. A line that is not a string, is blank once cleaned, or is longer than 200 characters is
//      shown instead of dropped (an oversized frame is refused before it is even cleaned).
//   3. Control and invisible formatting characters (newlines, tabs, NUL, bidi overrides,
//      zero-width) survive into what is shown and can break or disguise a line.
//   4. A verified peer that floods (more than 5 lines in 5 s) has every line shown; or the limit
//      also silences a second, well-behaved peer.
//   5. The sender's name comes from the message itself, or an impostor's awareness state (another
//      client claiming a verified world under another name) decides whose name is shown.
//   6. This player's own lines go to a peer that has not passed the hello, or a blank / oversized
//      line is sent at all.

import { type ContinentTransport, gateContinent } from "@renderer/net/continentGate";
import {
  CHAT_MAX_CHARS,
  type ContinentMessage,
  chatSenderName,
  continentHello,
  isContinentMessage,
  readChatText,
} from "@shared/continentHello";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

const CODE = "K7QM2P";

/** One end of a fake data channel: messages cross as JSON, like the real frame. */
interface End extends ContinentTransport {
  id: string;
  received: ContinentMessage[];
  deliver(from: string, message: unknown): void;
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
      other.deliver(id, JSON.parse(JSON.stringify(message)));
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
      // The real channel drops what `isContinentMessage` refuses before the gate sees it.
      if (!isContinentMessage(message)) return;
      self.received.push(message);
      for (const listener of messages) listener(from, message);
    },
    ready: (peerId) => {
      for (const listener of peers) listener(peerId);
    },
    gone: (peerId) => {
      for (const listener of left) listener(peerId);
    },
  };
  wire.set(id, self);
  return self;
}

/** This world's gate, what it heard, and a clock the test moves. */
function listener(worldId: string, physicsVersion = 1) {
  const wire = new Map<string, End>();
  const here = end(`peer-${worldId}`, wire);
  const clock = { now: 1_000_000 };
  const gate = gateContinent(
    new Y.Doc(),
    continentHello({ code: CODE, worldId, physicsVersion }),
    here,
    () => clock.now,
  );
  const heard: string[] = [];
  gate.onChat((from, text) => heard.push(`${from}:${text}`));
  return { wire, here, gate, clock, heard };
}

function hello(worldId: string, physicsVersion = 1): ContinentMessage {
  return { type: "hello", hello: continentHello({ code: CODE, worldId, physicsVersion }) };
}

describe("continent chat", () => {
  it("hears nobody whose hello never passed, failed, or who left (1)", () => {
    const { wire, here, heard, gate } = listener("world-a");
    const stranger = end("stranger", wire);
    here.ready(stranger.id);
    stranger.send(here.id, { type: "chat", text: "let me in" });

    const other = end("other", wire);
    here.ready(other.id);
    other.send(here.id, hello("world-b", 2));
    other.send(here.id, { type: "chat", text: "wrong physics" });

    const friend = end("friend", wire);
    here.ready(friend.id);
    friend.send(here.id, hello("world-c"));
    friend.send(here.id, { type: "chat", text: "hi" });
    here.gone(friend.id);
    friend.send(here.id, { type: "chat", text: "after leaving" });

    expect(heard).toEqual(["world-c:hi"]);
    gate.close();
  });

  it("drops a line that is not a string, blank, too long, or an oversized frame (2)", () => {
    const { wire, here, heard, gate } = listener("world-a");
    const friend = end("friend", wire);
    here.ready(friend.id);
    friend.send(here.id, hello("world-b"));
    for (const text of [42, null, { text: "hi" }, "   ", "\n\t\u200b"] as unknown[]) {
      here.deliver(friend.id, { type: "chat", text });
    }
    expect(heard).toEqual([]);

    expect(readChatText("x".repeat(CHAT_MAX_CHARS))).toBe("x".repeat(CHAT_MAX_CHARS));
    expect(readChatText("x".repeat(CHAT_MAX_CHARS + 1))).toBeNull();
    // Characters, not UTF-16 units: 200 astral characters still fit.
    expect(readChatText("🙂".repeat(CHAT_MAX_CHARS))).toBe("🙂".repeat(CHAT_MAX_CHARS));
    expect(isContinentMessage({ type: "chat", text: "x".repeat(100_000) })).toBe(false);
    expect(isContinentMessage({ type: "chat", text: 7 })).toBe(false);
    gate.close();
  });

  it("removes control and invisible formatting characters (3)", () => {
    expect(readChatText("  hello\nthere\r\n\tfriend  ")).toBe("hello there friend");
    expect(readChatText("a\u0000b\u0007c\u007f\u0085d")).toBe("a b c d");
    expect(readChatText("evil\u202egnp.exe")).toBe("evil gnp.exe");
    expect(readChatText("zero\u200bwidth\u2066isolate\ufeff")).toBe("zero width isolate");
    expect(readChatText("你好，朋友！")).toBe("你好，朋友！");
    expect(readChatText("broken \ud800 half")).toBe("broken half");
  });

  it("drops a flood beyond 5 lines in 5 s, per peer, and hears again after (4)", () => {
    const { wire, here, heard, clock, gate } = listener("world-a");
    const loud = end("loud", wire);
    const calm = end("calm", wire);
    here.ready(loud.id);
    here.ready(calm.id);
    loud.send(here.id, hello("world-b"));
    calm.send(here.id, hello("world-c"));
    for (let n = 1; n <= 8; n += 1) loud.send(here.id, { type: "chat", text: `spam ${n}` });
    calm.send(here.id, { type: "chat", text: "hello" });
    expect(heard).toEqual([
      "world-b:spam 1",
      "world-b:spam 2",
      "world-b:spam 3",
      "world-b:spam 4",
      "world-b:spam 5",
      "world-c:hello",
    ]);

    clock.now += 4_999;
    loud.send(here.id, { type: "chat", text: "still too soon" });
    clock.now += 1;
    loud.send(here.id, { type: "chat", text: "back again" });
    expect(heard.at(-1)).toBe("world-b:back again");
    expect(heard).not.toContain("world-b:still too soon");
    gate.close();
  });

  it("names the sender from its world's awareness, never the message (5)", () => {
    const { wire, here, gate } = listener("world-a");
    const friend = end("friend", wire);
    here.ready(friend.id);
    friend.send(here.id, hello("world-b"));
    const heard: string[] = [];
    gate.onChat((from, text) => heard.push(`${from}:${text}`));
    here.deliver(friend.id, { type: "chat", text: "hi", name: "Admin", worldId: "x" });
    // The gate hands over the verified world and the text; the message's name goes nowhere.
    expect(heard).toEqual(["world-b:hi"]);

    const states = [
      { name: "Ai", worldId: "world-a" },
      { name: "Bo", worldId: "world-b", pos: { x: 1, z: 2 } },
    ];
    expect(chatSenderName(states, "world-b", "Bo")).toBe("Bo");
    // An impostor in the room claims Bo's world under another name: the world's own entry decides.
    const spoofed = [...states, { name: "Admin", worldId: "world-b" }];
    expect(chatSenderName(spoofed, "world-b", "Bo")).toBe("Bo");
    expect(chatSenderName(spoofed, "world-b", null)).toBeNull();
    // A name is shown on one line and short, whatever its awareness state carried.
    expect(chatSenderName([{ name: "Bo\n\u202eadmin", worldId: "world-b" }], "world-b", null)).toBe(
      "Bo admin",
    );
    expect(chatSenderName([{ name: "x".repeat(500), worldId: "world-b" }], "world-b", null)).toBe(
      "x".repeat(40),
    );
    expect(chatSenderName([{ worldId: "world-b" }, 7, null], "world-b", null)).toBeNull();
    gate.close();
  });

  it("says a line only to verified peers, and never a blank, long or flooding one (6)", () => {
    const { wire, here, gate, clock } = listener("world-a");
    const friend = end("friend", wire);
    const stranger = end("stranger", wire);
    const turnedAway = end("turned-away", wire);
    here.ready(friend.id);
    here.ready(stranger.id);
    here.ready(turnedAway.id);
    friend.send(here.id, hello("world-b"));
    turnedAway.send(here.id, hello("world-c", 2));

    const sent = gate.sendChat("  hello\nall ");
    expect(sent).toEqual({ ok: true, value: { text: "hello all", peers: 1 } });
    const chats = (at: End) => at.received.filter((message) => message.type === "chat");
    expect(chats(friend)).toEqual([{ type: "chat", text: "hello all" }]);
    expect(chats(stranger)).toEqual([]);
    expect(chats(turnedAway)).toEqual([]);

    expect(gate.sendChat(" \u200b ").ok).toBe(false);
    expect(gate.sendChat("x".repeat(CHAT_MAX_CHARS + 1)).ok).toBe(false);
    for (let n = 2; n <= 5; n += 1) expect(gate.sendChat(`line ${n}`).ok).toBe(true);
    const flood = gate.sendChat("line 6");
    expect(flood.ok ? null : flood.error.code).toBe("chat-too-fast");
    expect(chats(friend)).toHaveLength(5);
    clock.now += 5_000;
    expect(gate.sendChat("line 7").ok).toBe(true);
    gate.close();
  });
});
