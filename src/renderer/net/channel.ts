import type { SessionMessage } from "@shared/session";
import type { WebrtcProvider } from "y-webrtc";

const Y_WEBRTC_BC_PEER_MESSAGE = 4;
const Y_WEBRTC_REMOVE_PEER = 0;
const NAMESPACE = "unwritten-land-session-v1";
const MAX_MESSAGE_BYTES = 1024 * 1024;

interface PeerLike {
  send(data: Uint8Array): void;
  on(event: "connect", listener: () => void): void;
  on(event: "data", listener: (data: Uint8Array) => void): void;
  off?(event: "connect", listener: () => void): void;
  off?(event: "data", listener: (data: Uint8Array) => void): void;
}

interface ConnectionLike {
  remotePeerId: string;
  connected: boolean;
  peer: PeerLike;
}

interface ProviderRoomLike {
  webrtcConns: Map<string, ConnectionLike>;
}

interface PeerChange {
  added: string[];
  removed: string[];
}

function encodeVarUint(value: number): number[] {
  const bytes: number[] = [];
  let remaining = value;
  while (remaining > 127) {
    bytes.push((remaining & 127) | 128);
    remaining = Math.floor(remaining / 128);
  }
  bytes.push(remaining);
  return bytes;
}

function decodeVarUint(
  bytes: Uint8Array,
  offset: number,
): { value: number; offset: number } | null {
  let value = 0;
  let shift = 0;
  let cursor = offset;
  while (cursor < bytes.length && shift <= 28) {
    const byte = bytes[cursor];
    if (byte === undefined) return null;
    value += (byte & 127) * 2 ** shift;
    cursor += 1;
    if ((byte & 128) === 0) return { value, offset: cursor };
    shift += 7;
  }
  return null;
}

/**
 * Uses y-webrtc's reliable ordered RTCDataChannel without putting runtime state in its Y.Doc.
 * The outer frame is a harmless "remove unknown broadcast peer" message, so y-webrtc ignores it
 * while this module reads the namespaced payload from a second data listener.
 */
export function encodeSessionMessage(message: SessionMessage): Uint8Array {
  const payload = new TextEncoder().encode(JSON.stringify({ namespace: NAMESPACE, message }));
  if (payload.byteLength > MAX_MESSAGE_BYTES) throw new Error("session message is too large");
  const length = encodeVarUint(payload.byteLength);
  return new Uint8Array([Y_WEBRTC_BC_PEER_MESSAGE, Y_WEBRTC_REMOVE_PEER, ...length, ...payload]);
}

