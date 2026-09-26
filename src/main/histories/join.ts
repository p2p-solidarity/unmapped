// Redeeming an invite (rev 6 phase 3, D8, D10, D11): `world.join(link, name, instanceId?)`.
//
//   1. read the link (the owner-signed invite and its one-time secret); prove the secret is held,
//      bound to this device's key (`signJoinProof`);
//   2. open the world with `join` and collect its whole history; the genesis must hash to the
//      invite's world and be written by the invite's signer (`genesis.author === invite.by`) — or,
//      for a co-owner's invite (phase 4 D5), by the root of its `&o=` path, with the signer an
//      owner in the verified history —, its physics reproducible here, and the log must verify
//      (chain, the ownership pass and receipts);
//   3. submit `member.join` and wait until the service sequences it (or refuses it);
//   4. install the exact cartridge revision the genesis names (a verified pack blob, or this build's
//      own copy of a shipped revision), then the AI works its places and chapters announce;
//   5. make the save (or reuse `instanceId`, a save restored from the owner): the genesis seed and
//      language, this build's physics (equal to the genesis's); write the history, link.json,
//      world.json (`migrated: null`: nothing of this save's own went in) and progress.json.
//
// Nothing is written before the cartridge is in; a refused join leaves the device as it was. The
// history is written before the save, so a save never exists without the world it joined.

import { mkdir } from "node:fs/promises";
import { inviteRoot, readInviteLink } from "@shared/history/access";
import { verifyInvite } from "@shared/history/admit";
import { readEvent } from "@shared/history/event";
import { emptyNow, foldEntries, openGenesis } from "@shared/history/fold";
import { verifyLog } from "@shared/history/log";
import { isOwner } from "@shared/history/owners";
import { inviteSigned, signJoinProof } from "@shared/history/sign";
import type { GenesisEvent, Invite, LogEntry, WorldNow } from "@shared/history/types";
import { LANGUAGE_TAG_PATTERN } from "@shared/language";
import { checkPhysics, PHYSICS_VERSION } from "@shared/physics";
import { err, ok, type Result } from "@shared/result";
import { SEED_PATTERN } from "@shared/seedCode";
import type { WorldJoined } from "@shared/worldApi";
import { emptyWorldProgress } from "@shared/worldProgress";
import type { DeviceKey } from "../identity/deviceKey";
import { saveDir } from "../instances/paths";
import { createInstance, readInstance } from "../instances/store";
import { collectLog, openFromZero } from "./attach";
import type { HostCore } from "./core";
import { writeLink } from "./logStore";
import { installLog } from "./migrate";
import { worldDir } from "./paths";
import { mergeProgress, readProgress, readWorldPin, writeProgress, writeWorldPin } from "./pin";
import { receiveCartridge, receiveWorks } from "./receive";
import { startSync } from "./syncWorld";
import { indexWorld } from "./worldIndex";

const JOIN_MS = 15_000;

function refusedJoin(
  message: string,
  hint = "Ask the world's owner for a new link.",
): Result<never> {
  return err("join-invalid", message, hint);
}

/**
 * The world as the service holds it, verified from the genesis to its head. `by` (the invite's
 * signer) must be its genesis author, or a co-owner the verified history names (phase 4, D5).
 */
export async function fetchHistory(
  core: HostCore,
  input: { url: string; world: string; by: string; join?: { invite: Invite; proof: string } },
): Promise<Result<{ genesis: GenesisEvent; entries: LogEntry[]; now: WorldNow }>> {
  const send = openFromZero(core, input.url, input.world, input.join);
  const collected = await collectLog(core, input.url, input.world, send);
  if (!collected.ok) return collected;
  const genesis = openGenesis(collected.value.opened.genesis);
  if (!genesis.ok) return refusedJoin("The service sent a world that does not read.");
  if (genesis.value.id !== input.world) {
    return refusedJoin("The service's world is not the one this invite is for.");
  }
  const physics = checkPhysics(genesis.value.body.physicsVersion);
  if (!physics.ok) return physics;
  const verified = verifyLog(input.world, collected.value.entries);
  if (!verified.ok)
    return refusedJoin(`The world's history does not verify: ${verified.error.message}`);
  const now = foldEntries(
    emptyNow(genesis.value),
    collected.value.entries.map((entry) => ({ entry, verdict: core.verdictOf(entry.event) })),
  );
  if (genesis.value.author !== input.by && !isOwner(now, input.by)) {
    return refusedJoin("The service's world is not the one this invite is for.");
  }
  return ok({ genesis: genesis.value, entries: collected.value.entries, now });
}

/** Submits the `member.join` and waits for its receipt; the history including it. */
async function becomeMember(
  core: HostCore,
  input: {
    url: string;
    key: DeviceKey;
    name: string;
    now: WorldNow;
    invite: Invite;
    proof: string;
  },
): Promise<Result<void>> {
  const { url, key, now } = input;
  const event = key.signEvent({
    v: 1,
    world: now.world,
    kind: "member.join",
    author: key.author,
    at: core.nowIso(),
    seen: now.head.n,
    body: { invite: input.invite, name: input.name, proof: input.proof },
  });
  const read = readEvent(event);
  if (!read.ok) return read;
  const answer = core.hub.waitFor(
    url,
    (frame) =>
      (frame.t === "rejected" && frame.world === now.world && frame.id === event.id) ||
      (frame.t === "entries" &&
        frame.world === now.world &&
        frame.entries.some((entry) => entry.event.id === event.id)),
    JOIN_MS,
  );
  const sent = core.hub.send(url, { t: "submit", world: now.world, events: [event] });
  if (!sent.ok) return sent;
  const frame = await answer;
  if (frame === null)
    return err("service-timeout", "The world's service did not answer the join in time.");
  return frame.t === "rejected" ? { ok: false, error: frame.error } : ok(undefined);
}

