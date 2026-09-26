// The `door` scenario of scripts/world-probe.ts (rev 6 phase 3, D8 invites and access, D9 visitor
// limits). A throwaway owner attaches a friends world and signs invites; fresh keys B, C, … try the
// door the way a copied link, a stale link or a stranger would. Expected codes are the ones
// `verifyInvite` / `mayWrite` (@shared/history) and the service's quotas define.
//
// The receipt clock matters twice: invite expiry is judged by the service's rt (read here from the
// entries it serves), and the per-day visitor limits count per receipt day — so, before the visitor
// steps, the scenario moves the test clock one day on (`POST /v1/test/advance`) to start from a
// day on which this address has brought no new visitor keys.

import { DAY_MS } from "@shared/history/ids";
import type { EventBodies, EventKind, StoredEvent } from "@shared/history/types";
import { advance, type Endpoint, ProbeSocket } from "./probeSocket";
import type { Steps } from "./probeSteps";
import {
  freshKey,
  genesisBody,
  iso,
  joinEvent,
  LocalWorld,
  makeInvite,
  noteBody,
  type ProbeKey,
  proofOf,
  sign,
  signpostBody,
  type Ticket,
  witnessBody,
} from "./probeWorld";

export interface DoorLimits {
  /** The service's --visitor-events-per-key-per-day. */
  visitorKeyEvents: number;
  /** The service's --new-visitor-keys-per-ip. */
  newVisitorKeys: number;
}

export const DEFAULT_DOOR_LIMITS: DoorLimits = { visitorKeyEvents: 20, newVisitorKeys: 5 };

interface Door {
  endpoint: Endpoint;
  steps: Steps;
  world: LocalWorld;
  owner: ProbeSocket;
  /** The service's receipt clock right after the attach (ms). */
  clock: number;
}

function invite(door: Door, options: { uses?: number; expMs?: number } = {}): Ticket {
  const exp = iso(options.expMs ?? door.clock + DAY_MS);
  const { url } = door.endpoint;
  return makeInvite(door.world.id, door.world.owner, { svc: url, exp, uses: options.uses ?? 1 });
}

/** Opens as an invitee holding `ticket` with a proof bound to its own key. */
async function openWith(socket: ProbeSocket, door: Door, ticket: Ticket): Promise<string> {
  const join = { invite: ticket.invite, proof: proofOf(ticket, socket.key) };
  return socket.open(door.world.id, { join });
}

/** Joins `who` with `ticket` over its own socket; the socket stays open as a member's. */
async function join(door: Door, who: ProbeKey, ticket: Ticket, name: string) {
  const socket = await ProbeSocket.connect(door.endpoint, who);
  door.steps.require(
    `${name} opens with its invite (control)`,
    "opened:invitee",
    await openWith(socket, door, ticket),
  );
  const event = joinEvent(
    door.world.id,
    { invite: ticket.invite, proof: proofOf(ticket, who.key) },
    who,
    name,
    socket.head(door.world.id),
  );
  door.steps.require(
    `${name} submits its member.join (control)`,
    "accepted",
    await socket.submitOne(door.world.id, event),
  );
  return { socket, event };
}

/** A fresh key tries to open with `ticket` (its own proof); returns the service's answer. */
async function stranger(door: Door, ticket: Ticket | null): Promise<string> {
  const socket = await ProbeSocket.connect(door.endpoint, freshKey());
  const answer =
    ticket === null ? await socket.open(door.world.id) : await openWith(socket, door, ticket);
  await socket.close();
  return answer;
}

