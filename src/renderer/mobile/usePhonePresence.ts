// Presence on the phone (rev 6 phase 4, D7, over P3 D17): while the world's service answers, where
// this player stands goes out a few times a second, and everyone else's comes back and is drawn on
// the land through the same roster the desktop feeds (`hearPresence`, engine/remoteRoster), so the
// land view never learns it runs in a page. As the desktop's net/worldPresence does, without its
// desktop-only open-world seam: sent at most 4 times a second when something changed (to 1/100 of a
// tile) and every 2 s regardless; every frame that arrives is untrusted and checked again here. A
// phone has no places and no emotes, so it sends neither. Presence is never kept.

import { samplePlayer, samplePose } from "@renderer/engine/playerProbe";
import { clearPresence, hearPresence, renamePresence } from "@renderer/engine/remoteRoster";
import { translate } from "@renderer/i18n";
import { AUTHOR_KEY } from "@shared/history/ids";
import type { WorldNow } from "@shared/history/types";
import type { WorldPresenceEvent } from "@shared/worldApi";
import { type Presence, presenceSchema } from "@shared/worldProtocol";
import { useEffect, useRef } from "react";

const TICK_MS = 250;
const HEARTBEAT_MS = 2000;

const hundredth = (value: number): number => Math.round(value * 100) / 100;

/** Where this player stands now, or null while no land is drawn. */
function currentPresence(): Presence | null {
  const where = samplePlayer();
  if (where === null) return null;
  const pose = samplePose();
  const presence: Presence = {
    x: hundredth(where.x),
    z: hundredth(where.z),
    facing: pose?.facing ?? "south",
    moving: pose?.moving ?? false,
    place: null,
    emote: null,
  };
  return presenceSchema.safeParse(presence).success ? presence : null;
}

function samePresence(a: Presence, b: Presence): boolean {
  return a.x === b.x && a.z === b.z && a.facing === b.facing && a.moving === b.moving;
}

/** A presence event read as untrusted: this world, a well-formed key, a strict presence. */
function readPresence(
  event: WorldPresenceEvent,
  worldId: string,
): { from: string; p: Presence | null } | null {
  if (event.world !== worldId || !AUTHOR_KEY.test(event.from)) return null;
  const parsed = presenceSchema.nullable().safeParse(event.p);
  return parsed.success ? { from: event.from, p: parsed.data } : null;
}

function nameIn(now: WorldNow, key: string): string {
  return now.names[key] ?? translate("mobile.someone");
}

export function usePhonePresence(input: {
  worldId: string;
  online: boolean;
  now: WorldNow;
  /** This device's author key: its own frames, if a service echoed them, are not drawn. */
  me: string | null;
}): void {
  const { worldId, online, now, me } = input;
  const names = useRef({ now, me });
  names.current = { now, me };

  useEffect(() => {
    if (!online) return;
    let last: Presence | null = null;
    let lastSent = 0;
    const send = (presence: Presence | null): void => {
      void window.seed.world.sendPresence(worldId, presence).then((sent) => {
        // A dropped link says so in the world's status; presence waits for the next tick.
        if (!sent.ok) console.warn(`[presence] ${sent.error.code}: ${sent.error.message}`);
      });
    };
    const tick = (): void => {
      const presence = currentPresence();
      const at = performance.now();
      if (presence === null) return;
      if (last !== null && samePresence(last, presence) && at - lastSent < HEARTBEAT_MS) return;
      last = presence;
      lastSent = at;
      send(presence);
    };
    const offPresence = window.seed.world.onPresence((event) => {
      const heard = readPresence(event, worldId);
      if (heard === null || heard.from === names.current.me) return;
      hearPresence(heard.from, nameIn(names.current.now, heard.from), heard.p, performance.now());
    });
    const timer = setInterval(tick, TICK_MS);
    tick();
    return () => {
      clearInterval(timer);
      offPresence();
      if (last !== null) send(null);
      clearPresence();
    };
  }, [worldId, online]);

  // A join or a profile in the fold names someone who was only a key so far.
  useEffect(() => {
    renamePresence((key) => nameIn(now, key));
  }, [now]);
}
