// A renderer draft becomes a signed event only after every check main can run (rev 6 phase 3, D5
// order of checks; the renderer is untrusted, Rule 6): `seen` not beyond the head, the envelope and
// the per-kind body (`readEvent`, with a placeholder signature so nothing is signed yet), the DSL
// body (`validateEventBody`), then `admit` over the fold with the outbox on top. Only then does the
// device key sign. A refusal is an error value; content refusals (`validateEventBody`, lore links,
// index, size) go back to the model as a repair round (D5).

import { admit } from "@shared/history/admit";
import { readEvent } from "@shared/history/event";
import { eventIdOf } from "@shared/history/sign";
import type { EventDraft, HistoryEvent, UnsignedEvent } from "@shared/history/types";
import { err, ok, type Result } from "@shared/result";
import type { DeviceKey } from "../identity/deviceKey";
import type { WorldDsl } from "./dslSeam";
import { type LoadedWorld, pendingNow } from "./loaded";

/** Stands in for the signature while the shape is checked: the real one comes after admission. */
const PLACEHOLDER_SIG = "A".repeat(86);

export function prepareEvent(
  world: LoadedWorld,
  draft: EventDraft,
  key: DeviceKey,
  at: string,
  dsl: Pick<WorldDsl, "validateEventBody">,
): Result<HistoryEvent> {
  if (draft.seen > world.now.head.n) {
    return err(
      "draft-seen-ahead",
      `The draft claims to have seen entry ${draft.seen}; this device has ${world.now.head.n}.`,
      "Reload the land and try again.",
    );
  }
  const unsigned = {
    v: 1,
    world: world.id,
    kind: draft.kind,
    author: key.author,
    at,
    seen: draft.seen,
    body: draft.body,
  } as UnsignedEvent;
  const provisional = readEvent({ ...unsigned, id: eventIdOf(unsigned), sig: PLACEHOLDER_SIG });
  if (!provisional.ok) return provisional;
  const body = dsl.validateEventBody(provisional.value);
  if (!body.ok) return body;
  const admitted = admit(pendingNow(world, at), provisional.value, at);
  if (!admitted.ok) return admitted;
  const signed = key.signEvent(unsigned) as HistoryEvent;
  const read = readEvent(signed);
  return read.ok && read.value.id === provisional.value.id
    ? ok(read.value)
    : err("draft-sign-failed", "The signed event does not read back as the checked draft.");
}
