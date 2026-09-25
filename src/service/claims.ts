// "Has someone written here?" and witnessing together (rev 6 phase 3, D15–D16): claim leases and
// the stream relay, in memory only.
//
// A claim is answered from the fold first (`written` with the n of the live one), then the door
// (the claimant must be allowed to write that kind: `refused`), then the lease table: another
// key's lease → `writing` with its sid, author and the text so far; the claimant's own lease →
// `granted` again (a reconnect); else a new lease → `granted`. A lease lasts 90 s, each delta
// renews it, and it never outlives 10 minutes from its grant. It ends when the target is written
// (the entries frame is the signal), on `release` or `end: "abort"`, and on expiry, a disconnect
// or a close — then every viewer gets `end: "abort"` and the target is unwritten again.
//
// Refusals send a `refused` frame with the exact code (quota, door, target) and then `claimed`
// with status `refused`, so a client waiting on the claim never has to time out.

import { mayWrite } from "@shared/history/access";
import { gateOf, nextFreeEpisode } from "@shared/history/admit";
import { chunkStands } from "@shared/history/decay";
import { base64Url } from "@shared/history/ids";
import { RUMOR_WRITE_BEATS, rumorKey } from "@shared/history/rumor";
import type { EventKind, WorldNow } from "@shared/history/types";
import { type AppError, err, ok, type Result } from "@shared/result";
import {
  type ClaimSubject,
  type ClaimTarget,
  parseClaimTarget,
  type StreamEnd,
  type ToService,
} from "@shared/worldProtocol";
import { RateWindow } from "./clock";
import type { Hub, Session } from "./hub";
import { checkUsage } from "./usage";
import type { ServiceWorld } from "./world";

export interface Lease {
  world: string;
  target: ClaimTarget;
  sid: string;
  by: string;
  session: Session;
  grantedAt: number;
  renewedAt: number;
  text: string;
  /** The last delta's k, −1 before any. */
  k: number;
  ended: StreamEnd | null;
  streaming: boolean;
  window: RateWindow;
}

export class Leases {
  private readonly byTarget = new Map<string, Lease>();

  get(world: string, target: string): Lease | null {
    return this.byTarget.get(`${world}|${target}`) ?? null;
  }

  bySid(world: string, sid: string): Lease | null {
    for (const lease of this.byTarget.values()) {
      if (lease.world === world && lease.sid === sid) return lease;
    }
    return null;
  }

  inWorld(world: string): Lease[] {
    return [...this.byTarget.values()].filter((lease) => lease.world === world);
  }

  all(): Lease[] {
    return [...this.byTarget.values()];
  }

  add(lease: Lease): void {
    this.byTarget.set(`${lease.world}|${lease.target}`, lease);
  }

  release(lease: Lease): void {
    if (this.get(lease.world, lease.target) === lease) {
      this.byTarget.delete(`${lease.world}|${lease.target}`);
    }
  }
}

type Frame<T extends ToService["t"]> = Extract<ToService, { t: T }>;

const KIND: Record<ClaimSubject["kind"], EventKind> = {
  chunk: "witness",
  chapter: "chapter",
  more: "story.more",
  rumors: "rumor",
};

/** The n of what already stands at the target, or null when it may be written. */
export function writtenAt(now: WorldNow, subject: ClaimSubject): number | null {
  switch (subject.kind) {
    case "chunk": {
      const chunk = now.chunks[`${subject.cx},${subject.cz}`];
      return chunk !== undefined && chunkStands(now, chunk) ? chunk.live.n : null;
    }
    case "chapter":
      return now.chapters[subject.episodeId]?.live?.n ?? null;
    case "more":
      return now.more[subject.episodeId]?.live?.n ?? null;
    case "rumors": {
      const beat = now.beats.find((one) => one.id === subject.beat);
      if (beat === undefined) return null;
      let n = beat.n;
      for (const slot of beat.body.slots) {
        const live = now.rumors[rumorKey(beat.id, slot.slot)]?.live ?? null;
        if (live === null) return null;
        n = Math.max(n, live.n);
      }
      return n;
    }
  }
}

