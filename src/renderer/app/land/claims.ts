// "Has someone written here?" (rev 6 phase 3, D15): before the land writes a chunk, a chapter or
// the story's next episode into an attached world, it claims the target and waits at most 1.5 s
// (main's timeout) for the service's answer:
//
// | written (n)        | sync to n and draw it; no model call                                    |
// | writing (sid, by)  | follow the writer's stream (WP6 `watchWriting`); on "done" wait for the |
// |                    | fold to bring it, on "abort" claim again, at most once                  |
// | granted (sid)      | write it, relaying the model's text (WP6 `relayFor`)                    |
// | refused            | the Rule 2 error: this device does not write here                       |
// | timeout / offline  | write it locally; the result may become a variant (異聞)                |
//
// A local-only world has no one to ask: it just writes.

import { openWorld } from "@renderer/state";
import type { AppError } from "@shared/result";
import type { ClaimTarget } from "@shared/worldProtocol";
import { relayFor, type StreamRelay, watchWriting } from "./together";

/** What the land does after asking. */
export type Claimed =
  /** Write it: `relay` (a granted claim) carries the text to viewers; null writes locally. */
  | { kind: "write"; relay: StreamRelay | null; sid: string | null }
  /** Someone wrote it (their stream ended "done", or the answer was `written`): read it. */
  | { kind: "written"; n: number | null }
  | { kind: "refused"; error: AppError };

const REFUSED: AppError = {
  code: "claim-refused",
  message: "Only members write this world.",
  hint: "Ask the world's owner for an invite; walking and reading still work.",
};

/** The IPC itself must not hang the land either: main answers within 1.5 s, this is the backstop. */
const IPC_BACKSTOP_MS = 3_000;

async function ask(worldId: string, target: ClaimTarget) {
  const backstop = new Promise<null>((resolve) => setTimeout(() => resolve(null), IPC_BACKSTOP_MS));
  return Promise.race([window.seed.world.claim(worldId, target), backstop]);
}

/** Claims `target` in the open world and says what to do (see the header). */
export async function claimToWrite(target: ClaimTarget, again = true): Promise<Claimed> {
  const open = openWorld();
  if (open === null || open.status.link === "local") {
    return { kind: "write", relay: null, sid: null };
  }
  const answer = await ask(open.worldId, target);
  // No answer in time, or no service: write here; a race with someone offline becomes a variant.
  if (answer === null || !answer.ok) return { kind: "write", relay: null, sid: null };
  const { status, sid, n } = answer.value;
  switch (status) {
    case "granted":
      return sid === undefined
        ? { kind: "write", relay: null, sid: null }
        : { kind: "write", relay: relayFor(open.worldId, target, sid), sid };
    case "written":
      return { kind: "written", n: n ?? null };
    case "refused":
      return { kind: "refused", error: REFUSED };
    case "writing": {
      const end = await watchWriting(open.worldId, target, answer.value);
      if (end === "done") return { kind: "written", n: null };
      // The writer gave up: the target is unwritten again. Ask once more, then write if granted.
      return again ? claimToWrite(target, false) : { kind: "write", relay: null, sid: null };
    }
  }
}

/** Ends a granted claim that wrote nothing: viewers see "abort" and the lease is released. */
export function abandonClaim(target: ClaimTarget, claimed: Claimed): void {
  if (claimed.kind !== "write" || claimed.relay === null) return;
  claimed.relay.end("abort");
  const open = openWorld();
  if (open !== null) void window.seed.world.release(open.worldId, target);
}
