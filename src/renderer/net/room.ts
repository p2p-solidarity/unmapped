// y-webrtc room around a Y.Doc. The room carries the world (world.oui + mutation overlay + karma, mirrored in
// sync.ts) and presence (name + floor, via awareness). No per-frame data crosses the wire.
//
// Signaling defaults come from y-webrtc 10.3.0 itself (`wss://y-webrtc-eu.fly.dev`); pass
// `signaling` to point at your own server, and `password` to encrypt the room's traffic.

import { useWorldStore } from "@renderer/state";
import { err, ok, type Result } from "@shared/result";
import { WebrtcProvider } from "y-webrtc";
import * as Y from "yjs";
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

/** y-webrtc 10.3.0's own default list. */
export const DEFAULT_SIGNALING: readonly string[] = ["wss://y-webrtc-eu.fly.dev"];
export const PLAYER_NAME_KEY = "aether.playerName";

export interface SignalingStatus {
  url: string;
  connected: boolean;
  /** > 0 while the socket keeps failing — that is how "unreachable" is told from "connecting". */
  unsuccessfulReconnects: number;
}

export interface RoomOptions {
  signaling?: string[];
  password?: string;
}

export interface Room {
  code: string;
  /** The world being shared; null for a joiner, which mirrors whatever the host publishes. */
  worldId: string | null;
  /** The creator owns world.oui; joiners follow it. */
  host: boolean;
  doc: Y.Doc;
  provider: WebrtcProvider;
  signaling: string[];
  peers(): PeerInfo[];
  onPeers(listener: (peers: PeerInfo[]) => void): () => void;
  signalingStatus(): SignalingStatus[];
  onStatus(listener: (status: SignalingStatus[]) => void): () => void;
  leave(): void;
}

/** The shape lib0's WebsocketClient exposes; y-webrtc types `signalingConns` loosely. */
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
    // Storage disabled: fall through and use a throwaway name for this session.
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
    // Storage disabled: the name still applies to this session's awareness state.
  }
}

function connections(provider: WebrtcProvider): SignalingConnLike[] {
  return provider.signalingConns as SignalingConnLike[];
}

function open(
  code: string,
  worldId: string | null,
  host: boolean,
  options: RoomOptions | undefined,
): Result<Room> {
  const signaling = options?.signaling ?? [...DEFAULT_SIGNALING];
  if (signaling.length === 0) {
    return err(
      "room-no-signaling",
      "No signaling server configured.",
      "Leave the signaling option unset to use the y-webrtc defaults.",
    );
  }

  const doc = new Y.Doc();
  let provider: WebrtcProvider;
  try {
    provider = new WebrtcProvider(roomName(code), doc, {
      signaling,
      password: options?.password,
    });
  } catch (cause) {
    doc.destroy();
    const message = cause instanceof Error ? cause.message : String(cause);
    return err(
      "room-failed",
      `Could not open the peer connection: ${message}`,
      "WebRTC is unavailable in this window.",
    );
  }

  const awareness = provider.awareness;
  awareness.setLocalState({ name: playerName(), floor: useWorldStore.getState().floor });

  const peers = (): PeerInfo[] => toPeerInfo(awareness.getStates(), awareness.clientID);
  const signalingStatus = (): SignalingStatus[] =>
    connections(provider).map((conn) => ({
      url: conn.url,
      connected: conn.connected,
      unsuccessfulReconnects: conn.unsuccessfulReconnects,
    }));

  let left = false;

  return ok({
    code,
    worldId,
    host,
    doc,
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
      const handler = () => listener(signalingStatus());
      const conns = connections(provider);
      for (const conn of conns) {
        conn.on("connect", handler);
        conn.on("disconnect", handler);
      }
      return () => {
        for (const conn of conns) {
          conn.off("connect", handler);
          conn.off("disconnect", handler);
        }
      };
    },
    leave() {
      if (left) return;
      left = true;
      awareness.setLocalState(null);
      provider.disconnect();
      provider.destroy();
    },
  });
}

export function createRoom(worldId: string, options?: RoomOptions): Result<Room> {
  if (worldId.trim().length === 0) {
    return err(
      "room-no-world",
      "No world to share.",
      "Open a world first — the host publishes its world.oui to the room.",
    );
  }
  return open(generateRoomCode(), worldId, true, options);
}

export function joinRoom(code: string, options?: RoomOptions): Result<Room> {
  const normalized = normalizeRoomCode(code);
  if (!isValidRoomCode(normalized)) {
    return err(
      "room-bad-code",
      `"${code}" is not a room code.`,
      `Codes are ${ROOM_CODE_LENGTH} characters from ${ROOM_CODE_ALPHABET}.`,
    );
  }
  return open(normalized, null, false, options);
}

export type { PeerInfo } from "./peers";
