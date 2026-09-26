// Walking keeps a place (rev 6 phase 3, D3, D13): the chunks of this world the player walks
// through are written as one `visit` a day (≤ 64 chunks; the fold counts one per author per UTC
// receipt day and adds a point of care to each chunk, once). Nothing is written for another
// world's territory on a continent, and nothing when this device does not write the world.
//
// The visit is sent when the player leaves Play, once 64 chunks are walked, or after a quarter of
// an hour of play — whichever comes first — and never twice a day.

import { foreignAt, openWorld, useEngineStore } from "@renderer/state";
import { type ChunkCoord, chunkKey } from "@shared/chunks";
import { HISTORY_LIMITS } from "@shared/history/bodies";
import { DAY_MS } from "@shared/history/ids";
import { useEffect } from "react";
import { appendToWorld, myKey, onHistory, seenHead, worldNow, writeBlocker } from "./write";

const VISIT_AFTER_MS = 15 * 60 * 1000;

function today(): number {
  return Math.floor(Date.now() / DAY_MS);
}

/** Whether the fold already holds today's visit of this device. */
function visitedToday(): boolean {
  const me = myKey();
  const now = worldNow();
  return me === null || now === null || now.lastVisit[me] === today();
}

let walked = new Map<string, ChunkCoord>();
/** The day each world's visit was last sent, by world id: one world never counts for another. */
const sentOn = new Map<string, number>();

async function sendVisit(): Promise<void> {
  const worldId = openWorld()?.worldId;
  if (walked.size === 0 || worldId === undefined || writeBlocker() !== null) return;
  if (sentOn.get(worldId) === today() || visitedToday()) {
    walked = new Map();
    return;
  }
  const chunks = [...walked.values()].slice(0, HISTORY_LIMITS.visitChunks);
  walked = new Map();
  sentOn.set(worldId, today());
  const sent = await appendToWorld({ kind: "visit", body: { chunks }, seen: seenHead() });
  if (!sent.ok && sent.error.code !== "visit-today") {
    console.warn(`[world] visit not written: ${sent.error.code} ${sent.error.message}`);
  }
}

/** Mounted by Play: collects the chunks walked and writes the day's visit. */
export function useWorldVisits(): void {
  useEffect(() => {
    // Chunks walked belong to the world open when Play mounted this hook; never carry them over.
    walked = new Map();
    const timer = setInterval(() => void sendVisit(), VISIT_AFTER_MS);
    const stop = useEngineStore.subscribe((state, previous) => {
      const chunk = state.chunk;
      if (chunk === null || chunk === previous.chunk || !onHistory()) return;
      if (foreignAt(chunk) !== null) return;
      walked.set(chunkKey(chunk), { cx: chunk.cx, cz: chunk.cz });
      if (walked.size >= HISTORY_LIMITS.visitChunks) void sendVisit();
    });
    return () => {
      clearInterval(timer);
      stop();
      void sendVisit();
    };
  }, []);
}
