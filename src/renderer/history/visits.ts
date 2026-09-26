// Walking keeps a place (rev 6 phase 3, D3, D13): the chunks of this world the player walks
// through are written as one `visit` a day (≤ 64 chunks; the fold counts one per author per UTC
// receipt day and adds a point of care to each chunk, once). Nothing is written for another
// world's territory on a continent, and nothing when this device does not write the world.
//
// The visit is sent when the player leaves Play, once 64 chunks are walked, or after a quarter of
// an hour of play — whichever comes first — and never twice a day. Quitting the app from Play never
// leaves Play (the page just goes), so every walked chunk is also reported to main, which writes the
// walk as the day's visit on quit if this has not (`world.walked`; the fold keeps one a day).

import { foreignAt, openWorld, useEngineStore, useHistoryStore } from "@renderer/state";
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
/** How many chunks of `walked` main holds; a new chunk, or the world becoming writable, reports. */
let reported = 0;
/** The day each world's visit was last sent, by world id: one world never counts for another. */
const sentOn = new Map<string, number>();

function forget(): void {
  walked = new Map();
  reported = 0;
}

/** The walk not written yet, for main to write if the app quits first (D13). */
function reportWalk(): void {
  const worldId = openWorld()?.worldId;
  if (walked.size === reported || worldId === undefined || writeBlocker() !== null) return;
  if (sentOn.get(worldId) === today() || visitedToday()) return;
  reported = walked.size;
  void window.seed.world.walked(worldId, [...walked.values()].slice(0, HISTORY_LIMITS.visitChunks));
}

async function sendVisit(): Promise<void> {
  const worldId = openWorld()?.worldId;
  if (walked.size === 0 || worldId === undefined || writeBlocker() !== null) return;
  if (sentOn.get(worldId) === today() || visitedToday()) {
    forget();
    void window.seed.world.walked(worldId, []);
    return;
  }
  const chunks = [...walked.values()].slice(0, HISTORY_LIMITS.visitChunks);
  forget();
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
    forget();
    const timer = setInterval(() => void sendVisit(), VISIT_AFTER_MS);
    // The first chunk is walked while the world's history is still loading: report it once it is in.
    const stopReady = useHistoryStore.subscribe(reportWalk);
    const stop = useEngineStore.subscribe((state, previous) => {
      const chunk = state.chunk;
      if (chunk === null || chunk === previous.chunk || !onHistory()) return;
      if (foreignAt(chunk) !== null) return;
      walked.set(chunkKey(chunk), { cx: chunk.cx, cz: chunk.cz });
      if (walked.size >= HISTORY_LIMITS.visitChunks) void sendVisit();
      else reportWalk();
    });
    return () => {
      clearInterval(timer);
      stop();
      stopReady();
      void sendVisit();
    };
  }, []);
}
