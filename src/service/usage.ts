// What each world has spent against the D9 limits (rev 6 phase 3). Everything here is derived from
// the log alone — the payer of each entry, its line's bytes and its receipt day — so replaying the
// log at start rebuilds it exactly, and a snapshot carries it beside the fold. Pure and
// copy-on-write: a batch that fails to reach the disk leaves the ledger as it was.
//
// Payers: the owner and members pay into the world's 64 MiB and their own per-day counts; every
// visitor pays into one shared per-world budget that, when spent, refuses visitors only
// (`quota-visitors`) and never a member. A `member.join` is paid as a member (the invite is the
// owner's consent), and the service's own beats are free.

import { OWNER_KINDS } from "@shared/history/access";
import { dayOf } from "@shared/history/decay";
import type { EventKind, WorldNow } from "@shared/history/types";
import type { AppError } from "@shared/result";
import type { ServiceLimits } from "./config";

export type Payer = "member" | "visitor" | "service";

export interface MemberDay {
  events: number;
  witness: number;
  place: number;
  chapter: number;
  note: number;
  gift: number;
}

export interface UsageDay {
  /** UTC day index of the receipt clock. */
  day: number;
  visitorEvents: number;
  visitorBytes: number;
  perVisitor: Record<string, number>;
  perMember: Record<string, MemberDay>;
}

export interface WorldUsage {
  /** Log bytes of owner and member entries (the 64 MiB world cap). */
  memberBytes: number;
  /** Log bytes of every visitor entry, ever (the shared 8 MiB). */
  visitorBytes: number;
  today: UsageDay;
  /** Receipt ms of each member's entries in the last minute. */
  recent: Record<string, number[]>;
}

type Group = Exclude<keyof MemberDay, "events">;

const GROUPS: Partial<Record<EventKind, Group>> = {
  witness: "witness",
  place: "place",
  chapter: "chapter",
  "story.more": "chapter",
  note: "note",
  signpost: "note",
  gift: "gift",
};

const GROUP_LIMIT: Record<Group, keyof ServiceLimits> = {
  witness: "witnessPerDay",
  place: "placePerDay",
  chapter: "chapterPerDay",
  note: "notePerDay",
  gift: "giftPerDay",
};

const MINUTE_MS = 60_000;

/** An upper bound on what the entry around an event adds to its line (n, rt, chain, rsig). */
export const ENTRY_OVERHEAD = 256;

function emptyDay(day: number): UsageDay {
  return { day, visitorEvents: 0, visitorBytes: 0, perVisitor: {}, perMember: {} };
}

const NO_MEMBER_DAY: MemberDay = { events: 0, witness: 0, place: 0, chapter: 0, note: 0, gift: 0 };

export function emptyUsage(): WorldUsage {
  return { memberBytes: 0, visitorBytes: 0, today: emptyDay(0), recent: {} };
}

/**
 * Who pays for entry `n` by `author`: the service for its own beats, a member for the owner, a
 * joined member (joined before n) or a `member.join`, else a visitor. `now` may be the fold before
 * n or any later fold: a join's n never changes and a removed key writes nothing after.
 */
export function payerOf(
  now: Pick<WorldNow, "owner" | "members">,
  n: number,
  author: string,
  kind: string,
  serviceKey: string,
): Payer {
  if (author === serviceKey) return "service";
  if (kind === "member.join" || author === now.owner) return "member";
  const member = now.members[author];
  return member !== undefined && member.n < n ? "member" : "visitor";
}

function dayFor(usage: WorldUsage, ms: number): UsageDay {
  const day = dayOf(ms);
  return usage.today.day === day ? usage.today : emptyDay(day);
}

function quota(code: string, message: string, hint: string): AppError {
  return { code, message, hint };
}

/**
 * Whether one more event of `kind` by `author` (paying as `payer`, about `bytes` on disk,
 * received at `ms`) fits the limits. Null when it does.
 */
