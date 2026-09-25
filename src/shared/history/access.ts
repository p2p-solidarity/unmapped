// The world's door (rev 6 phase 3, D8): who reads and who writes, derived from the fold only.
//
// | policy  | reads                    | writes                                                  |
// | private | the owner                | the owner                                               |
// | friends | the owner and members    | the owner and members: every kind                       |
// | public  | anyone with the world id | members as in friends; visitors only VISITOR_KINDS      |
//
// Owner-only kinds are the owner's under every policy; a beat is the beater's (the sequencer key
// once attached, else the owner); a removed key writes nothing. Invites travel as the text
// `unmapped://join?i=<base64url(canonical invite)>&k=<base64url(invite secret)>`.

import { canonicalJson } from "../canonical";
import { err, ok, type Result } from "../result";
import { inviteSchema } from "./bodies";
import { base64Url, fromBase64Url, utf8 } from "./ids";
import { authorKeyFor } from "./sign";
import type { EventKind, Invite, WorldNow } from "./types";

export const OWNER_KINDS: readonly EventKind[] = [
  "genesis",
  "access",
  "sequencer",
  "pack",
  "hide",
  "invite.revoke",
  "member.remove",
];

/** What a visitor may write in a public world: traces, never AI content. */
export const VISITOR_KINDS: readonly EventKind[] = [
  "profile",
  "note",
  "signpost",
  "gift",
  "gift.take",
  "visit",
];

export type Role = "owner" | "member" | "visitor" | "removed";

type Door = Pick<WorldNow, "owner" | "access" | "members" | "removed" | "sequencer">;

export function roleOf(now: Door, key: string): Role {
  if (key === now.owner) return "owner";
  if (now.removed[key] !== undefined) return "removed";
  return now.members[key] !== undefined ? "member" : "visitor";
}

/** Who writes beats: the sequencer key once attached, else the owner. */
export function beaterOf(now: Pick<WorldNow, "owner" | "sequencer">): string {
  return now.sequencer?.key ?? now.owner;
}

/** Whether `key` may read and sync the world (the service's check; the sequencer always may). */
export function mayRead(now: Door, key: string): boolean {
  if (now.sequencer !== null && key === now.sequencer.key) return true;
  const role = roleOf(now, key);
  if (role === "owner") return true;
  if (role === "removed" || now.access === "private") return false;
  return role === "member" || now.access === "public";
}

/** Whether `key` may write an event of `kind` under the current door. */
export function mayWrite(now: Door, kind: EventKind, key: string): Result<void> {
  if (kind === "beat") {
    return key === beaterOf(now)
      ? ok(undefined)
      : err("access-not-beater", "Only the world's sequencer writes beats.");
  }
  const role = roleOf(now, key);
  if (role === "removed") {
    return err("access-removed", "The owner removed this key from the world.");
  }
  if (OWNER_KINDS.includes(kind)) {
    return role === "owner"
      ? ok(undefined)
      : err(
          "access-owner-only",
          "Only the world's owner changes its door.",
          "Do it from the device that made the world.",
        );
  }
  if (kind === "member.join") {
    if (role !== "visitor") return err("member-already", "This key already belongs here.");
    return now.access === "private"
      ? err("access-private", "This world is private.", "Ask its owner to open the door.")
      : ok(undefined);
  }
  if (role === "owner") return ok(undefined);
  if (now.access === "private") {
    return err("access-private", "This world is private.", "Ask its owner to open the door.");
  }
  if (role === "member") return ok(undefined);
  if (now.access === "public" && VISITOR_KINDS.includes(kind)) return ok(undefined);
  return now.access === "public"
    ? err(
        "access-visitor-kind",
        "Only members write this world.",
        "Visitors leave notes, signposts and gifts; ask the owner for an invite to write more.",
      )
    : err("access-members-only", "Only members write this world.", "Ask the owner for an invite.");
}

const INVITE_LINK = /^unmapped:\/\/join\?i=([A-Za-z0-9_-]{1,4000})&k=([A-Za-z0-9_-]{43})$/;

/** D8: the invite, and its one-time secret the joiner signs the proof with. */
export function inviteLink(invite: Invite, secret: Uint8Array): string {
  return `unmapped://join?i=${base64Url(utf8(canonicalJson(invite)))}&k=${base64Url(secret)}`;
}

/**
 * The invite a pasted link carries and its secret: shape only, plus that the secret is the
 * invite's own key. `verifyInvite` checks the invite against the world.
 */
export function readInviteLink(text: string): Result<{ invite: Invite; secret: Uint8Array }> {
  const invalid = err(
    "invite-link-invalid",
    "That is not an invite link.",
    "Paste the whole link.",
  );
  const match = INVITE_LINK.exec(text.trim());
  const bytes = match?.[1] === undefined ? null : fromBase64Url(match[1]);
  const secret = match?.[2] === undefined ? null : fromBase64Url(match[2]);
  if (bytes === null || secret === null || secret.length !== 32) return invalid;
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return err("invite-link-invalid", "That invite link is damaged.", "Ask for a new link.");
  }
  const parsed = inviteSchema.safeParse(raw);
  if (!parsed.success || authorKeyFor(secret) !== parsed.data.key) {
    return err("invite-link-invalid", "That invite link is damaged.", "Ask for a new link.");
  }
  return ok({ invite: parsed.data, secret });
}
