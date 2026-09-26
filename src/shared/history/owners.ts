// Co-owners (rev 6 phase 4, D5; world protocol 2). The genesis author starts as a world's only
// owner; any owner's `owner.add { key }` makes another, `owner.remove { key }` ends one (never the
// last), and every owner writes every owner kind. Three places must agree on who owns a world at
// each n, so the rule is here once:
//   - `admit` (the fold), through `ownerChange`;
//   - `verifyLog`'s ownership pass (./log), which runs before the receipt schedule because a
//     `sequencer` counts only when its author owned the world at its n. It needs only what an
//     owner kind's verdict checks (`readEvent`, `verifyEvent`), so it runs on a log alone;
//   - an invitee checking an invite by a co-owner offline, before any network call: the link's
//     `&o=` carries the ≤ 4 `owner.add` events leading from the genesis author to its signer.
//
// Pure, code-unit comparisons only (D4).

import { err, ok, type Result } from "../result";
import { HISTORY_LIMITS } from "./bodies";
import { readEvent } from "./event";
import { verifyEvent } from "./sign";
import type { HistoryEvent, HistoryEventOf, Invite, LogEntry, WorldNow } from "./types";

/** An invite's `&o=` path holds at most this many `owner.add` events. */
export const OWNER_PATH_MAX = 4;

type OwnerChange = HistoryEventOf<"owner.add"> | HistoryEventOf<"owner.remove">;

export function isOwnerChange(event: HistoryEvent): event is OwnerChange {
  return event.kind === "owner.add" || event.kind === "owner.remove";
}

/** Whether `key` owns the world now. */
export function isOwner(now: Pick<WorldNow, "owners">, key: string): boolean {
  return now.owners[key]?.removed === null;
}

/** The keys that own the world now, in the order they first became owners. */
export function currentOwners(now: Pick<WorldNow, "owners">): string[] {
  return Object.values(now.owners)
    .filter((owner) => owner.removed === null)
    .sort((a, b) => a.n - b.n || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((owner) => owner.key);
}

/**
 * D5: whether an `owner.add` / `owner.remove` may change `owners` (the current owner keys; its
 * author is already checked to be one of them). Adding an owner again, removing a key that owns
 * nothing, and removing the last owner are refused.
 */
export function ownerChange(owners: readonly string[], event: OwnerChange): Result<void> {
  const { key } = event.body;
  if (event.kind === "owner.add") {
    if (owners.includes(key)) return err("owner-already", "That key already owns this world.");
    return owners.length >= HISTORY_LIMITS.owners
      ? err("owners-full", `This world already has ${HISTORY_LIMITS.owners} owners.`)
      : ok(undefined);
  }
  if (!owners.includes(key)) return err("owner-unknown", "That key does not own this world.");
  return owners.length <= 1
    ? err("owner-last", "The last owner cannot be removed.", "Add another owner first.")
    : ok(undefined);
}

// ── The ownership pass (verifyLog) ──────────────────────────────────────────────────────────

/** Who owns a world at one point of its log, as the ownership pass carries it. */
export interface Ownership {
  /** The owners there, in code-unit order (a set: the pass and `ownershipOf` spell it alike). */
  owners: string[];
  /** Ids of the `owner.add` / `owner.remove` events that took effect (a repeat takes none). */
  applied: string[];
}

export function ownershipOfGenesis(author: string): Ownership {
  return { owners: [author], applied: [] };
}

/** The ownership a sequenced fold ends at: the same as the pass over the same entries. */
export function ownershipOf(now: WorldNow): Ownership {
  const applied = Object.values(now.events)
    .filter((ref) => !ref.pending && (ref.kind === "owner.add" || ref.kind === "owner.remove"))
    .map((ref) => ref.id);
  return { owners: currentOwners(now).sort(), applied };
}

/**
 * One entry of the ownership pass: an `owner.add` / `owner.remove` changes who owns the world when
 * the fold would admit it — it reads, its id and signature verify (an owner kind's whole verdict),
 * it belongs to `world`, it has seen only earlier entries, a current owner wrote it, it repeats no
 * change already applied, and `ownerChange` allows it. Anything else leaves `ownership` as it was.
 */
export function ownershipStep(ownership: Ownership, entry: LogEntry, world: string): Ownership {
  const kind = entry.event.kind;
  if (kind !== "owner.add" && kind !== "owner.remove") return ownership;
  const read = readEvent(entry.event);
  if (!read.ok || !isOwnerChange(read.value)) return ownership;
  const event = read.value;
  if (event.world !== world || event.seen >= entry.n) return ownership;
  if (!ownership.owners.includes(event.author) || ownership.applied.includes(event.id)) {
    return ownership;
  }
  if (!ownerChange(ownership.owners, event).ok || !verifyEvent(event).ok) return ownership;
  const { key } = event.body;
  const owners =
    event.kind === "owner.add"
      ? [...ownership.owners, key].sort()
      : ownership.owners.filter((one) => one !== key);
  return { owners, applied: [...ownership.applied, event.id] };
}

// ── Invites by a co-owner (`&o=`) ───────────────────────────────────────────────────────────

/**
 * The `owner.add` events leading from the genesis author to `key`, oldest first (each one added
 * the next one's author): empty for the genesis author, null when `key` owns nothing now or the
 * path is longer than OWNER_PATH_MAX.
 */
export function ownerPath(now: WorldNow, key: string): HistoryEventOf<"owner.add">[] | null {
  if (!isOwner(now, key)) return null;
  const path: HistoryEventOf<"owner.add">[] = [];
  let at = key;
  while (at !== now.owner) {
    const added = now.owners[at]?.added ?? null;
    if (added === null || path.length >= OWNER_PATH_MAX) return null;
    path.unshift(added);
    at = added.author;
  }
  return path;
}

/** An `&o=` path as the invitee checked it: `root` must be the genesis author once it arrives. */
export interface OwnerPath {
  root: string;
  adds: HistoryEventOf<"owner.add">[];
}

/**
 * D5, offline: an invite's `&o=` path is 1–4 `owner.add` events of the invite's world, each with
 * a valid id and signature, each written by the key the one before it added, the last adding the
 * invite's signer, no key twice. It proves nothing about the world until the genesis arrives and
 * its author equals `root` (and the service still checks the signer owns the world then).
 */
export function checkOwnerPath(raw: unknown, invite: Invite): Result<OwnerPath> {
  const bad = (why: string): Result<never> =>
    err(
      "invite-owners-invalid",
      `The invite's co-owner path ${why}.`,
      "Ask the co-owner who invited you for a new link.",
    );
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > OWNER_PATH_MAX) {
    return bad(`is not 1 to ${OWNER_PATH_MAX} owner additions`);
  }
  const adds: HistoryEventOf<"owner.add">[] = [];
  for (const item of raw) {
    const read = readEvent(item);
    if (!read.ok || read.value.kind !== "owner.add") return bad("holds something else");
    if (!verifyEvent(read.value).ok) return bad("holds an addition that does not verify");
    if (read.value.world !== invite.world) return bad("is for another world");
    adds.push(read.value);
  }
  const keys = new Set<string>();
  let previous: HistoryEventOf<"owner.add"> | null = null;
  for (const add of adds) {
    if (previous !== null && add.author !== previous.body.key) return bad("is broken");
    if (keys.has(add.author)) return bad("goes in a circle");
    keys.add(add.author);
    if (keys.has(add.body.key)) return bad("goes in a circle");
    previous = add;
  }
  const root = adds[0]?.author ?? "";
  return previous?.body.key === invite.by
    ? ok({ root, adds })
    : bad("does not lead to the key that signed the invite");
}
