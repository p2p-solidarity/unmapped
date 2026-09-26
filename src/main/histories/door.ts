// The world's door and the library, in main (rev 6 phase 3, D8, WP8): the owner's two door
// actions the draft kinds leave out (`invite.revoke`, `member.remove`), making an invite and
// remembering it (./issued) so it can be revoked later, what the door shows (people, policy,
// invites, the chain opt-in), a look at the world an invite leads to before joining it, and where
// each save's world lives for the library's badges.
//
// "Owner" means every key that owns the world now (phase 4, D5: the maker and its co-owners,
// `isOwner`), never only the genesis author: a co-owner's device sees its own invites, gets the
// owner's rows and actions, and badges its world "shared". The co-owner actions are ./owners.
//
// The preview opens the world with the invite exactly as a join would (the proof is bound to this
// device's key), verifies the whole history the same way, checks the invite against it — including
// that an invite by a co-owner leads back to the world's maker (`inviteRoot`) — and writes
// nothing. Badges read only the saves' world.json pins and the histories they name: they never
// migrate a save (that is `ensure`, when Play opens it).

import { inviteRoot, readInviteLink } from "@shared/history/access";
import { verifyInvite } from "@shared/history/admit";
import { chainRecording } from "@shared/history/fold";
import { currentOwners, isOwner } from "@shared/history/owners";
import { inviteSigned, signJoinProof } from "@shared/history/sign";
import type { WorldNow } from "@shared/history/types";
import { err, ok, type Result } from "@shared/result";
import type {
  DoorPerson,
  DoorRowKind,
  InvitePreview,
  WorldAppended,
  WorldBadge,
  WorldBadgeKind,
  WorldDoor,
  WorldInvite,
} from "@shared/worldApi";
import { saveDir } from "../instances/paths";
import { listInstances } from "../instances/store";
import { appendDraft } from "./commit";
import type { HostCore } from "./core";
import type { WorldHost } from "./host";
import { issuedInvites, issuedLineOf, readIssued, recordIssued } from "./issued";
import { fetchHistory } from "./join";
import { isLocalOnly, pendingNow } from "./loaded";
import { readWorldPin, type WorldPin } from "./pin";

const PREVIEW_MS = 15_000;

export function revokeInvite(
  core: HostCore,
  worldId: string,
  nonce: string,
): Promise<Result<WorldAppended>> {
  return appendDraft(core, worldId, (world) => ({
    kind: "invite.revoke",
    body: { nonce },
    seen: world.now.head.n,
  }));
}

export function removeMember(
  core: HostCore,
  worldId: string,
  key: string,
): Promise<Result<WorldAppended>> {
  return appendDraft(core, worldId, (world) => ({
    kind: "member.remove",
    body: { key },
    seen: world.now.head.n,
  }));
}

/** Makes an invite (the owner's, `host.invite`) and remembers it on this device, secret left out. */
export async function issueInvite(
  host: Pick<WorldHost, "core" | "invite">,
  worldId: string,
  options: { uses: number; days: number },
): Promise<Result<WorldInvite>> {
  const made = await host.invite(worldId, options);
  if (!made.ok) return made;
  const read = readInviteLink(made.value.link);
  if (!read.ok) return read;
  const recorded = await host.core.withWorld(worldId, async (world) => {
    try {
      await recordIssued(world.dir, issuedLineOf(read.value.invite, host.core.nowIso()));
      return ok(undefined);
    } catch (cause) {
      return err(
        "world-invite-not-recorded",
        `The invite could not be written down: ${cause instanceof Error ? cause.message : String(cause)}`,
        "Nothing was shared; check the disk and make the invite again.",
      );
    }
  });
  return recorded.ok ? made : recorded;
}

/**
 * Who the door lists: the owners (the maker first while it owns the world, then its co-owners in
 * the order they became owners), current members by join order, then removed keys — members
 * removed, and former owners that are not members — by the entry that removed them.
 */
export function doorPeople(now: WorldNow, me: string | null, sequencedN: number): DoorPerson[] {
  const person = (
    kind: DoorRowKind,
    key: string,
    n: number | null,
    pending: boolean,
  ): DoorPerson => ({
    kind,
    key,
    name: now.names[key] ?? now.members[key]?.name ?? null,
    n,
    pending,
    me: me === key,
  });
  const owners = currentOwners(now).map((key) => {
    const owner = now.owners[key];
    return key === now.owner
      ? person("owner", key, null, false)
      : person("co-owner", key, owner?.n ?? null, owner?.pending ?? false);
  });
  const members = Object.values(now.members)
    .filter((member) => now.removed[member.key] === undefined && !isOwner(now, member.key))
    .sort((a, b) => a.n - b.n)
    .map((member) => person("member", member.key, member.n, member.pending));
  const removedMembers = Object.entries(now.removed).map(([key, n]) =>
    person("removed", key, n, n > sequencedN),
  );
  const formerOwners = Object.values(now.owners).flatMap((owner) =>
    owner.removed === null ||
    now.members[owner.key] !== undefined ||
    now.removed[owner.key] !== undefined
      ? []
      : [person("removed", owner.key, owner.removed, owner.pending)],
  );
  const removed = [...removedMembers, ...formerOwners].sort((a, b) => (a.n ?? 0) - (b.n ?? 0));
  return [...owners, ...members, ...removed];
}