/** Whether the target can be written at all (an episode that exists, the next chapter, a beat). */
function claimable(now: WorldNow, subject: ClaimSubject): Result<void> {
  switch (subject.kind) {
    case "chunk":
      return ok(undefined);
    case "chapter":
      return gateOf(now, subject.episodeId) === null
        ? err("chapter-episode-unknown", `The story has no episode ${subject.episodeId}.`)
        : ok(undefined);
    case "more": {
      const next = nextFreeEpisode(now);
      return next === subject.episodeId
        ? ok(undefined)
        : err("more-not-next", `The next chapter of this story is ${next ?? "none"}.`);
    }
    case "rumors":
      if (now.beats.slice(-RUMOR_WRITE_BEATS).some((beat) => beat.id === subject.beat)) {
        return ok(undefined);
      }
      return now.beats.some((beat) => beat.id === subject.beat)
        ? err("rumor-beat-expired", "That beat is too old to write rumors for.")
        : err("rumor-beat-unknown", "This world never had that beat.");
  }
}

function newSid(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(16)));
}

function refuseClaim(hub: Hub, session: Session, frame: Frame<"claim">, error: AppError): void {
  hub.refuse(session, frame.world, error);
  hub.send(session, { t: "claimed", world: frame.world, target: frame.target, status: "refused" });
}

export function handleClaim(hub: Hub, session: Session, frame: Frame<"claim">): void {
  const key = session.key ?? "";
  const world = hub.worlds.get(frame.world);
  if (world === undefined || !session.worlds.has(frame.world)) {
    refuseClaim(hub, session, frame, {
      code: "world-not-open",
      message: "That world is not open on this connection.",
      hint: "Send open first.",
    });
    return;
  }
  const { now } = world;
  const subject = parseClaimTarget(frame.target);
  if (subject === null) return;
  const answer = { t: "claimed", world: world.id, target: frame.target } as const;
  const written = writtenAt(now, subject);
  if (written !== null) {
    hub.send(session, { ...answer, status: "written", n: written });
    return;
  }
  const door = mayWrite(now, KIND[subject.kind], key);
  const target = claimable(now, subject);
  const denied = !door.ok ? door.error : !target.ok ? target.error : null;
  if (denied !== null) {
    refuseClaim(hub, session, frame, denied);
    return;
  }
  const real = hub.clock.real();
  const held = hub.leases.get(world.id, frame.target);
  if (held !== null && held.by !== key) {
    const text = held.text === "" ? {} : { text: held.text };
    hub.send(session, { ...answer, status: "writing", sid: held.sid, by: held.by, ...text });
    return;
  }
  if (held !== null) {
    held.session = session;
    held.renewedAt = Math.min(real, held.grantedAt + hub.limits.leaseMaxMs);
    hub.send(session, { ...answer, status: "granted", sid: held.sid });
    return;
  }
  const mine = hub.leases.inWorld(world.id).filter((lease) => lease.by === key).length;
  if (mine >= hub.limits.claimsPerAuthor) {
    refuseClaim(hub, session, frame, {
      code: "quota-claims",
      message: `At most ${hub.limits.claimsPerAuthor} claims at a time in one world.`,
      hint: "Finish or release one first.",
    });
    return;
  }
  const spent = checkUsage(world.state.usage, hub.limits, {
    payer: "member",
    author: key,
    kind: KIND[subject.kind],
    bytes: 0,
    ms: hub.clock.now(),
  });
  if (spent !== null) {
    refuseClaim(hub, session, frame, spent);
    return;
  }
  const lease: Lease = {
    world: world.id,
    target: frame.target,
    sid: newSid(),
    by: key,
    session,
    grantedAt: real,
    renewedAt: real,
    text: "",
    k: -1,
    ended: null,
    streaming: false,
    window: new RateWindow(),
  };
  hub.leases.add(lease);
  hub.send(session, { ...answer, status: "granted", sid: lease.sid });
}

/** Tells every viewer (not the holder) that the stream ended without a witness, and frees it. */
function abortLease(hub: Hub, lease: Lease): void {
  hub.leases.release(lease);
  if (lease.ended === "abort") return;
  hub.relay(
    lease.world,
    {
      t: "stream",
      world: lease.world,
      from: lease.by,
      sid: lease.sid,
      k: lease.k + 1,
      end: "abort",
    },
    lease.session,
  );
}

