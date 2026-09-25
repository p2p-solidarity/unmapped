// The continent room: one y-webrtc room per continent, its Y.Doc holding every merged world's
// public face (continentDoc.ts) and its awareness carrying where each player stands. There is no
// host: each world writes only its own entries, so worlds from different cartridges can merge —
// no cartridge bytes, rules or story ever cross the room, only the land as it was witnessed.
//
// The code of a continent is the door number of whoever opened it (plateOf); anyone who knows it
// can bring their own world in.

import type { AppError } from "@shared/result";
import { err, ok, type Result } from "@shared/result";
import { useSyncExternalStore } from "react";
import { WebrtcProvider } from "y-webrtc";
import * as Y from "yjs";
import {
  isValidRoomCode,
  normalizeRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  roomName,
} from "./codes";
import { removeWorld } from "./continentDoc";
import {
  DEFAULT_SIGNALING,
  onSignalingChange,
  type RoomOptions,
  type SignalingStatus,
  signalingStatusOf,
} from "./room";

/** Time for the goodbye (our entry removed, presence cleared) to leave before the room closes. */
const GOODBYE_MS = 300;
const CONTINENT_PREFIX = "continent";

export interface Continent {
  code: string;
  /** This machine's world (its instance id). */
  worldId: string;
  doc: Y.Doc;
  provider: WebrtcProvider;
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
}

export function openContinent(
  input: OpenContinentInput,
  options?: RoomOptions,
): Result<Continent, AppError> {
  const code = normalizeRoomCode(input.code);
  if (!isValidRoomCode(code)) {
    return err(
      "room-bad-code",
      `"${input.code}" is not a door number.`,
      `Door numbers are ${ROOM_CODE_LENGTH} characters from ${ROOM_CODE_ALPHABET}.`,
    );
  }
  const signaling = options?.signaling ?? [...DEFAULT_SIGNALING];
  if (signaling.length === 0) return err("room-no-signaling", "No signaling server configured.");
  const doc = new Y.Doc();
  let provider: WebrtcProvider;
  try {
    provider = new WebrtcProvider(`${roomName(code)}:${CONTINENT_PREFIX}`, doc, {
      signaling,
      password: options?.password,
    });
  } catch (cause) {
    doc.destroy();
    const message = cause instanceof Error ? cause.message : String(cause);
    return err("room-failed", `Could not open the peer connection: ${message}`);
  }
  provider.awareness.setLocalState({ name: input.name, worldId: input.worldId });

  let left = false;
  return ok({
    code,
    worldId: input.worldId,
    doc,
    provider,
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
      provider.on("peers", listener);
      provider.awareness.on("change", listener);
      return () => {
        offSignaling();
        provider.off("peers", listener);
        provider.awareness.off("change", listener);
      };
    },
    leave() {
      if (left) return;
      left = true;
      // Take this world with us: the others stop drawing it at once instead of keeping a ghost.
      removeWorld(doc, input.worldId);
      provider.awareness.setLocalState(null);
      setTimeout(() => {
        provider.disconnect();
        provider.destroy();
        doc.destroy();
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
