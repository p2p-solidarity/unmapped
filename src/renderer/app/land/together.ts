// Witnessing together (rev 6 phase 3, D16): the seam between the land, which claims and generates
// (WP5: witness, chapters), and the stream relay and viewer (WP6). The claimant forwards its model
// text through `relayFor`; a device whose claim answered `writing` follows someone else's stream
// with `watchWriting`. Both mark the target in `useLandStore.developing` so the land and
// `TogetherPanel` read the same text. What gets committed is only the claimant's validated witness.
//
// The stream is append-only on the wire: every frame carries only what is new since the last one,
// at most every RELAY_MS, and the service appends frames into the text a late viewer receives. A
// repair round writes its program again from the start; the relay then sends a line break and the
// new round, and readers take the latest statement of each name (TogetherPanel). The wire never
// holds more than FRAME_LIMITS.streamChars (the service's lease cap). Nothing here throws into, or
// waits inside, the model call.
//
// Frames go out only from inside `delta` (and an abort's `end`), never from a timer. The service
// ends a lease the moment its target is written, and a frame after that is refused
// (`stream-no-lease`), which main takes as the world's link being refused. Sending only while the
// model is still writing means every frame reaches main before the witness is appended. So the
// last few tokens are never relayed and "done" is never sent as a frame: viewers finish when the
// witness arrives in their fold, which is what the service signals with too.
//
// `getOpenWorld` reads the shared world Play has open from the land's history store (WP5,
// `useHistoryStore`): its fold (names, what is written) and its link, which presence and continents
// read too.

import { type OpenWorld as HistoryWorld, useHistoryStore, useLandStore } from "@renderer/state";
import { chunkStands } from "@shared/history/decay";
import { rumorKey } from "@shared/history/rumor";
import type { WorldNow } from "@shared/history/types";
import { type AppError, err, type Result, toError } from "@shared/result";
import type { ClaimAnswer, StreamFrame, WorldStatus } from "@shared/worldApi";
import {
  type ClaimTarget,
  FRAME_LIMITS,
  parseClaimTarget,
  type StreamEnd,
} from "@shared/worldProtocol";
import { useSyncExternalStore } from "react";

// ── The open world ────────────────────────────────────────────────────────────────────────────

/** The world Play has open, as the land's history folds it. */
export interface PlayedWorld {
  /** The save it belongs to. */
  instanceId: string;
  worldId: string;
  /** The renderer's fold: sequenced entries plus pending ones. */
  now: WorldNow;
  status: WorldStatus;
}

let played: { source: HistoryWorld; instanceId: string; value: PlayedWorld } | null = null;

/** The open world, or null while none is ready; the same object until the history store moves. */
export function getOpenWorld(): PlayedWorld | null {
  const { instanceId, world } = useHistoryStore.getState();
  if (instanceId === null || world.status !== "ready") return null;
  const source = world.value;
  if (played?.source !== source || played.instanceId !== instanceId) {
    const { worldId, now, status } = source;
    played = { source, instanceId, value: { instanceId, worldId, now, status } };
  }
  return played.value;
}

export function subscribeOpenWorld(listener: () => void): () => void {
  return useHistoryStore.subscribe(listener);
}

export function useOpenWorld(): PlayedWorld | null {
  return useSyncExternalStore(subscribeOpenWorld, getOpenWorld, getOpenWorld);
}

/** A key shortened for a screen: `kabcd…wxyz`. */
export function shortKey(key: string): string {
  return key.length <= 12 ? key : `${key.slice(0, 5)}…${key.slice(-4)}`;
}

/** Someone's name as the world knows it (the fold's joins and profiles), else their short key. */
export function writerName(
  key: string,
  now: WorldNow | null = getOpenWorld()?.now ?? null,
): string {
  const name = now?.names[key];
  return name === undefined || name.trim() === "" ? shortKey(key) : name;
}

/** Whether the fold already holds what `target` names (the witness, chapter or next chapter). */
export function writtenIn(now: WorldNow, target: ClaimTarget): boolean {
  const subject = parseClaimTarget(target);
  if (subject === null) return false;
  switch (subject.kind) {
    case "chunk": {
      const chunk = now.chunks[`${subject.cx},${subject.cz}`];
      return chunk !== undefined && chunkStands(now, chunk);
    }
    case "chapter":
      return now.chapters[subject.episodeId]?.live != null;
    case "more":
      return now.more[subject.episodeId]?.live != null;
    case "rumors": {
      // Written once every slot of the beat has a live rumor (as the service counts it).
      const beat = now.beats.find((one) => one.id === subject.beat);
      const live = (slot: number): boolean =>
        beat !== undefined && now.rumors[rumorKey(beat.id, slot)]?.live != null;
      return beat?.body.slots.every((slot) => live(slot.slot)) ?? false;
    }
  }
}

