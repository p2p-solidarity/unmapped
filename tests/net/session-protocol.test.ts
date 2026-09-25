import {
  decodeSessionMessage,
  encodeSessionMessage,
  openSessionChannel,
} from "@renderer/net/channel";
import type { RuntimePin } from "@shared/cartridge";
import {
  createSessionHello,
  createSessionPeer,
  type RuntimeSnapshot,
  type SessionMessage,
} from "@shared/session";
import { describe, expect, it, vi } from "vitest";

const hash = (character: string) => `sha256:${character.repeat(64)}` as const;

function pin(overrides: Partial<RuntimePin> = {}): RuntimePin {
  return {
    cartridge: { cartridgeId: "factory", version: "2.0.0", contentHash: hash("a") },
    moduleLock: {
      entries: [
        {
          moduleId: "movement.fps",
          version: "1.0.0",
          source: "builtin",
          provides: ["camera:first_person"],
          requires: [],
          deterministic: true,
          implementedBy: "test fixture",
        },
      ],
    },
    modLock: { entries: [], lockHash: hash("b") },
    profileHash: hash("c"),
    effectiveHash: hash("d"),
    ...overrides,
  };
}

function hello(
  runtimePin = pin(),
  profileId = "mina",
  authority: "host" | "peer" = profileId === "mina" ? "host" : "peer",
) {
  return createSessionHello({
    sessionId: "ABC234",
    authority,
    runtimePin,
    engineApiVersion: 1,
    networkProtocolVersion: 1,
    playerProfileId: profileId,
  });
}

const snapshot: RuntimeSnapshot = {
  sequence: 3,
  currentSceneId: "reactor",
  flags: { door: true },
  inventory: { items: [], materials: [] },
  karma: [],
  mutation: null,
  player: null,
  party: null,
  completedSceneIds: [],
  updatedAt: "2026-09-26T10:00:00.000Z",
};

describe("runtime session protocol", () => {
  it("round-trips the session frame carried by the WebRTC data channel", () => {
    const message: SessionMessage = { type: "hello", hello: hello() };
    expect(decodeSessionMessage(encodeSessionMessage(message))).toEqual(message);
    expect(decodeSessionMessage(new Uint8Array([0, 1, 2, 3]))).toBeNull();
    expect(
      decodeSessionMessage(
        encodeSessionMessage({ type: "input", input: { kind: "cheat" } } as never),
      ),
    ).toBeNull();
  });

  it("waits for the underlying data channel before starting the handshake", () => {
    const listeners = new Map<string, Set<(...args: never[]) => void>>();
    const on = (event: string, listener: (...args: never[]) => void) => {
      const group = listeners.get(event) ?? new Set();
      group.add(listener);
      listeners.set(event, group);
    };
    const off = (event: string, listener: (...args: never[]) => void) => {
      listeners.get(event)?.delete(listener);
    };
    const send = vi.fn();
    const providerListeners = new Map<string, (...args: never[]) => void>();
    const provider = {
      room: {
        webrtcConns: new Map([
          ["host", { remotePeerId: "host", connected: false, peer: { on, off, send } }],
        ]),
      },
      on: (event: string, listener: (...args: never[]) => void) =>
        providerListeners.set(event, listener),
      off: (event: string) => providerListeners.delete(event),
    };
    const channel = openSessionChannel(provider as never);
    const connected = vi.fn();
    channel.onPeer(connected);

    expect(channel.peerIds()).toEqual([]);
    expect(channel.send("host", { type: "hello", hello: hello() })).toBe(false);
    for (const listener of listeners.get("connect") ?? []) listener();
    expect(channel.peerIds()).toEqual(["host"]);
    expect(connected).toHaveBeenCalledWith("host");
    expect(channel.send("host", { type: "hello", hello: hello() })).toBe(true);
    expect(send).toHaveBeenCalledOnce();
    channel.close();
  });

  it("rejects a hash mismatch before any runtime message can be applied", () => {
    const sent: SessionMessage[] = [];
    const onSnapshot = vi.fn();
    const peer = createSessionPeer({
      role: "peer",
      localHello: hello(),
      send: (message) => sent.push(message),
      handlers: { onSnapshot },
    });

    const mismatched = hello(pin({ effectiveHash: hash("e") }), "friend");
    const result = peer.receive({ type: "hello", hello: mismatched });
    expect(result.ok).toBe(false);
    expect(peer.verified()).toBe(false);
    expect(sent.at(-1)).toMatchObject({
      type: "reject",
      error: { code: "session-effective-mismatch" },
    });

    peer.receive({ type: "snapshot", snapshot });
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it("preserves ordered module locks in the handshake", () => {
    const reversed = pin();
    reversed.moduleLock = {
      entries: [
        {
          moduleId: "timing.turn",
          version: "1.0.0",
          source: "builtin",
          provides: ["timing:turn_based"],
          requires: [],
          deterministic: true,
          implementedBy: "test fixture",
        },
        ...reversed.moduleLock.entries,
      ],
    };
    const local = pin();
    local.moduleLock = {
      entries: [...reversed.moduleLock.entries].reverse(),
    };
    const peer = createSessionPeer({
      role: "peer",
      localHello: hello(local),
      send: () => undefined,
      handlers: {},
    });
    const result = peer.receive({ type: "hello", hello: hello(reversed, "friend") });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("session-module-lock-mismatch");
  });

  it("allows snapshots only from the host and inputs only from a verified peer", () => {
    const hostMessages: SessionMessage[] = [];
    const peerMessages: SessionMessage[] = [];
    const hostInput = vi.fn();
    const peerSnapshot = vi.fn();
    const host = createSessionPeer({
      role: "host",
      localHello: hello(),
      send: (message) => hostMessages.push(message),
      handlers: { onInput: hostInput },
    });
    const peer = createSessionPeer({
      role: "peer",
      localHello: hello(pin(), "friend"),
      send: (message) => peerMessages.push(message),
      handlers: { onSnapshot: peerSnapshot },
    });

    expect(host.sendSnapshot(snapshot).ok).toBe(false);
    expect(host.receive({ type: "hello", hello: hello(pin(), "friend") }).ok).toBe(true);
    expect(peer.receive({ type: "hello", hello: hello() }).ok).toBe(true);
    expect(host.sendSnapshot(snapshot).ok).toBe(true);
    expect(peer.receive(hostMessages.at(-1) as SessionMessage).ok).toBe(true);
    expect(peerSnapshot).toHaveBeenCalledWith(snapshot);

    expect(peer.sendInput({ kind: "transition", targetSceneId: "ending" }).ok).toBe(true);
    expect(host.receive(peerMessages.at(-1) as SessionMessage).ok).toBe(true);
    expect(hostInput).toHaveBeenCalledWith({ kind: "transition", targetSceneId: "ending" });

    const unauthorized = peer.receive({
      type: "input",
      input: { kind: "cheat" },
    } as never);
    expect(unauthorized.ok).toBe(false);
    expect(hostInput).toHaveBeenCalledTimes(1);
  });
});
