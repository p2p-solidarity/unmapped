// Other players, as the network last reported them (a few times a second). Kept outside zustand
// like every other position (Rule 4); the network writes, the scene reads.
//
// Two sources: a continent's awareness (`setRemotePlayers`, drawn as reported) and a shared world's
// presence (rev 6 phase 3, D17: `hearPresence`, smoothed by engine2d/remoteMotion). The land draws
// both through `sampleRemotePlayers(now)`, so the two looks show the same positions. An emote is a
// bubble for EMOTE_MS; this player's own shows over their own head. Nothing here is ever saved.

import type { Emote, Facing, Presence } from "@shared/worldProtocol";
import { advanceMotion, type MotionTrack, receiveSample } from "../engine2d/remoteMotion";

/** How long an emote bubble stays up. */
export const EMOTE_MS = 3000;

export interface EmoteBubble {
  kind: Emote;
  /** Local time it began (ms, `performance.now()`). */
  at: number;
}

export interface RemotePlayer {
  clientId: number;
  name: string;
  x: number;
  y: number;
  z: number;
  /** Which way they face and whether they walk, as their own land view last reported it. */
  facing: "north" | "south" | "east" | "west";
  moving: boolean;
  /** A shared world's player: their emote bubble while it lasts. */
  emote?: EmoteBubble | null;
}

let players: RemotePlayer[] = [];
const listeners = new Set<() => void>();

export function setRemotePlayers(next: RemotePlayer[]): void {
  players = next;
  for (const listener of listeners) listener();
}

export function getRemotePlayers(): RemotePlayer[] {
  return players;
}

export function subscribeRemotePlayers(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ── A shared world's presence ─────────────────────────────────────────────────────────────────

interface WorldPlayer {
  clientId: number;
  name: string;
  facing: Facing;
  moving: boolean;
  track: MotionTrack;
  emote: EmoteBubble | null;
  /** The last emote counter heard: a resend of the same one is not shown again. */
  emoteN: number | null;
}

const world = new Map<string, WorldPlayer>();
let own: EmoteBubble | null = null;

/** A stable negative id per key, never one of awareness' own (positive) client ids. */
function clientIdOf(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) hash = Math.imul(hash ^ key.charCodeAt(i), 0x01000193);
  return -1 - ((hash >>> 0) % 0x7fffffff);
}

/**
 * One presence frame from `key` (already validated), heard at `now`. Null means they left; a
 * player inside a place is not on this land, so they are not drawn on it either.
 */
export function hearPresence(key: string, name: string, p: Presence | null, now: number): void {
  if (p === null || p.place !== null) {
    world.delete(key);
    return;
  }
  const before = world.get(key);
  const fresh = p.emote !== null && p.emote.n !== (before?.emoteN ?? null);
  world.set(key, {
    clientId: before?.clientId ?? clientIdOf(key),
    name,
    facing: p.facing,
    moving: p.moving,
    track: receiveSample(before?.track ?? null, { x: p.x, z: p.z, moving: p.moving }, now),
    emote: fresh && p.emote !== null ? { kind: p.emote.kind, at: now } : (before?.emote ?? null),
    emoteN: p.emote?.n ?? before?.emoteN ?? null,
  });
}

/** Renames a player the world's history now knows by name. */
export function renamePresence(nameOf: (key: string) => string): void {
  for (const [key, player] of world) player.name = nameOf(key);
}

export function clearPresence(): void {
  world.clear();
  own = null;
}

/** This player's own emote, shown over their head in both looks. */
export function showOwnEmote(kind: Emote, now: number): void {
  own = { kind, at: now };
}

export function ownEmote(now: number): EmoteBubble | null {
  return own !== null && now - own.at < EMOTE_MS ? own : null;
}

/**
 * Everyone to draw this frame: the continent's players as reported, and the world's players
 * where remoteMotion puts them now. Drops world players nobody heard from for too long.
 */
export function sampleRemotePlayers(now: number): RemotePlayer[] {
  if (world.size === 0) return players;
  const out = [...players];
  for (const [key, player] of world) {
    const step = advanceMotion(player.track, now);
    if (step === null) {
      world.delete(key);
      continue;
    }
    player.track = step.track;
    const emote = player.emote !== null && now - player.emote.at < EMOTE_MS ? player.emote : null;
    out.push({
      clientId: player.clientId,
      name: player.name,
      x: step.at.x,
      y: 0,
      z: step.at.z,
      facing: player.facing,
      moving: player.moving,
      emote,
    });
  }
  return out;
}
