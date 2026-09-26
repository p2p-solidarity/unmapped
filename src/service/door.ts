// Who may read a world on this service, and how many worlds one connection holds open (rev 6
// phase 3, D8–D9; moved out of ./hub whole, phase 4). Reads follow the world's door: the owners;
// members unless private; an invitee holding a valid invite and proof (to fetch the pack and submit
// its `member.join`); anyone in a public world. D9 limits one connection to `openWorlds` worlds,
// whether it opened them or attached them (the world-probe found attach skipping the check).

import { mayRead, roleOf } from "@shared/history/access";
import { verifyInvite } from "@shared/history/admit";
import { type AppError, err, ok, type Result } from "@shared/result";
import type { OpenedRole } from "@shared/worldProtocol";
import { isoAt } from "./clock";
import type { Hub, Join, Session } from "./hub";
import type { ServiceWorld } from "./world";

/**
 * Whether `key` may read `world` now, and as what. An invitee needs a valid invite and proof;
 * in a public world anyone reads as a visitor.
 */
export function readAccess(
  hub: Hub,
  world: ServiceWorld,
  key: string,
  join: Join | null,
): Result<OpenedRole> {
  const { now } = world;
  const role = roleOf(now, key);
  if (role === "owner") return ok("owner");
  if (role === "removed") {
    return err("access-removed", "The owner removed this key from the world.");
  }
  if (now.access === "private") {
    return err("access-private", "This world is private.", "Ask its owner to open the door.");
  }
  if (role === "member") return ok("member");
  if (join !== null) {
    const at = isoAt(hub.clock.now());
    if (verifyInvite(now, join.invite, join.proof, key, at).ok) return ok("invitee");
  }
  if (now.access === "public") return ok("visitor");
  return err(
    "access-members-only",
    "Only members read this world.",
    "Ask the owner for an invite.",
  );
}

/** Blob reads: whoever may read the world, or holds a live invitee subscription to it. */
export function mayReadBlob(hub: Hub, world: ServiceWorld, key: string): boolean {
  if (mayRead(world.now, key)) return true;
  return hub.readers(world.id).some((session) => {
    const sub = session.worlds.get(world.id);
    return session.key === key && sub?.join != null && readAccess(hub, world, key, sub.join).ok;
  });
}

/** D9: at most `openWorlds` worlds open on one connection, by `open` and by `attach` alike. */
export function openQuota(hub: Hub, session: Session, world: string): AppError | null {
  if (session.worlds.has(world) || session.worlds.size < hub.limits.openWorlds) return null;
  return {
    code: "quota-open-worlds",
    message: `At most ${hub.limits.openWorlds} worlds open per connection.`,
    hint: "Close a world first.",
  };
}