async function invites(door: Door): Promise<{ bea: ProbeSocket; eve: ProbeKey }> {
  const { steps, world } = door;
  const id = world.id;
  steps.check(
    "a stranger opens the friends world without an invite",
    "access-members-only",
    await stranger(door, null),
  );

  const shared = invite(door, { uses: 2 });
  const beaKey = freshKey();
  const { socket: bea, event: beaJoin } = await join(door, beaKey, shared, "Bea");

  const cam = await ProbeSocket.connect(door.endpoint, freshKey());
  const copied = { invite: shared.invite, proof: beaJoin.body.proof };
  steps.check(
    "C opens with Bea's invite and the proof copied from her logged member.join (a use left)",
    "invite-proof-invalid",
    await cam.open(id, { join: copied }),
  );
  const own = invite(door);
  steps.require(
    "C opens with an invite of its own (control)",
    "opened:invitee",
    await openWith(cam, door, own),
  );
  const seen = () => cam.head(id);
  steps.check(
    "C submits a member.join replaying Bea's invite and proof under C's key",
    "invite-proof-invalid",
    await cam.submitOne(id, joinEvent(id, copied, cam.me, "Cam", seen())),
  );
  steps.check(
    "C submits Bea's signed member.join verbatim",
    "event-not-yours",
    await cam.submitOne(id, beaJoin),
  );

  const forger = freshKey();
  const forged = makeInvite(id, forger, {
    svc: door.endpoint.url,
    exp: iso(door.clock + DAY_MS),
    by: world.owner.key,
  });
  steps.check(
    "an invite naming the owner but signed by another key",
    "invite-sig-invalid",
    await stranger(door, forged),
  );
  const notOwner = makeInvite(id, forger, {
    svc: door.endpoint.url,
    exp: iso(door.clock + DAY_MS),
  });
  steps.check(
    "an invite signed by a key that does not own the world",
    "invite-not-owner",
    await stranger(door, notOwner),
  );

  const expired = invite(door, { expMs: door.clock - 60_000 });
  steps.check("an expired invite, at the open", "invite-expired", await stranger(door, expired));
  const expiredJoin = { invite: expired.invite, proof: proofOf(expired, cam.key) };
  steps.check(
    "an expired invite, in a member.join",
    "invite-expired",
    await cam.submitOne(id, joinEvent(id, expiredJoin, cam.me, "Cam", seen())),
  );

  const single = invite(door, { uses: 1 });
  const eve = freshKey();
  const { socket: eveSocket } = await join(door, eve, single, "Eve");
  await eveSocket.close();
  steps.check(
    "an invite already used up, at the open",
    "invite-used-up",
    await stranger(door, single),
  );
  const usedJoin = { invite: single.invite, proof: proofOf(single, cam.key) };
  steps.check(
    "an invite already used up, in a member.join",
    "invite-used-up",
    await cam.submitOne(id, joinEvent(id, usedJoin, cam.me, "Cam", seen())),
  );

  const withdrawn = invite(door, { uses: 5 });
  const revoke = sign(
    id,
    "invite.revoke",
    { nonce: withdrawn.invite.nonce },
    world.owner,
    door.owner.head(id),
  );
  steps.require(
    "the owner revokes an unused invite (control)",
    "accepted",
    await door.owner.submitOne(id, revoke),
  );
  steps.check("a revoked invite, at the open", "invite-revoked", await stranger(door, withdrawn));
  const revokedJoin = { invite: withdrawn.invite, proof: proofOf(withdrawn, cam.key) };
  steps.check(
    "a revoked invite, in a member.join",
    "invite-revoked",
    await cam.submitOne(id, joinEvent(id, revokedJoin, cam.me, "Cam", seen())),
  );
  const ownJoin = { invite: own.invite, proof: proofOf(own, cam.key) };
  steps.check(
    "C joins with its own invite after every refusal (control)",
    "accepted",
    await cam.submitOne(id, joinEvent(id, ownJoin, cam.me, "Cam", seen())),
  );
  await cam.close();
  return { bea, eve };
}

