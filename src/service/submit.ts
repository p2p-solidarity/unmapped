// Sequencing what clients submit (rev 6 phase 3, D5, D9). Each event of a `submit` frame goes
// through the same steps main ran before signing it, then the service's own limits, then `admit`
// against the fold with every earlier event of the batch already folded:
//
//   readEvent → author is this connection's key → not already in the log (a repeat is silent: the
//   entry reaches its author in the stream) → verdict (id, signature, DSL body) → a `sequencer` names
//   this service → a mirror takes only a rehost (./mirror) → the door → quotas (world, member, the
//   visitors' shared budget, new visitor keys per address) → admit (door, conflicts, parents,
//   spots, links, rumors) → at most one variant per target.
//
// What passes is sequenced with this service's receipt; the batch is appended and fsynced once,
// then pushed to every reader. Each refusal is its own `rejected` frame with the event id.

import { chunkKey } from "@shared/chunks";
import { mayWrite } from "@shared/history/access";
import { admit } from "@shared/history/admit";
import { dayOf } from "@shared/history/decay";
import { readEvent } from "@shared/history/event";
import { utf8Length } from "@shared/history/ids";
import { isOwner } from "@shared/history/owners";
import { rumorKey } from "@shared/history/rumor";
import type { HistoryEvent, StoredEvent, WorldNow } from "@shared/history/types";
import type { AppError } from "@shared/result";
import type { ToService } from "@shared/worldProtocol";
import { isoAt } from "./clock";
import type { Hub, Session } from "./hub";
import { mirrorRefusal } from "./mirror";
import { checkUsage, ENTRY_OVERHEAD, payerOf } from "./usage";
import { wireError } from "./wire";
import type { Draft, ServiceWorld } from "./world";

type SubmitFrame = Extract<ToService, { t: "submit" }>;

/** How many variants `event`'s author already has for the same race target. */
function variantsBy(now: WorldNow, event: HistoryEvent): number {
  const mine = (list: readonly { author: string }[] | undefined): number =>
    (list ?? []).filter((one) => one.author === event.author).length;
  switch (event.kind) {
    case "witness":
      return mine(now.chunks[chunkKey(event.body)]?.variants);
    case "chapter":
      return mine(now.chapters[event.body.episodeId]?.variants);
    case "story.more":
      return mine(now.more[event.body.episode.id]?.variants);
    case "rumor":
      return mine(now.rumors[rumorKey(event.body.beat, event.body.slot)]?.variants);
    default:
      return 0;
  }
}

interface Batch {
  draft: Draft;
  rt: string;
  ms: number;
  newVisitorKey: boolean;
}

/** Why one event may not be sequenced now, or null after sequencing it into the batch. */
function sequenceOne(
  hub: Hub,
  world: ServiceWorld,
  session: Session,
  raw: StoredEvent,
  batch: Batch,
): AppError | null {
  const read = readEvent(raw);
  if (!read.ok) return read.error;
  const event = read.value;
  if (event.author !== session.key) {
    return {
      code: "event-not-yours",
      message: "A connection submits only events its own key signed.",
      hint: "Submit from the device that wrote it.",
    };
  }
  const { now, usage } = batch.draft.state;
  if (now.events[event.id] !== undefined) return null;
  const verdict = hub.verdict(raw);
  if (!verdict.ok) {
    return { code: verdict.code, message: "The event failed its checks.", hint: "Rewrite it." };
  }
  if (event.kind === "sequencer" && event.body.key !== hub.key.key) {
    return {
      code: "sequencer-key-foreign",
      message: "This service sequences only under its own key.",
      hint: "Send a world's sequencer to the service it names.",
    };
  }
  // A mirror (phase 4, D5) sequences only a rehost: an owner's sequencer naming this service.
  const mirror = mirrorRefusal(now, event, hub.key.key);
  if (mirror !== null) return mirror;
  // The door before the quotas: a visitor at a daily cap still hears why it may not write this.
  const door = mayWrite(now, event.kind, event.author);
  if (!door.ok) return door.error;
  const owns = isOwner(now, event.author);
  const payer = payerOf(now, owns, now.head.n + 1, event.author, event.kind, hub.key.key);
  const bytes = utf8Length(JSON.stringify(raw)) + ENTRY_OVERHEAD;
  const input = { payer, author: event.author, kind: event.kind, bytes, ms: batch.ms };
  const spent = checkUsage(usage, hub.limits, input);
  if (spent !== null) return spent;
  const newKey = payer === "visitor" && !hub.knownWriters.has(event.author);
  if (
    newKey &&
    !batch.newVisitorKey &&
    !hub.newVisitorKeyAllowed(session.peer.ip, dayOf(batch.ms))
  ) {
    return {
      code: "quota-visitor-keys",
      message: "Too many new visitors from this address today.",
      hint: "Come back tomorrow, or ask the owner for an invite.",
    };
  }
  const admitted = admit(now, event, batch.rt);
  if (!admitted.ok) return admitted.error;
  if (admitted.value.as === "variant" && variantsBy(now, event) >= hub.limits.variantsPerTarget) {
    return {
      code: "quota-variant",
      message: "You already wrote another version of this.",
      hint: "The first one written is what this place is.",
    };
  }
  world.sequenceInto(batch.draft, raw, verdict, batch.rt, hub.key, payer);
  if (newKey) batch.newVisitorKey = true;
  return null;
}

export function handleSubmit(hub: Hub, session: Session, frame: SubmitFrame): void {
  const world = hub.openedWorld(session, frame.world);
  if (world === null) return;
  const ms = hub.clock.now();
  const batch: Batch = { draft: world.draft(), rt: isoAt(ms), ms, newVisitorKey: false };
  const rejected: { id: string; error: AppError }[] = [];
  for (const raw of frame.events) {
    const error = sequenceOne(hub, world, session, raw, batch);
    if (error !== null) rejected.push({ id: raw.id, error });
  }
  if (batch.draft.entries.length > 0) {
    const committed = world.commit(batch.draft, hub.store);
    if (committed.ok) {
      if (batch.newVisitorKey) hub.noteNewVisitorKey(session.peer.ip, dayOf(ms));
      hub.afterCommit(world, batch.draft);
    } else {
      hub.log(`world ${world.id}: ${committed.error.message}`);
      for (const entry of batch.draft.entries) {
        rejected.push({ id: entry.event.id, error: committed.error });
      }
    }
  }
  for (const { id, error } of rejected) {
    hub.send(session, { t: "rejected", world: world.id, id, error: wireError(error) });
  }
}
