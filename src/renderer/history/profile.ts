// The player's name in the open world (rev 6 phase 3, D3 `profile`: latest wins in the fold's
// names). The name is a device preference (net/room.ts `playerName`, set by Join and the room
// panel; a session profile's display name wins); a world learns it from the migration's first
// `profile` or its `member.join`. When the name here and the fold's name for this key differ, one
// `profile` event is written through `appendToWorld`: at once while the world is open, else when
// it next opens (the history store becoming ready runs the same check).
//
// At most one event per change: the name last written, and any whose append failed, is not asked
// for again in that world (a refusal would otherwise be retried on every fold) until another name
// is written. No event when nothing changed, and none for a key the fold names nowhere (a visitor
// who never joined).

import { onPlayerNameChange } from "@renderer/net/room";
import { openWorld, useHistoryStore, useSessionStore } from "@renderer/state";
import type { WorldNow } from "@shared/history/types";
import { displayNameOf, worldDisplayName } from "./session";
import { appendToWorld, seenHead, writeBlocker } from "./write";

/**
 * The name to write for `me` into `now`, or null: none when the fold does not name this key yet,
 * when it already says `name` (spelled as the world keeps names), or when `name` was the last one
 * written into this world or its append failed (`asked`).
 */
export function profileToWrite(
  now: WorldNow,
  me: string,
  name: string,
  asked: ReadonlySet<string>,
): string | null {
  const known = now.names[me];
  if (known === undefined || displayNameOf(known) === name) return null;
  return asked.has(`${now.world}|${me}|${name}`) ? null : name;
}

const asked = new Set<string>();
let writing = false;

async function syncProfile(): Promise<void> {
  const open = openWorld();
  const me = open?.status.me ?? null;
  if (open === null || me === null || writing || writeBlocker() !== null) return;
  const name = profileToWrite(open.now, me, worldDisplayName(), asked);
  if (name === null) return;
  const key = `${open.worldId}|${me}|${name}`;
  asked.add(key);
  writing = true;
  try {
    const written = await appendToWorld({ kind: "profile", body: { name }, seen: seenHead() });
    if (written.ok) {
      // The world takes names again: only this one stays asked (so nothing repeats it), and an
      // earlier failed one may be asked for again.
      asked.clear();
      asked.add(key);
    } else {
      console.warn(`[world] name not written: ${written.error.code} ${written.error.message}`);
    }
  } finally {
    writing = false;
  }
  // The name may have changed again while this one was written.
  void syncProfile();
}

onPlayerNameChange(() => void syncProfile());
useSessionStore.subscribe((state, previous) => {
  if (state.playerProfile?.displayName !== previous.playerProfile?.displayName) void syncProfile();
});
// The world opening (or becoming writable, or its fold moving) runs the same check; it is cheap.
useHistoryStore.subscribe((state, previous) => {
  if (state.world !== previous.world || state.blocked !== previous.blocked) void syncProfile();
});
