// WebRTC discovery and runtime session transport. The Y.Doc is deliberately empty: published
// cartridge bytes never cross the room. Gameplay messages start only after both machines prove
// they opened the same locally verified runtime pin.

import { useWorldStore } from "@renderer/state";
import {
  ENGINE_API_VERSION,
  NETWORK_PROTOCOL_VERSION,
  type ResolvedInstance,
} from "@shared/cartridge";
import type { PlayerProfile } from "@shared/player";
import { type AppError, err, ok, type Result } from "@shared/result";
import {
  createSessionHello,
  createSessionPeer,
  type RuntimeSnapshot,
  type SessionEvent,
  type SessionInput,
  type SessionPeer,
} from "@shared/session";
import { WebrtcProvider } from "y-webrtc";
import * as Y from "yjs";
import { openSessionChannel } from "./channel";
import {
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  randomFromAlphabet,
  roomName,
} from "./codes";
import { type PeerInfo, toPeerInfo } from "./peers";

export const DEFAULT_SIGNALING: readonly string[] = ["wss://y-webrtc-eu.fly.dev"];
export const PLAYER_NAME_KEY = "aether.playerName";

export interface SignalingStatus {
  url: string;
  connected: boolean;
  unsuccessfulReconnects: number;
}

export interface RoomOptions {
  signaling?: string[];
  password?: string;
}

export interface OpenRoomInput {
  instance: ResolvedInstance;
  profile: PlayerProfile;
}

export interface Room {
  code: string;
  host: boolean;
  instance: ResolvedInstance;
  profile: PlayerProfile;
  provider: WebrtcProvider;
  signaling: string[];
  peers(): PeerInfo[];
  onPeers(listener: (peers: PeerInfo[]) => void): () => void;
  signalingStatus(): SignalingStatus[];
  onStatus(listener: (status: SignalingStatus[]) => void): () => void;
  verifiedPeerCount(): number;
  onVerified(listener: () => void): () => void;
  onError(listener: (error: AppError) => void): () => void;
  onInput(listener: (input: SessionInput) => void): () => void;
  onSnapshot(listener: (snapshot: RuntimeSnapshot, transition: boolean) => void): () => void;
  onEvent(listener: (event: SessionEvent, sequence: number) => void): () => void;
  sendInput(input: SessionInput): Result<void>;
  broadcastSnapshot(snapshot: RuntimeSnapshot): void;
  broadcastTransition(snapshot: RuntimeSnapshot): void;
  broadcastEvent(event: SessionEvent, sequence: number): void;
  leave(): void;
}

interface SignalingConnLike {
  url: string;
  connected: boolean;
  unsuccessfulReconnects: number;
  on(name: string, listener: () => void): void;
  off(name: string, listener: () => void): void;
}

export function playerName(): string {
  try {
    const stored = localStorage.getItem(PLAYER_NAME_KEY);
    if (stored !== null && stored.trim().length > 0) return stored;
  } catch {
    // Storage can be disabled; PlayerProfile remains the durable identity.
  }
  const generated = `player-${randomFromAlphabet(4)}`;
  setPlayerName(generated);
  return generated;
}

export function setPlayerName(name: string): void {
  const trimmed = name.trim();
  if (trimmed.length === 0) return;
  try {
    localStorage.setItem(PLAYER_NAME_KEY, trimmed);
  } catch {
    // Awareness still receives the profile display name for this room.
  }
}

function connections(provider: WebrtcProvider): SignalingConnLike[] {
  return provider.signalingConns as SignalingConnLike[];
}

/** Each signaling server of a provider and whether it is reachable right now. */
export function signalingStatusOf(provider: WebrtcProvider): SignalingStatus[] {
  return connections(provider).map((connection) => ({
    url: connection.url,
    connected: connection.connected,
    unsuccessfulReconnects: connection.unsuccessfulReconnects,
  }));
}

/** Calls `listener` whenever a signaling server of `provider` connects or drops. */
export function onSignalingChange(provider: WebrtcProvider, listener: () => void): () => void {
  const conns = connections(provider);
  for (const connection of conns) {
    connection.on("connect", listener);
    connection.on("disconnect", listener);
  }
  return () => {
    for (const connection of conns) {
      connection.off("connect", listener);
      connection.off("disconnect", listener);
    }
  };
}