export function handleRelease(hub: Hub, session: Session, frame: Frame<"release">): void {
  if (hub.openedWorld(session, frame.world) === null) return;
  const lease = hub.leases.get(frame.world, frame.target);
  if (lease === null || lease.by !== session.key) return;
  abortLease(hub, lease);
}

export function handleStream(hub: Hub, session: Session, frame: Frame<"stream">): void {
  if (hub.openedWorld(session, frame.world) === null) return;
  const key = session.key ?? "";
  const lease = hub.leases.bySid(frame.world, frame.sid);
  if (lease === null || lease.by !== key || lease.session !== session) {
    hub.refuse(session, frame.world, {
      code: "stream-no-lease",
      message: "That stream has no lease on this connection.",
      hint: "Claim the target first; a lease lasts 90 s without deltas.",
    });
    return;
  }
  if (frame.k <= lease.k) return;
  const real = hub.clock.real();
  if (!lease.window.hit(real, hub.limits.streamDeltasPerSecond)) {
    if (lease.window.warnOnce()) {
      hub.refuse(session, frame.world, {
        code: "quota-stream-rate",
        message: `At most ${hub.limits.streamDeltasPerSecond} stream deltas a second.`,
        hint: "Batch the text; deltas over the limit are dropped.",
      });
    }
    return;
  }
  if (!lease.streaming) {
    const open = hub.leases
      .inWorld(frame.world)
      .filter((one) => one !== lease && one.by === key && one.streaming && one.ended === null);
    if (open.length >= hub.limits.streamsPerAuthor) {
      hub.refuse(session, frame.world, {
        code: "quota-streams",
        message: `At most ${hub.limits.streamsPerAuthor} open stream per world.`,
        hint: "End the other stream first.",
      });
      return;
    }
  }
  const text = frame.text ?? "";
  if (lease.text.length + text.length > hub.limits.streamChars) {
    hub.refuse(session, frame.world, {
      code: "quota-stream-size",
      message: `A stream keeps at most ${hub.limits.streamChars} characters.`,
      hint: "The rest is not relayed; the witness itself still commits.",
    });
    return;
  }
  lease.text += text;
  lease.k = frame.k;
  lease.streaming = true;
  lease.renewedAt = Math.min(real, lease.grantedAt + hub.limits.leaseMaxMs);
  if (frame.end !== undefined) lease.ended = frame.end;
  const delta = {
    t: "stream",
    world: frame.world,
    from: key,
    sid: lease.sid,
    k: frame.k,
    ...(frame.text === undefined ? {} : { text: frame.text }),
    ...(frame.end === undefined ? {} : { end: frame.end }),
  } as const;
  hub.relay(frame.world, delta, session);
  if (frame.end === "abort") hub.leases.release(lease);
}

/** Leases past 90 s without a delta, or 10 minutes from their grant, end as aborts. */
export function expireLeases(hub: Hub): void {
  const real = hub.clock.real();
  for (const lease of hub.leases.all()) {
    const quiet = real - lease.renewedAt > hub.limits.leaseMs;
    const old = real - lease.grantedAt > hub.limits.leaseMaxMs;
    if (!quiet && !old) continue;
    abortLease(hub, lease);
    hub.refuse(lease.session, lease.world, {
      code: "lease-expired",
      message: `Your claim on ${lease.target} expired.`,
      hint: "What you write may still land, as a variant if someone else wrote there first.",
    });
  }
}

/** Frees leases whose target the log now holds; the entries frame already told the viewers. */
export function releaseWritten(hub: Hub, world: ServiceWorld): void {
  for (const lease of hub.leases.inWorld(world.id)) {
    const subject = parseClaimTarget(lease.target);
    if (subject !== null && writtenAt(world.now, subject) !== null) hub.leases.release(lease);
  }
}

/** A session closing a world (or disconnecting) aborts the leases it holds there. */
export function dropSessionLeases(hub: Hub, session: Session, world: string): void {
  for (const lease of hub.leases.inWorld(world)) {
    if (lease.session === session) abortLease(hub, lease);
  }
}