// ── The relay ─────────────────────────────────────────────────────────────────────────────────

/** What a claimant's generation feeds while it writes a `granted` target. */
export interface StreamRelay {
  /**
   * The whole text so far (what `onDelta` gives); the relay sends only what is new since its last
   * frame, at most every 100 ms, as `world.stream` (the service appends frames, D16).
   */
  delta(textSoFar: string): void;
  /** The generation ended: "done" once the witness was appended, "abort" on any other way out. */
  end(outcome: StreamEnd): void;
}

export const RELAY_MS = 100;
/** The most one frame carries: under FRAME_MAX_BYTES even if every character escaped to 6 bytes. */
export const RELAY_FRAME_CHARS = 16 * 1024;
/** What separates a repair round from the text before it on the wire. */
export const ROUND_BREAK = "\n";

export interface BatcherOptions {
  send(frame: Omit<StreamFrame, "sid">): Promise<Result<void>>;
  /** The text on the wire so far, each time more of it is sent (this screen shows the same). */
  shown?(text: string): void;
  /** The relay is over: after an abort frame was handed over (or skipped), or on done. */
  ended?(outcome: StreamEnd): void;
  /** A send failed: nothing more is relayed (the witness still commits). */
  failed?(error: AppError): void;
  intervalMs?: number;
  frameChars?: number;
  totalChars?: number;
  now?(): number;
}

/** Where to cut `text` at most `at` long without parting the two halves of a surrogate pair. */
function cut(text: string, at: number): number {
  const end = Math.max(0, Math.min(at, text.length));
  if (end === 0) return 0;
  const code = text.charCodeAt(end - 1);
  return code >= 0xd800 && code <= 0xdbff ? end - 1 : end;
}

/**
 * The relay's batching, apart from the IPC it sends through. The frames' texts, in `k` order,
 * concatenate to a prefix of the wire text: each round appended (a repair round after
 * ROUND_BREAK), cut at `totalChars`. One send is in flight at a time, each issued from `delta`.
 */
export function createStreamBatcher(options: BatcherOptions): StreamRelay {
  const interval = options.intervalMs ?? RELAY_MS;
  const frameChars = options.frameChars ?? RELAY_FRAME_CHARS;
  const totalChars = options.totalChars ?? FRAME_LIMITS.streamChars;
  const now = options.now ?? (() => performance.now());
  let round = "";
  let wire = "";
  let sent = 0;
  let k = 0;
  let lastFlush = Number.NEGATIVE_INFINITY;
  let sending = false;
  let over = false;
  let dead = false;

  const take = (text: string): void => {
    const fresh = text.startsWith(round)
      ? text.slice(round.length)
      : (wire === "" ? "" : ROUND_BREAK) + text;
    round = text;
    const room = totalChars - wire.length;
    if (room <= 0 || fresh === "") return;
    wire += room >= fresh.length ? fresh : fresh.slice(0, cut(fresh, room));
  };

  const send = (frame: Omit<StreamFrame, "sid">): void => {
    k += 1;
    lastFlush = now();
    sending = true;
    const settle = (result: Result<void>): void => {
      sending = false;
      if (result.ok) return;
      dead = true;
      options.failed?.(result.error);
    };
    try {
      options
        .send(frame)
        .then(settle, (thrown: unknown) =>
          settle({ ok: false, error: toError(thrown, "stream-send-failed") }),
        );
    } catch (thrown) {
      settle({ ok: false, error: toError(thrown, "stream-send-failed") });
    }
  };

  const flush = (): void => {
    // Half a surrogate pair waits for its other half.
    const size = cut(wire.slice(sent), frameChars);
    if (size === 0) return;
    const text = wire.slice(sent, sent + size);
    sent += size;
    send({ k, text });
    try {
      options.shown?.(wire.slice(0, sent));
    } catch (thrown) {
      options.failed?.(toError(thrown, "stream-show-failed"));
    }
  };

  return {
    delta(textSoFar) {
      if (over || dead) return;
      take(textSoFar);
      if (!sending && now() - lastFlush >= interval) flush();
    },
    end(outcome) {
      if (over) return;
      over = true;
      // An abort tells the viewers at once, unless a frame is still on its way (the release or
      // the lease's expiry tells them then). "Done" sends nothing: the witness is the signal.
      if (outcome === "abort" && !dead && !sending) send({ k, end: "abort" });
      options.ended?.(outcome);
    },
  };
}