function open(
  code: string,
  host: boolean,
  input: OpenRoomInput,
  options: RoomOptions | undefined,
): Result<Room> {
  if (input.instance.cartridge.manifest.formatVersion !== 2) {
    return err(
      "session-v2-required",
      "Multiplayer requires a v2 cartridge with a verified runtime profile.",
      "Open a v2 instance or migrate and publish this cartridge first.",
    );
  }
  const signaling = options?.signaling ?? [...DEFAULT_SIGNALING];
  if (signaling.length === 0) return err("room-no-signaling", "No signaling server configured.");

  const doc = new Y.Doc();
  let provider: WebrtcProvider;
  try {
    provider = new WebrtcProvider(roomName(code), doc, { signaling, password: options?.password });
  } catch (cause) {
    doc.destroy();
    const message = cause instanceof Error ? cause.message : String(cause);
    return err("room-failed", `Could not open the peer connection: ${message}`);
  }

  const awareness = provider.awareness;
  awareness.setLocalState({
    name: input.profile.displayName,
    floor: useWorldStore.getState().floor,
  });
  const channel = openSessionChannel(provider);
  const protocols = new Map<string, SessionPeer>();
  const verified = new Set<string>();
  const verifiedListeners = new Set<() => void>();
  const errorListeners = new Set<(error: AppError) => void>();
  const inputListeners = new Set<(runtimeInput: SessionInput) => void>();
  const snapshotListeners = new Set<(snapshot: RuntimeSnapshot, transition: boolean) => void>();
  const eventListeners = new Set<(event: SessionEvent, sequence: number) => void>();
  const hello = createSessionHello({
    sessionId: code,
    authority: host ? "host" : "peer",
    runtimePin: input.instance.instance.meta.runtimePin,
    engineApiVersion: ENGINE_API_VERSION,
    networkProtocolVersion: NETWORK_PROTOCOL_VERSION,
    playerProfileId: input.profile.profileId,
  });

  const attach = (peerId: string): void => {
    if (protocols.has(peerId)) return;
    if (!host && verified.size > 0) return;
    const protocol = createSessionPeer({
      role: host ? "host" : "peer",
      localHello: hello,
      send: (message) => {
        channel.send(peerId, message);
      },
      handlers: {
        onVerified: () => {
          verified.add(peerId);
          for (const listener of verifiedListeners) listener();
        },
        onRejected: (error) => {
          verified.delete(peerId);
          for (const listener of errorListeners) listener(error);
        },
        onInput: (runtimeInput) => {
          for (const listener of inputListeners) listener(runtimeInput);
        },
        onSnapshot: (snapshot) => {
          for (const listener of snapshotListeners) listener(snapshot, false);
        },
        onTransition: (snapshot) => {
          for (const listener of snapshotListeners) listener(snapshot, true);
        },
        onEvent: (event, sequence) => {
          for (const listener of eventListeners) listener(event, sequence);
        },
      },
    });
    protocols.set(peerId, protocol);
    protocol.start();
  };

  const offMessages = channel.onMessage((peerId, message) => {
    // y-webrtc creates a mesh. A joining peer only establishes a runtime protocol with the host;
    // peer-to-peer gameplay state is deliberately unsupported.
    if (!host && message.type === "hello" && message.hello.authority !== "host") return;
    attach(peerId);
    const result = protocols.get(peerId)?.receive(message);
    if (result !== undefined && !result.ok) {
      for (const listener of errorListeners) listener(result.error);
    }
  });
  const offPeer = channel.onPeer(attach);
  const peers = (): PeerInfo[] => toPeerInfo(awareness.getStates(), awareness.clientID);
  const signalingStatus = (): SignalingStatus[] => signalingStatusOf(provider);
  let left = false;

  const sendToVerified = (send: (peer: SessionPeer) => Result<void>): void => {
    for (const [peerId, protocol] of protocols) {
      if (verified.has(peerId)) send(protocol);
    }
  };

  return ok({
    code,
    host,
    instance: input.instance,
    profile: input.profile,
    provider,
    signaling,
    peers,
    onPeers(listener) {
      const handler = () => listener(peers());
      awareness.on("change", handler);
      provider.on("peers", handler);
      return () => {
        awareness.off("change", handler);
        provider.off("peers", handler);
      };
    },
    signalingStatus,
    onStatus(listener) {
      return onSignalingChange(provider, () => listener(signalingStatus()));
    },
    verifiedPeerCount: () => verified.size,
    onVerified(listener) {
      verifiedListeners.add(listener);
      if (verified.size > 0) listener();
      return () => verifiedListeners.delete(listener);
    },
    onError(listener) {
      errorListeners.add(listener);
      return () => errorListeners.delete(listener);
    },
    onInput(listener) {
      inputListeners.add(listener);
      return () => inputListeners.delete(listener);
    },
    onSnapshot(listener) {
      snapshotListeners.add(listener);
      return () => snapshotListeners.delete(listener);
    },
    onEvent(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    sendInput(runtimeInput) {
      if (host) return err("session-authority-violation", "The host applies input directly.");
      const protocol = [...protocols.entries()].find(([peerId]) => verified.has(peerId))?.[1];
      return (
        protocol?.sendInput(runtimeInput) ??
        err("session-not-verified", "The runtime handshake is not complete.")
      );
    },
    broadcastSnapshot(snapshot) {
      sendToVerified((protocol) => protocol.sendSnapshot(snapshot));
    },
    broadcastTransition(snapshot) {
      sendToVerified((protocol) => protocol.sendTransition(snapshot));
    },
    broadcastEvent(event, sequence) {
      sendToVerified((protocol) => protocol.sendEvent(event, sequence));
    },
    leave() {
      if (left) return;
      left = true;
      offPeer();
      offMessages();
      channel.close();
      protocols.clear();
      verified.clear();
      awareness.setLocalState(null);
      provider.disconnect();
      provider.destroy();
      doc.destroy();
    },
  });
}

export function createRoom(input: OpenRoomInput, options?: RoomOptions): Result<Room> {
  return open(generateRoomCode(), true, input, options);
}

export function joinRoom(code: string, input: OpenRoomInput, options?: RoomOptions): Result<Room> {
  const normalized = normalizeRoomCode(code);
  if (!isValidRoomCode(normalized)) {
    return err(
      "room-bad-code",
      `"${code}" is not a room code.`,
      `Codes are ${ROOM_CODE_LENGTH} characters from ${ROOM_CODE_ALPHABET}.`,
    );
  }
  return open(normalized, false, input, options);
}

export type { PeerInfo } from "./peers";