async function visitors(door: Door, bea: ProbeSocket, limits: DoorLimits): Promise<void> {
  const { steps, world, endpoint } = door;
  const id = world.id;
  const moved = await advance(endpoint, 1);
  steps.require(
    "move the receipt clock one day on, to a day this address brought no visitor keys (test mode)",
    "ok",
    moved.answer,
  );
  const open = sign(id, "access", { policy: "public" }, world.owner, door.owner.head(id));
  steps.require(
    "the owner opens the door to the public",
    "accepted",
    await door.owner.submitOne(id, open),
  );

  const vic = await ProbeSocket.connect(endpoint, freshKey());
  steps.require("a visitor opens the public world", "opened:visitor", await vic.open(id));
  const by = <K extends EventKind>(socket: ProbeSocket, kind: K, body: EventBodies[K]) =>
    sign(id, kind, body, socket.me, socket.head(id));
  steps.check(
    "the visitor leaves a note",
    "accepted",
    await vic.submitOne(id, by(vic, "note", noteBody("A visitor was here."))),
  );
  steps.check(
    "the visitor puts up a signpost",
    "accepted",
    await vic.submitOne(id, by(vic, "signpost", signpostBody("To the ford"))),
  );
  steps.check(
    "the visitor claims a chunk to witness",
    "access-visitor-kind",
    await vic.claim(id, "chunk:4,4"),
  );
  const witness = witnessBody(4, 4, "Visitor Moor", [{ id: "ada", name: "Ada" }]);
  steps.check(
    "the visitor submits a witness",
    "access-visitor-kind",
    await vic.submitOne(id, by(vic, "witness", witness)),
  );
  steps.check(
    "the visitor submits a profile (a visitor kind, control)",
    "accepted",
    await vic.submitOne(id, by(vic, "profile", { name: "Vic" })),
  );

  const left = limits.visitorKeyEvents - 3;
  const notes: StoredEvent[] = [];
  for (let index = 0; index < left + 1; index += 1) {
    notes.push(by(vic, "note", noteBody(`Visitor note ${index + 4}`)));
  }
  const answers: string[] = [];
  for (let start = 0; start < notes.length; start += 16) {
    answers.push(...(await vic.submit(id, notes.slice(start, start + 16))));
  }
  const kept = answers.slice(0, left);
  steps.check(
    `the visitor's traces 4..${limits.visitorKeyEvents} of the receipt day`,
    "accepted",
    kept.every((answer) => answer === "accepted") ? "accepted" : [...new Set(kept)].join(","),
    `${kept.filter((answer) => answer === "accepted").length}/${kept.length} accepted`,
  );
  steps.check(
    `the visitor's trace ${limits.visitorKeyEvents + 1} of the day`,
    "quota-visitor-key",
    answers[left] ?? "none",
  );
  steps.check(
    "a member's note while the visitor is at its limit (visitor limits never touch members)",
    "accepted",
    await bea.submitOne(id, sign(id, "note", noteBody("Bea's note"), bea.me, bea.head(id))),
  );

  const extra: ProbeSocket[] = [];
  for (let index = 2; index <= limits.newVisitorKeys + 1; index += 1) {
    const socket = await ProbeSocket.connect(endpoint, freshKey());
    await socket.open(id);
    const answer = await socket.submitOne(id, by(socket, "signpost", signpostBody(`Key ${index}`)));
    const last = index === limits.newVisitorKeys + 1;
    steps.check(
      `new visitor key ${index} of this address today writes a signpost`,
      last ? "quota-visitor-keys" : "accepted",
      answer,
    );
    if (last) await socket.close();
    else extra.push(socket);
  }
  const known = extra[0];
  if (known !== undefined) {
    steps.check(
      "a visitor key already known today writes again (the cap counts new keys only)",
      "accepted",
      await known.submitOne(id, by(known, "note", noteBody("Back again."))),
    );
  }
  for (const socket of extra) await socket.close();
  await vic.close();
}

async function removal(door: Door, bea: ProbeSocket, eve: ProbeKey): Promise<void> {
  const { steps, world, endpoint } = door;
  const id = world.id;
  const pushed = bea.mark();
  const remove = sign(id, "member.remove", { key: bea.key }, world.owner, door.owner.head(id));
  steps.require("the owner removes Bea", "accepted", await door.owner.submitOne(id, remove));
  const dropped = await bea.until(
    (frame) => (frame.t === "refused" && frame.world === id ? frame.error.code : undefined),
    pushed,
  );
  steps.check(
    "Bea, still connected, is dropped at once",
    "access-removed",
    dropped ?? bea.silence(),
  );
  steps.check("Bea opens the world again", "access-removed", await bea.open(id));
  steps.check(
    "Bea's member.join is still in the log",
    "kept",
    door.owner
      .mirror(id)
      .entries.some((entry) => entry.event.kind === "member.join" && entry.event.author === bea.key)
      ? "kept"
      : "gone",
  );
  const close = sign(id, "access", { policy: "private" }, world.owner, door.owner.head(id));
  steps.require(
    "the owner makes the world private",
    "accepted",
    await door.owner.submitOne(id, close),
  );
  const member = await ProbeSocket.connect(endpoint, eve);
  steps.check("Eve, a member, opens the private world", "access-private", await member.open(id));
  await member.close();
  steps.check("a visitor opens the private world", "access-private", await stranger(door, null));
  await bea.close();
}

export async function doorScenario(
  endpoint: Endpoint,
  steps: Steps,
  limits: DoorLimits = DEFAULT_DOOR_LIMITS,
): Promise<void> {
  const ownerKey = freshKey();
  const owner = await ProbeSocket.connect(endpoint, ownerKey);
  const world = new LocalWorld(ownerKey, genesisBody("Probe door"));
  world.write("profile", { name: "Probe owner" });
  steps.require(
    "the owner attaches a friends world (control)",
    "opened:owner",
    await owner.attach(world),
  );
  const door: Door = { endpoint, steps, world, owner, clock: owner.lastRt(world.id) };
  const { bea, eve } = await invites(door);
  await visitors(door, bea, limits);
  await removal(door, bea, eve);
  await owner.close();
}