/** The door as this device sees it now, its own unsent door changes included. */
export async function readDoor(core: HostCore, worldId: string): Promise<Result<WorldDoor>> {
  const key = await core.deps.key();
  return core.withWorld(worldId, async (world) => {
    const rt = core.nowIso();
    const now = pendingNow(world, rt);
    const me = key.ok ? key.value.author : null;
    // Any owner's device keeps the invites it made (phase 4, D5), so it can revoke them.
    const issued = me !== null && isOwner(now, me) ? await readIssued(world.dir) : ok([]);
    if (!issued.ok) return issued;
    return ok({
      world: world.id,
      name: world.genesis.body.name,
      status: await core.status(world, key),
      access: now.access,
      accessPending: now.access !== world.now.access,
      owner: world.owner,
      people: doorPeople(now, me, world.now.head.n),
      invites: issuedInvites(issued.value, now, rt),
      recording: chainRecording(now),
      recordingPending: chainRecording(now) !== chainRecording(world.now),
    });
  });
}

/** Every save's active world pin, newest save first (a save without one has no world yet). */
async function pins(
  core: HostCore,
): Promise<Result<Array<{ instanceId: string; name: string; pin: WorldPin }>>> {
  const { instancesDir, cartridgesDir } = core.deps;
  const metas = await listInstances(instancesDir, cartridgesDir);
  if (!metas.ok) return metas;
  const found: Array<{ instanceId: string; name: string; pin: WorldPin }> = [];
  for (const meta of metas.value) {
    const pin = await readWorldPin(saveDir(instancesDir, meta.instanceId, meta.activeSaveId));
    if (pin.ok && pin.value !== null) {
      found.push({ instanceId: meta.instanceId, name: meta.name, pin: pin.value });
    }
  }
  return ok(found);
}

export async function previewInvite(core: HostCore, link: string): Promise<Result<InvitePreview>> {
  const parsed = readInviteLink(link);
  if (!parsed.ok) return parsed;
  const { invite, secret } = parsed.value;
  if (!inviteSigned(invite)) {
    return err(
      "invite-sig-invalid",
      "This invite's signature does not verify.",
      "Ask the owner for a new link.",
    );
  }
  const key = await core.deps.key();
  if (!key.ok) return key;
  const proof = signJoinProof(secret, invite, key.value.author);
  const url = invite.svc;
  const token = `preview:${invite.world}`;
  core.hub.want(url, token);
  try {
    if (!(await core.hub.ready(url, PREVIEW_MS))) {
      return err(
        "service-unreachable",
        `Cannot reach ${url}.`,
        "Check the connection and try again.",
      );
    }
    const history = await fetchHistory(core, {
      url,
      world: invite.world,
      by: invite.by,
      join: { invite, proof },
    });
    // A world this device syncs itself keeps its subscription; a look leaves nothing open.
    if (!core.worlds.has(invite.world)) core.hub.send(url, { t: "close", world: invite.world });
    if (!history.ok) return history;
    const { genesis, now } = history.value;
    // An invite by a co-owner carries `&o=`, checked offline; it must start at this world's maker
    // (as join checks), or the preview would vouch for a world the link does not lead to.
    if (genesis.author !== inviteRoot(parsed.value)) {
      return err(
        "join-invalid",
        "The invite's signer does not lead back to this world's maker.",
        "Ask the world's owner for a new link.",
      );
    }
    const me = key.value.author;
    const member = now.members[me] !== undefined && now.removed[me] === undefined;
    if (!member) {
      const valid = verifyInvite(now, invite, proof, me, core.nowIso());
      if (!valid.ok) return valid;
    }
    const saves = await pins(core);
    if (!saves.ok) return saves;
    const restored = saves.value.find((save) => save.pin.worldId === genesis.id) ?? null;
    const current = Object.keys(now.members).filter((one) => now.removed[one] === undefined);
    return ok({
      world: genesis.id,
      name: genesis.body.name,
      owner: genesis.author,
      ownerName: now.names[genesis.author] ?? null,
      service: url,
      exp: invite.exp,
      uses: invite.uses,
      left: Math.max(0, invite.uses - (now.invites[invite.nonce]?.uses ?? 0)),
      access: now.access,
      members: current.length,
      head: now.head.n,
      member,
      restored: restored === null ? null : { instanceId: restored.instanceId, name: restored.name },
    });
  } finally {
    core.hub.unwant(url, token);
  }
}

/**
 * Where a world lives as this device sees it: `local` when only this device sequences it, `shared`
 * when this device owns or co-owns it (without a device key: a save this device migrated),
 * otherwise `joined`.
 */
export function badgeKind(
  now: WorldNow,
  here: { local: boolean; me: string | null; migrated: boolean },
): WorldBadgeKind {
  if (here.local) return "local";
  const ownedHere = here.me !== null ? isOwner(now, here.me) : here.migrated;
  return ownedHere ? "shared" : "joined";
}

export async function worldBadges(core: HostCore): Promise<Result<WorldBadge[]>> {
  const saves = await pins(core);
  if (!saves.ok) return saves;
  const key = await core.deps.key();
  const badges: WorldBadge[] = [];
  for (const { instanceId, pin } of saves.value) {
    // A history that does not load is reported when its save opens (ensure); no badge until then.
    const read = await core.withWorld(pin.worldId, async (world) => ok(world));
    if (!read.ok) continue;
    const world = read.value;
    badges.push({
      instanceId,
      worldId: world.id,
      kind: badgeKind(world.now, {
        local: isLocalOnly(world),
        me: key.ok ? key.value.author : null,
        migrated: pin.migrated !== null,
      }),
      url: world.link?.url ?? world.now.sequencer?.url ?? null,
      owner: world.owner,
      ownerName: world.now.names[world.owner] ?? null,
    });
  }
  return ok(badges);
}
