// The host's half of the frame boundary. A message is believed only if it comes from the exact
// iframe window of this session, from an opaque origin, within the rate and size budget, matches
// the protocol schema and names this session's token. Anything else is dropped and counted.

import {
  type FrameMessage,
  frameMessageSchema,
  type Json,
  jsonBytes,
  WORK_LIMITS,
} from "@shared/works";

export interface RateWindow {
  windowStart: number;
  count: number;
  dropped: number;
}

export type GuardVerdict =
  | { ok: true; message: FrameMessage }
  | { ok: false; reason: "source" | "origin" | "rate" | "size" | "schema" | "token" };

export function newRateWindow(): RateWindow {
  return { windowStart: 0, count: 0, dropped: 0 };
}

export function acceptFrameMessage(
  event: { source: unknown; origin: string; data: unknown },
  expected: { source: unknown; token: string },
  rate: RateWindow,
  now: number,
): GuardVerdict {
  if (expected.source === null || event.source !== expected.source) {
    return { ok: false, reason: "source" };
  }
  // A sandboxed frame without allow-same-origin always reports the opaque origin "null".
  if (event.origin !== "null") return { ok: false, reason: "origin" };
  if (now - rate.windowStart >= 1_000) {
    rate.windowStart = now;
    rate.count = 0;
  }
  rate.count += 1;
  if (rate.count > WORK_LIMITS.messagesPerSecond) {
    rate.dropped += 1;
    return { ok: false, reason: "rate" };
  }
  const bytes = jsonBytes(event.data);
  if (bytes === null || bytes > WORK_LIMITS.messageBytes) return { ok: false, reason: "size" };
  const parsed = frameMessageSchema.safeParse(event.data);
  if (!parsed.success) return { ok: false, reason: "schema" };
  if (parsed.data.token !== expected.token) return { ok: false, reason: "token" };
  return { ok: true, message: parsed.data };
}

/** Dropped-by-rate messages beyond this mean a flooding world; the host stops it. */
export const FLOOD_LIMIT = 400;

export interface CheckProblem {
  file: "main.js" | "runtime" | "player";
  line: number | null;
  column: number | null;
  message: string;
}

/** One line per problem, in the form the repair prompt and the history panel both show. */
export function describeProblem(problem: CheckProblem): string {
  const where =
    problem.line === null
      ? problem.file
      : `${problem.file}:${problem.line}${problem.column === null ? "" : `:${problem.column}`}`;
  const firstLines = problem.message.split("\n").slice(0, 3).join(" | ").slice(0, 400);
  return `${where} ${firstLines}`;
}

export interface CheckOutcome {
  passed: boolean;
  rendered: boolean;
  problems: CheckProblem[];
  /** The last state the world saved during the check; the resume check reloads from it. */
  savedState: Json | null;
}