/** How long a finished stream's text stays up while the witness reaches this device's fold. */
const DONE_GRACE_MS = 10_000;

/** Clears the target's developing text: at once on abort, once the fold holds it on done. */
function settleDeveloping(target: ClaimTarget, sid: string, outcome: StreamEnd): void {
  const clear = (): void => {
    const land = useLandStore.getState();
    if (land.developing[target]?.sid === sid) land.setDeveloping(target, null);
  };
  const written = (): boolean => {
    const open = getOpenWorld();
    return open === null || writtenIn(open.now, target);
  };
  if (outcome === "abort" || written()) {
    clear();
    return;
  }
  const stop = (): void => {
    clearTimeout(timer);
    off();
    clear();
  };
  const timer = setTimeout(stop, DONE_GRACE_MS);
  const off = subscribeOpenWorld(() => {
    if (written()) stop();
  });
}

/** A relay for a `granted` claim (`sid` from the answer). Never throws, never blocks the call. */
export function relayFor(worldId: string, target: ClaimTarget, sid: string): StreamRelay {
  const store = useLandStore.getState;
  store().setDeveloping(target, { sid, by: "", text: "", mine: true });
  return createStreamBatcher({
    send: async (frame) => {
      try {
        return await window.seed.world.sendStream(worldId, { sid, ...frame });
      } catch (thrown) {
        return err("stream-send-failed", toError(thrown).message);
      }
    },
    shown: (text) => {
      if (store().developing[target]?.sid !== sid) return;
      store().setDeveloping(target, { sid, by: "", text, mine: true });
    },
    ended: (outcome) => settleDeveloping(target, sid, outcome),
    failed: (error) => console.warn(`[together] relay of ${target} stopped: ${error.message}`),
  });
}

// ── Watching someone else write ───────────────────────────────────────────────────────────────

/** A lease lives 90 s without a delta (D15): a stream silent for longer has ended. */
const QUIET_MS = 90 * 1000;
/** The longest a lease can be held (D15), so a stream that never ends cannot hold a chunk. */
const LEASE_MAX_MS = 10 * 60 * 1000;

/**
 * Follows someone else's stream after a `writing` answer; resolves when it ends: "done" once the
 * witness is in this device's fold (or the writer said so), "abort" when the stream stopped
 * without one (its end frame, a release, 90 s of silence, the world closing or going offline),
 * and the target is unwritten again.
 */
export function watchWriting(
  worldId: string,
  target: ClaimTarget,
  answer: ClaimAnswer,
): Promise<StreamEnd> {
  const sid = answer.sid;
  if (sid === undefined) return Promise.resolve("abort");
  const store = useLandStore.getState;
  const by = answer.by ?? "";
  let text = (answer.text ?? "").slice(0, FRAME_LIMITS.streamChars);
  let lastK = -1;
  store().setDeveloping(target, { sid, by, text, mine: false });
  return new Promise((resolve) => {
    let done = false;
    const finish = (outcome: StreamEnd): void => {
      if (done) return;
      done = true;
      clearTimeout(lease);
      clearTimeout(quiet);
      stop();
      offWorld();
      settleDeveloping(target, sid, outcome);
      resolve(outcome);
    };
    const lease = setTimeout(() => finish("abort"), LEASE_MAX_MS);
    let quiet = setTimeout(() => finish("abort"), QUIET_MS);
    const stop = window.seed.world.onStream((event) => {
      if (event.world !== worldId || event.sid !== sid) return;
      // Frames are untrusted: another writer's frame, a replay, or an old k is not this stream.
      if ((by !== "" && event.from !== by) || event.k <= lastK) return;
      lastK = event.k;
      clearTimeout(quiet);
      quiet = setTimeout(() => finish("abort"), QUIET_MS);
      // Each frame is a delta; the answer carried the text before it.
      if (event.text !== undefined && text.length < FRAME_LIMITS.streamChars) {
        text = (text + event.text).slice(0, FRAME_LIMITS.streamChars);
        store().setDeveloping(target, { sid, by, text, mine: false });
      }
      if (event.end !== undefined) finish(event.end);
    });
    // The witness arrived: that is how the service ends a written stream (it sends no "done").
    // The world closed, another one opened, or its service dropped: this stream is gone here.
    const offWorld = subscribeOpenWorld(() => {
      const open = getOpenWorld();
      if (open !== null && open.worldId === worldId && writtenIn(open.now, target)) {
        finish("done");
      } else if (open === null || open.worldId !== worldId || open.status.link !== "online") {
        finish("abort");
      }
    });
    const open = getOpenWorld();
    if (open !== null && open.worldId === worldId && writtenIn(open.now, target)) finish("done");
  });
}