/** A save for the joined world: `instanceId` if given (it must be pinned to it), else a new one. */
async function saveFor(
  core: HostCore,
  genesis: GenesisEvent,
  instanceId: string | undefined,
  manifest: Parameters<typeof createInstance>[1],
): Promise<Result<{ instanceId: string; saveDir: string }>> {
  const { instancesDir, cartridgesDir } = core.deps;
  if (instanceId !== undefined) {
    const instance = await readInstance(instancesDir, instanceId, cartridgesDir);
    if (!instance.ok) return instance;
    const dir = saveDir(instancesDir, instanceId, instance.value.meta.activeSaveId);
    const pin = await readWorldPin(dir);
    if (!pin.ok) return pin;
    if (pin.value !== null && pin.value.worldId !== genesis.id) {
      return refusedJoin(
        "That save belongs to another world.",
        "Join from the save of this world, or as a new save.",
      );
    }
    if (instance.value.meta.cartridge.contentHash !== genesis.body.cartridge.contentHash) {
      return refusedJoin("That save plays another cartridge than this world.");
    }
    return ok({ instanceId, saveDir: dir });
  }
  const { body } = genesis;
  if (body.physicsVersion !== PHYSICS_VERSION) {
    return err(
      "join-physics-pin",
      `This world keeps physics ${body.physicsVersion}; a new save here is made on ${PHYSICS_VERSION}.`,
      "Join it from a build made for that physics.",
    );
  }
  const seed = body.seed === body.cartridge.cartridgeId ? undefined : body.seed;
  if (seed !== undefined && !SEED_PATTERN.test(seed))
    return refusedJoin("The world's seed does not read.");
  const language = body.language === "und" ? undefined : body.language;
  if (language !== undefined && !LANGUAGE_TAG_PATTERN.test(language)) {
    return refusedJoin("The world's language does not read.");
  }
  const created = await createInstance(
    instancesDir,
    manifest,
    body.name,
    core.deps.clock(),
    seed,
    language,
  );
  if (!created.ok) return created;
  const id = created.value.meta.instanceId;
  return ok({
    instanceId: id,
    saveDir: saveDir(instancesDir, id, created.value.meta.activeSaveId),
  });
}

export async function joinWorld(
  core: HostCore,
  link: string,
  name: string,
  instanceId?: string,
): Promise<Result<WorldJoined>> {
  const parsed = readInviteLink(link);
  if (!parsed.ok) return parsed;
  const { invite, secret } = parsed.value;
  // Never connect for a link the owner did not sign (as previewInvite does).
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
  const token = `join:${invite.world}`;
  core.hub.want(url, token);
  try {
    if (!(await core.hub.ready(url, JOIN_MS))) {
      return err(
        "service-unreachable",
        `Cannot reach ${url}.`,
        "Check the connection and try again.",
      );
    }
    const serviceKey = core.hub.serviceKey(url);
    if (serviceKey === null)
      return err("service-unreachable", "The service did not identify itself.");
    const join = { invite, proof };
    const first = await fetchHistory(core, { url, world: invite.world, by: invite.by, join });
    if (!first.ok) return first;
    // An invite by a co-owner carries `&o=`, checked offline; it must start at this world's maker.
    if (first.value.genesis.author !== inviteRoot(parsed.value)) {
      return refusedJoin("The invite's signer does not lead back to this world's maker.");
    }
    const member = first.value.now.members[key.value.author] !== undefined;
    if (!member) {
      const valid = verifyInvite(first.value.now, invite, proof, key.value.author, core.nowIso());
      if (!valid.ok) return valid;
      const joined = await becomeMember(core, {
        url,
        key: key.value,
        name,
        now: first.value.now,
        invite,
        proof,
      });
      if (!joined.ok) return joined;
    }
    const history = member
      ? first
      : await fetchHistory(core, { url, world: invite.world, by: invite.by });
    if (!history.ok) return history;
    const { genesis, entries, now } = history.value;
    const cartridge = await receiveCartridge(core, { genesis, now, url, key: key.value });
    if (!cartridge.ok) return cartridge;
    // The history first (a save without it would later migrate into a world of its own), then
    // the save, then its pin.
    await mkdir(core.histories, { recursive: true });
    const installed = await installLog(core.histories, genesis.id, "join", entries);
    if (!installed.ok) return installed;
    if (installed.value) {
      const link = {
        v: 1,
        url,
        key: serviceKey,
        attachedAt: core.nowIso(),
        diverged: null,
      } as const;
      await writeLink(worldDir(core.histories, genesis.id), link);
    }
    const from = { instanceId: genesis.body.from.instanceId, owner: genesis.author };
    await indexWorld(core.histories, genesis.id, from);
    const save = await saveFor(core, genesis, instanceId, cartridge.value);
    if (!save.ok) return save;
    const progress = await readProgress(save.value.saveDir, genesis.id);
    if (!progress.ok) return progress;
    const empty = emptyWorldProgress(genesis.id);
    await writeProgress(save.value.saveDir, mergeProgress(progress.value, empty));
    const pin = await readWorldPin(save.value.saveDir);
    if (!pin.ok) return pin;
    if (pin.value === null) {
      await writeWorldPin(save.value.saveDir, { v: 1, worldId: genesis.id, migrated: null });
    }
    return core.withWorld(genesis.id, async (world) => {
      startSync(core, world);
      void receiveWorks(core, world);
      const status = await core.status(world, key);
      return ok({ worldId: world.id, instanceId: save.value.instanceId, status });
    });
  } finally {
    core.hub.unwant(url, token);
  }
}
