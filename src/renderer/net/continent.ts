// The continent room: one y-webrtc room per continent. Each machine's continent Y.Doc holds every
// merged world's public face (continentDoc.ts); its entries cross only to peers whose hello passed
// (continentGate.ts) — the room's own y-webrtc document stays empty, so nothing syncs by itself.
// Awareness carries where each player stands. There is no host: each world writes only its own
// entries, so worlds from different cartridges can merge — no cartridge bytes, rules or story ever
// cross the room, only the land as it was witnessed.
//
// The code of a continent is the join code of whoever opened it (plateOf, the player's "加入碼");
// anyone who knows it can bring their own world in. Players never see the word "continent": for
// them this is inviting friends and joining a world (simplify-together).

import { continentHello, isContinentMessage } from "@shared/continentHello";
import type { AppError } from "@shared/result";
import { err, ok, type Result } from "@shared/result";
import { useSyncExternalStore } from "react";
import { WebrtcProvider } from "y-webrtc";
import * as Y from "yjs";
import { openChannel } from "./channel";
import {
  isValidRoomCode,
  normalizeRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  roomName,
} from "./codes";
import { removeWorld } from "./continentDoc";
import { type ContinentGate, gateContinent } from "./continentGate";
import {
  onSignalingChange,
  type RoomOptions,
  retryStuckSignaling,
  type SignalingStatus,
  signalingStatusOf,
} from "./room";
import { SIGNALING_RETRY_MS, signalingServers } from "./signaling";

/** Time for the goodbye (our entry removed, presence cleared) to leave before the room closes. */
const GOODBYE_MS = 300;
const CONTINENT_PREFIX = "continent";
const CONTINENT_NAMESPACE = "unwritten-land-continent-v1";

export interface Continent {
  code: string;
  /** This machine's world (its instance id). */
  worldId: string;
  /** This machine's copy of the continent; filled only through the gate. */
  doc: Y.Doc;
  provider: WebrtcProvider;
  /** Which peers passed the hello, and which were turned away. */
  gate: ContinentGate;
  /** The signaling servers this continent was opened with (this device's list at the time). */
  signaling: string[];
  signalingStatus(): SignalingStatus[];
  /** Direct peer connections that are actually open right now (not still being negotiated). */
  peerCount(): number;
  /** Signaling or peer connections changed. */
  onChange(listener: () => void): () => void;
  leave(): void;
}

export interface OpenContinentInput {
  code: string;
  worldId: string;
  /** Shown over this player's head on everyone else's land. */
  name: string;
  /** The physics this world was made on (its runtime pin); only worlds on the same one merge. */
  physicsVersion: number;
}

export function openContinent(
  input: OpenContinentInput,
  options?: RoomOptions,
): Result<Continent, AppError> {
  const code = normalizeRoomCode(input.code);
  if (!isValidRoomCode(code)) {
    return err(
      "room-bad-code",
      `"${input.code}" is not a join code.`,
      `A join code is ${ROOM_CODE_LENGTH} characters from ${ROOM_CODE_ALPHABET}.`,
    );
  }
  const signaling = options?.signaling ?? signalingServers();
  if (signaling.length === 0) {
    return err(
      "room-no-signaling",
      "No signaling server is set up.",
      "On the title screen open Settings → Advanced settings → Signaling servers and reset them.",
    );
  }
  const doc = new Y.Doc();
  // The room's document is never written: land goes through the gate, to verified peers only.
  const roomDoc = new Y.Doc();
  let provider: WebrtcProvider;
  try {
    provider = new WebrtcProvider(`${roomName(code)}:${CONTINENT_PREFIX}`, roomDoc, {
      signaling,
      password: options?.password,
    });
  } catch (cause) {
    doc.destroy();
    roomDoc.destroy();
    const message = cause instanceof Error ? cause.message : String(cause);
    return err("room-failed", `Could not open the connection to friends: ${message}`);
  }
  provider.awareness.setLocalState({ name: input.name, worldId: input.worldId });
  const stopRetrying = retryStuckSignaling(provider, SIGNALING_RETRY_MS);
  const channel = openChannel(provider, CONTINENT_NAMESPACE, isContinentMessage);
  const gate = gateContinent(
    doc,
    continentHello({ code, worldId: input.worldId, physicsVersion: input.physicsVersion }),
    channel,
  );

  let left = false;
  return ok({
    code,
    worldId: input.worldId,
    doc,
    provider,
    gate,
    signaling,
    signalingStatus: () => signalingStatusOf(provider),
    peerCount: () => {
      const room = (
        provider as unknown as { room: { webrtcConns: Map<string, { connected: boolean }> } | null }
      ).room;
      let open = 0;
      for (const conn of room?.webrtcConns.values() ?? []) if (conn.connected) open += 1;
      return open;
    },
    onChange(listener) {
      const offSignaling = onSignalingChange(provider, listener);
      const offGate = gate.onChange(listener);
      provider.on("peers", listener);
      provider.awareness.on("change", listener);
      return () => {
        offSignaling();
        offGate();
        provider.off("peers", listener);
        provider.awareness.off("change", listener);
      };
    },
    leave() {
      if (left) return;
      left = true;
      stopRetrying();
      // Take this world with us: the others stop drawing it at once instead of keeping a ghost.
      removeWorld(doc, input.worldId);
      provider.awareness.setLocalState(null);
      setTimeout(() => {
        gate.close();
        channel.close();
        provider.disconnect();
        provider.destroy();
        doc.destroy();
        roomDoc.destroy();
      }, GOODBYE_MS);
    },
  });
}

// ── The one continent this app is in ────────────────────────────────────────────────────────

let active: Continent | null = null;
const listeners = new Set<() => void>();

export function getActiveContinent(): Continent | null {
  return active;
}

/** Replaces the active continent, leaving the previous one. */
export function setActiveContinent(next: Continent | null): void {
  if (active === next) return;
  active?.leave();
  active = next;
  for (const listener of listeners) listener();
}

export function useActiveContinent(): Continent | null {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, getActiveContinent);
}
