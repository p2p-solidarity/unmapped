// A shared world's presence (rev 6 phase 3, D17): where this player stands goes to the world's
// service, and everyone else's comes back and is drawn on the land. Only while the world is
// attached, online and open in Play; a continent keeps its own awareness presence.
//
// Sent at most 4 times a second when something changed (a position rounded to 1/100 tile, facing,
// walking, the place they are in, an emote) and every 2 s regardless, so a listener that joined
// late hears them and one that did not hear for 10 s drops them. Positions are read from the land's
// pose probe, never from a store (Rule 4). Every frame that arrives is untrusted and checked again
// here with `presenceSchema`; names come from the world's fold. Presence is never saved.

import {
  getOpenWorld,
  type PlayedWorld,
  subscribeOpenWorld,
  writerName,
} from "@renderer/app/land/together";
import { isVisiting, samplePlayer, samplePose } from "@renderer/engine/playerProbe";
import {
  clearPresence,
  EMOTE_MS,
  hearPresence,
  renamePresence,
  showOwnEmote,
} from "@renderer/engine/remoteRoster";
import { useSessionStore } from "@renderer/state";
import { AUTHOR_KEY } from "@shared/history/ids";
import { PLACE_ID } from "@shared/places";
import { type Emote, type Presence, presenceSchema } from "@shared/worldProtocol";
import { useEffect, useSyncExternalStore } from "react";

const TICK_MS = 250;
const HEARTBEAT_MS = 2000;

/** The world presence goes to: attached, online, and the one Play has open. */
export function presenceWorld(): PlayedWorld | null {
  const open = getOpenWorld();
  const session = useSessionStore.getState();
  if (open === null || open.status.link !== "online" || session.screen !== "play") return null;
  return session.activeInstance?.instance.meta.instanceId === open.instanceId ? open : null;
}

function subscribeLive(listener: () => void): () => void {
  const offWorld = subscribeOpenWorld(listener);
  const offSession = useSessionStore.subscribe(listener);
  return () => {
    offWorld();
    offSession();
  };
}

const isLive = (): boolean => presenceWorld() !== null;

/** Whether anyone can see this player right now (the emote wheel is offered only then). */
export function usePresenceLive(): boolean {
  return useSyncExternalStore(subscribeLive, isLive, isLive);
}

let emote: { kind: Emote; n: number; at: number } | null = null;
let emotes = 0;

/** Plays an emote: a bubble over this player at once, and on everyone's screen with the next send. */
export function sendEmote(kind: Emote): void {
  const now = performance.now();
  emotes = (emotes + 1) % 0x7fffffff;
  emote = { kind, n: emotes, at: now };
  showOwnEmote(kind, now);
}

const hundredth = (value: number): number => Math.round(value * 100) / 100;

/** Where this player stands now, or null when they are nowhere this world's players could see. */
function currentPresence(now: number): Presence | null {
  const where = samplePlayer();
  if (where === null || isVisiting(where)) return null;
  const place = useSessionStore.getState().place;
  // Inside a place that has no id the protocol knows (a chapter's climb): off the land for others.
  if (place !== null && !PLACE_ID.test(place.id)) return null;
  const pose = samplePose();
  const live = emote !== null && now - emote.at < EMOTE_MS ? emote : null;
  const presence: Presence = {
    x: hundredth(where.x),
    z: hundredth(where.z),
    facing: pose?.facing ?? "south",
    moving: place === null && (pose?.moving ?? false),
    place: place?.id ?? null,
    emote: live === null ? null : { kind: live.kind, n: live.n },
  };
  return presenceSchema.safeParse(presence).success ? presence : null;
}

/**
 * A presence event as main relayed it, read as untrusted: the world it names, a well-formed author
 * key, and a presence that passes `presenceSchema` (strict: no extra fields, bounded numbers).
 */
export function readPresence(
  event: unknown,
  worldId: string,
): { from: string; p: Presence | null } | null {
  if (typeof event !== "object" || event === null) return null;
  const { world, from, p } = event as Record<string, unknown>;
  if (world !== worldId || typeof from !== "string" || !AUTHOR_KEY.test(from)) return null;
  const parsed = presenceSchema.nullable().safeParse(p);
  return parsed.success ? { from, p: parsed.data } : null;
}

function samePresence(a: Presence, b: Presence): boolean {
  return (
    a.x === b.x &&
    a.z === b.z &&
    a.facing === b.facing &&
    a.moving === b.moving &&
    a.place === b.place &&
    a.emote?.n === b.emote?.n &&
    a.emote?.kind === b.emote?.kind
  );
}

/** Mounted once over the land: sends this player's presence and draws everyone else's. */
export function useWorldPresence(): void {
  useEffect(() => {
    let world: string | null = null;
    let last: Presence | null = null;
    let lastSent = 0;

    const send = (worldId: string, presence: Presence | null): void => {
      void window.seed.world.sendPresence(worldId, presence).then((sent) => {
        // A dropped link says so in the world's status; presence simply waits for the next tick.
        if (!sent.ok && sent.error.code !== "claim-offline") {
          console.warn(`[presence] ${sent.error.code}: ${sent.error.message}`);
        }
      });
    };
    const leave = (): void => {
      if (world !== null && last !== null) send(world, null);
      world = null;
      last = null;
      clearPresence();
    };
    const tick = (): void => {
      const open = presenceWorld();
      if (open === null || (world !== null && open.worldId !== world)) leave();
      if (open === null) return;
      world = open.worldId;
      const now = performance.now();
      const presence = currentPresence(now);
      if (presence === null) {
        // Off the land for now (a place without an id, another world's territory): say so once.
        if (last !== null) send(open.worldId, null);
        last = null;
        return;
      }
      if (last !== null && samePresence(last, presence) && now - lastSent < HEARTBEAT_MS) return;
      last = presence;
      lastSent = now;
      send(open.worldId, presence);
    };

    const offPresence = window.seed.world.onPresence((event) => {
      const open = presenceWorld();
      const heard = open === null ? null : readPresence(event, open.worldId);
      if (open === null || heard === null) return;
      hearPresence(heard.from, writerName(heard.from, open.now), heard.p, performance.now());
    });
    // A profile or a join in the fold names someone who was only a key so far.
    const offWorld = subscribeOpenWorld(() => {
      const open = getOpenWorld();
      if (open !== null) renamePresence((key) => writerName(key, open.now));
      if (presenceWorld() === null) leave();
    });
    const timer = setInterval(tick, TICK_MS);
    tick();
    return () => {
      clearInterval(timer);
      offPresence();
      offWorld();
      leave();
    };
  }, []);
}