export function checkUsage(
  usage: WorldUsage,
  limits: ServiceLimits,
  input: { payer: Payer; author: string; kind: string; bytes: number; ms: number },
): AppError | null {
  const { payer, author, kind, bytes, ms } = input;
  if (payer === "service") return null;
  const today = dayFor(usage, ms);
  if (payer === "visitor") {
    const shared =
      usage.visitorBytes + bytes > limits.visitorBytesEver ||
      today.visitorEvents + 1 > limits.visitorEventsPerDay ||
      today.visitorBytes + bytes > limits.visitorBytesPerDay;
    if (shared) {
      return quota(
        "quota-visitors",
        "This world has taken all the visitors' traces it takes for now.",
        "Come back tomorrow, or ask the owner for an invite.",
      );
    }
    if ((today.perVisitor[author] ?? 0) + 1 > limits.visitorEventsPerKeyPerDay) {
      return quota(
        "quota-visitor-key",
        `A visitor leaves at most ${limits.visitorEventsPerKeyPerDay} traces a day here.`,
        "Come back tomorrow.",
      );
    }
    return null;
  }
  if (usage.memberBytes + bytes > limits.worldBytes && !OWNER_KINDS.includes(kind as EventKind)) {
    return quota(
      "world-full",
      "This world's history is full.",
      "Only the owner's door changes are taken now; the service operator can raise --world-bytes.",
    );
  }
  const mine = today.perMember[author] ?? NO_MEMBER_DAY;
  if (mine.events + 1 > limits.memberEventsPerDay) {
    return quota("quota-member-day", "You wrote this world's daily share.", "Come back tomorrow.");
  }
  const recent = (usage.recent[author] ?? []).filter((at) => ms - at < MINUTE_MS);
  if (recent.length + 1 > limits.memberEventsPerMinute) {
    return quota("quota-member-rate", "Too many events in a minute.", "Wait a minute and retry.");
  }
  const group = GROUPS[kind as EventKind];
  if (group !== undefined && mine[group] + 1 > limits[GROUP_LIMIT[group]]) {
    return quota(
      `quota-${group}`,
      `You wrote today's share of ${group === "note" ? "notes and signposts" : `${group}s`} here.`,
      "Come back tomorrow.",
    );
  }
  return null;
}

/** The ledger after one sequenced entry. */
export function recordUsage(
  usage: WorldUsage,
  input: { payer: Payer; author: string; kind: string; bytes: number; ms: number },
): WorldUsage {
  const { payer, author, kind, bytes, ms } = input;
  if (payer === "service") return usage;
  const today = dayFor(usage, ms);
  if (payer === "visitor") {
    return {
      ...usage,
      visitorBytes: usage.visitorBytes + bytes,
      today: {
        ...today,
        visitorEvents: today.visitorEvents + 1,
        visitorBytes: today.visitorBytes + bytes,
        perVisitor: { ...today.perVisitor, [author]: (today.perVisitor[author] ?? 0) + 1 },
      },
    };
  }
  const mine = { ...(today.perMember[author] ?? NO_MEMBER_DAY) };
  mine.events += 1;
  const group = GROUPS[kind as EventKind];
  if (group !== undefined) mine[group] += 1;
  const recent = (usage.recent[author] ?? []).filter((at) => ms - at < MINUTE_MS);
  const pruned: Record<string, number[]> = {};
  for (const [key, times] of Object.entries(usage.recent)) {
    const kept = times.filter((at) => ms - at < MINUTE_MS);
    if (kept.length > 0 && key !== author) pruned[key] = kept;
  }
  pruned[author] = [...recent, ms];
  return {
    ...usage,
    memberBytes: usage.memberBytes + bytes,
    today: { ...today, perMember: { ...today.perMember, [author]: mine } },
    recent: pruned,
  };
}

/** Plain-JSON check for a ledger read back from a snapshot. */
export function isUsage(value: unknown): value is WorldUsage {
  if (typeof value !== "object" || value === null) return false;
  const usage = value as Partial<WorldUsage>;
  return (
    typeof usage.memberBytes === "number" &&
    typeof usage.visitorBytes === "number" &&
    typeof usage.today === "object" &&
    usage.today !== null &&
    typeof usage.today.day === "number" &&
    typeof usage.today.perMember === "object" &&
    typeof usage.today.perVisitor === "object" &&
    typeof usage.recent === "object" &&
    usage.recent !== null
  );
}