export function decodeSessionMessage(data: Uint8Array): SessionMessage | null {
  if (data.byteLength < 4 || data.byteLength > MAX_MESSAGE_BYTES + 8) return null;
  if (data[0] !== Y_WEBRTC_BC_PEER_MESSAGE || data[1] !== Y_WEBRTC_REMOVE_PEER) return null;
  const decodedLength = decodeVarUint(data, 2);
  if (decodedLength === null || decodedLength.value > MAX_MESSAGE_BYTES) return null;
  if (decodedLength.offset + decodedLength.value !== data.byteLength) return null;
  try {
    const decoded: unknown = JSON.parse(
      new TextDecoder().decode(
        data.subarray(decodedLength.offset, decodedLength.offset + decodedLength.value),
      ),
    );
    if (
      decoded === null ||
      typeof decoded !== "object" ||
      (decoded as { namespace?: unknown }).namespace !== NAMESPACE
    ) {
      return null;
    }
    const message = (decoded as { message?: unknown }).message;
    return isSessionMessage(message) ? message : null;
  } catch {
    return null;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validHello(value: unknown): boolean {
  if (
    !record(value) ||
    !record(value.cartridge) ||
    !record(value.moduleLock) ||
    !record(value.modLock)
  ) {
    return false;
  }
  return (
    typeof value.sessionId === "string" &&
    (value.authority === "host" || value.authority === "peer") &&
    typeof value.cartridge.cartridgeId === "string" &&
    typeof value.cartridge.version === "string" &&
    typeof value.cartridge.contentHash === "string" &&
    typeof value.contentHash === "string" &&
    typeof value.profileHash === "string" &&
    typeof value.effectiveHash === "string" &&
    Array.isArray(value.moduleLock.entries) &&
    Array.isArray(value.modLock.entries) &&
    typeof value.modLock.lockHash === "string" &&
    Number.isSafeInteger(value.engineApiVersion) &&
    Number.isSafeInteger(value.networkProtocolVersion) &&
    typeof value.playerProfileId === "string"
  );
}

function validSnapshot(value: unknown): boolean {
  return (
    record(value) &&
    Number.isSafeInteger(value.sequence) &&
    typeof value.currentSceneId === "string" &&
    record(value.flags) &&
    record(value.inventory) &&
    Array.isArray(value.karma) &&
    Array.isArray(value.completedSceneIds) &&
    value.completedSceneIds.every((sceneId) => typeof sceneId === "string") &&
    typeof value.updatedAt === "string"
  );
}

function validInput(value: unknown): boolean {
  if (!record(value) || typeof value.kind !== "string") return false;
  if (value.kind === "complete") return true;
  if (value.kind === "transition") return typeof value.targetSceneId === "string";
  if (value.kind === "action") return typeof value.action === "string";
  return (
    value.kind === "interact" &&
    record(value.target) &&
    ["npc", "monster", "treasure", "exit", "trigger", "altar"].includes(
      String(value.target.kind),
    ) &&
    typeof value.target.id === "string" &&
    typeof value.target.label === "string" &&
    typeof value.target.distance === "number" &&
    Number.isFinite(value.target.distance)
  );
}

function isSessionMessage(value: unknown): value is SessionMessage {
  if (!record(value)) return false;
  if (value.type === "hello") return validHello(value.hello);
  if (value.type === "reject") {
    return (
      record(value.error) &&
      typeof value.error.code === "string" &&
      typeof value.error.message === "string"
    );
  }
  if (value.type === "input") return validInput(value.input);
  if (value.type === "snapshot" || value.type === "transition")
    return validSnapshot(value.snapshot);
  return (
    value.type === "event" &&
    Number.isSafeInteger(value.sequence) &&
    record(value.event) &&
    typeof value.event.id === "string" &&
    typeof value.event.kind === "string" &&
    record(value.event.payload)
  );
}

export interface SessionChannel {
  peerIds(): string[];
  send(peerId: string, message: SessionMessage): boolean;
  onPeer(listener: (peerId: string) => void): () => void;
  onMessage(listener: (peerId: string, message: SessionMessage) => void): () => void;
  close(): void;
}

export function openSessionChannel(provider: WebrtcProvider): SessionChannel {
  const peerListeners = new Set<(peerId: string) => void>();
  const messageListeners = new Set<(peerId: string, message: SessionMessage) => void>();
  const attached = new Map<
    string,
    {
      peer: PeerLike;
      dataListener: (data: Uint8Array) => void;
      connectListener: () => void;
      ready: boolean;
    }
  >();

  const room = () => provider.room as ProviderRoomLike | null;
  const attach = (peerId: string): void => {
    if (attached.has(peerId)) return;
    const connection = room()?.webrtcConns.get(peerId);
    if (connection === undefined) return;
    const markReady = () => {
      const current = attached.get(peerId);
      if (current === undefined || current.ready) return;
      current.ready = true;
      for (const notify of peerListeners) notify(peerId);
    };
    const dataListener = (data: Uint8Array) => {
      markReady();
      const message = decodeSessionMessage(new Uint8Array(data));
      if (message === null) return;
      for (const notify of messageListeners) notify(peerId, message);
    };
    connection.peer.on("connect", markReady);
    connection.peer.on("data", dataListener);
    attached.set(peerId, {
      peer: connection.peer,
      dataListener,
      connectListener: markReady,
      ready: false,
    });
    if (connection.connected) markReady();
  };
  const detach = (peerId: string): void => {
    const current = attached.get(peerId);
    if (current === undefined) return;
    current.peer.off?.("connect", current.connectListener);
    current.peer.off?.("data", current.dataListener);
    attached.delete(peerId);
  };
  const onPeers = (change: PeerChange) => {
    for (const peerId of change.removed) detach(peerId);
    for (const peerId of change.added) attach(peerId);
  };
  provider.on("peers", onPeers);
  for (const peerId of room()?.webrtcConns.keys() ?? []) attach(peerId);

  return {
    peerIds: () => [...attached].filter(([, entry]) => entry.ready).map(([peerId]) => peerId),
    send(peerId, message) {
      const connection = attached.get(peerId);
      if (connection === undefined || !connection.ready) return false;
      try {
        connection.peer.send(encodeSessionMessage(message));
        return true;
      } catch {
        return false;
      }
    },
    onPeer(listener) {
      peerListeners.add(listener);
      for (const [peerId, entry] of attached) {
        if (entry.ready) listener(peerId);
      }
      return () => peerListeners.delete(listener);
    },
    onMessage(listener) {
      messageListeners.add(listener);
      return () => messageListeners.delete(listener);
    },
    close() {
      provider.off("peers", onPeers);
      for (const peerId of [...attached.keys()]) detach(peerId);
      peerListeners.clear();
      messageListeners.clear();
    },
  };
}
