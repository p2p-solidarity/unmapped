// Redeeming an invite in the page (rev 6 phase 4, D7; P3 D8, D11), as main does it
// (main/histories/join.ts) minus the save and the cartridge install, which the proof leaves out:
//
//   1. read the link: the owner-signed invite and its one-time secret. The secret signs the proof
//      (bound to this browser's WebCrypto key) with @noble/curves right here and is then dropped —
//      it is never stored, logged or sent;
//   2. open the world with `join` and collect its whole history; the genesis must hash to the
//      invite's world and be written by the invite's signer (or the root of a co-owner's `&o=`
//      path, with the signer an owner in the verified history), its physics reproducible here, and
//      the log must verify (chain, ownership pass, receipts);
//   3. unless this key already belongs, check the invite against the history (`verifyInvite`),
//      submit a `member.join` signed by the device key, and wait for its receipt or refusal;
//   4. store the record and the verified log. The socket stays open: the world keeps syncing.
//
// Nothing is stored before the service sequenced the join; a refused join leaves the page as it was.

import { inviteRoot, readInviteLink } from "@shared/history/access";
import { admit, verifyInvite } from "@shared/history/admit";
import { readEvent } from "@shared/history/event";
import { emptyNow, foldEntries, openGenesis } from "@shared/history/fold";
import { verifyLog } from "@shared/history/log";
import { isOwner } from "@shared/history/owners";
import { inviteSigned, signJoinProof } from "@shared/history/sign";
import type { GenesisEvent, Invite, LogEntry, WorldNow } from "@shared/history/types";
import { checkPhysics, PHYSICS_SUPPORTED } from "@shared/physics";
import { err, ok, type Result } from "@shared/result";
import type { WorldJoined } from "@shared/worldApi";
import { type FromService, WORLD_PROTOCOL } from "@shared/worldProtocol";
import { emitStatus, type Host, loadLive, statusOf, verdictsOf } from "./live";
import { type BrowserSigner, signEventWith } from "./signer";
import { startSync } from "./sync";

const JOIN_MS = 15_000;
const COLLECT_MS = 30_000;
const NAME_MAX = 60;

function refusedJoin(
  message: string,
  hint = "Ask the world's owner for a new link.",
): Result<never> {
  return err("join-invalid", message, hint);
}

/** `opened`, then every entry 1..head, deduplicated by n (waiters registered before sending). */
async function collect(
  host: Host,
  url: string,
  world: string,
  join: { invite: Invite; proof: string },
): Promise<Result<{ entries: LogEntry[]; genesis: unknown }>> {
  const byN = new Map<number, LogEntry>();
  let target = Number.POSITIVE_INFINITY;
  const collecting = host.hub.waitFor(
    url,
    (frame) => {
      if (frame.t !== "entries" || frame.world !== world) return false;
      for (const entry of frame.entries) byN.set(entry.n, entry);
      let have = 0;
      for (const n of byN.keys()) if (n >= 1 && n <= target) have += 1;
      return have >= target;
    },
    COLLECT_MS,
  );
  const opened = host.hub.waitFor(
    url,
    (frame) => (frame.t === "opened" || frame.t === "refused") && frame.world === world,
    JOIN_MS,
  );
  const sent = host.hub.send(url, {
    t: "open",
    world,
    have: 0,
    chain: null,
    protocol: WORLD_PROTOCOL,
    physics: [...PHYSICS_SUPPORTED],
    join,
  });
  if (!sent.ok) return sent;
  const answer = await opened;
  if (answer === null) return err("service-timeout", "The world's service did not answer in time.");
  if (answer.t === "refused") return { ok: false, error: answer.error };
  if (answer.t !== "opened") return err("service-timeout", "The world's service did not open.");
  target = answer.head.n;
  if (byN.size < target) await collecting;
  const entries = [...byN.values()].filter((entry) => entry.n <= target).sort((a, b) => a.n - b.n);
  if (entries.length !== target || entries.some((entry, index) => entry.n !== index + 1)) {
    return err("service-timeout", "The world's history did not arrive whole.", "Try again.");
  }
  return ok({ entries, genesis: answer.genesis });
}

/** The fetched history, verified from the genesis to its head. */
function verified(
  world: string,
  by: string,
  fetched: { entries: LogEntry[]; genesis: unknown },
): Result<{ genesis: GenesisEvent; now: WorldNow }> {
  const genesis = openGenesis(fetched.genesis);
  if (!genesis.ok) return refusedJoin("The service sent a world that does not read.");
  if (genesis.value.id !== world) {
    return refusedJoin("The service's world is not the one this invite is for.");
  }
  const physics = checkPhysics(genesis.value.body.physicsVersion);
  if (!physics.ok) return physics;
  const check = verifyLog(world, fetched.entries);
  if (!check.ok) return refusedJoin(`The world's history does not verify: ${check.error.message}`);
  const now = foldEntries(emptyNow(genesis.value), verdictsOf(fetched.entries));
  if (genesis.value.author !== by && !isOwner(now, by)) {
    return refusedJoin("The service's world is not the one this invite is for.");
  }
  return ok({ genesis: genesis.value, now });
}

/** Signs and submits the `member.join`; resolves once it is sequenced or refused. */
async function becomeMember(
  host: Host,
  input: {
    url: string;
    signer: BrowserSigner;
    name: string;
    now: WorldNow;
    invite: Invite;
    proof: string;
  },
): Promise<Result<void>> {
  const { url, signer, now, invite, proof } = input;
  const at = host.nowIso();
  const event = await signEventWith(signer, {
    v: 1,
    world: now.world,
    kind: "member.join",
    author: signer.author,
    at,
    seen: now.head.n,
    body: { invite, name: input.name, proof },
  });
  const read = readEvent(event);
  if (!read.ok) return read;
  const admitted = admit(now, read.value, at);
  if (!admitted.ok) return admitted;
  const answer = host.hub.waitFor(
    url,
    (frame: FromService) =>
      (frame.t === "rejected" && frame.world === now.world && frame.id === event.id) ||
      (frame.t === "entries" &&
        frame.world === now.world &&
        frame.entries.some((entry) => entry.event.id === event.id)),
    JOIN_MS,
  );
  const sent = host.hub.send(url, { t: "submit", world: now.world, events: [event] });
  if (!sent.ok) return sent;
  const frame = await answer;
  if (frame === null) {
    return err("service-timeout", "The world's service did not answer the join in time.");
  }
  return frame.t === "rejected" ? { ok: false, error: frame.error } : ok(undefined);
}

export async function joinWorld(
  host: Host,
  link: string,
  name: string,
): Promise<Result<WorldJoined>> {
  const display = name.trim();
  if (display.length === 0 || display.length > NAME_MAX) {
    return err(
      "join-name",
      `A name holds 1 to ${NAME_MAX} characters.`,
      "Type the name friends know you by.",
    );
  }
  const parsed = readInviteLink(link);
  if (!parsed.ok) return parsed;
  const { invite } = parsed.value;
  if (!inviteSigned(invite)) {
    return err(
      "invite-sig-invalid",
      "This invite's signature does not verify.",
      "Ask the owner for a new link.",
    );
  }
  const signer = await host.signer();
  if (!signer.ok) return signer;
  // The one use of the link's secret; `parsed` goes out of scope with it.
  const proof = signJoinProof(parsed.value.secret, invite, signer.value.author);
  const url = invite.svc;
  const token = `join:${invite.world}`;
  host.hub.want(url, token);
  try {
    if (!(await host.hub.ready(url, JOIN_MS))) {
      return err(
        "service-unreachable",
        `Cannot reach ${url}.`,
        "Check the connection and try again.",
      );
    }
    const serviceKey = host.hub.serviceKey(url);
    if (serviceKey === null)
      return err("service-unreachable", "The service did not identify itself.");
    const join = { invite, proof };
    const fetched = await collect(host, url, invite.world, join);
    if (!fetched.ok) return fetched;
    const first = verified(invite.world, invite.by, fetched.value);
    if (!first.ok) return first;
    if (first.value.genesis.author !== inviteRoot(parsed.value)) {
      return refusedJoin("The invite's signer does not lead back to this world's maker.");
    }
    if (first.value.now.members[signer.value.author] === undefined) {
      const valid = verifyInvite(
        first.value.now,
        invite,
        proof,
        signer.value.author,
        host.nowIso(),
      );
      if (!valid.ok) return valid;
      const joined = await becomeMember(host, {
        url,
        signer: signer.value,
        name: display,
        now: first.value.now,
        invite,
        proof,
      });
      if (!joined.ok) return joined;
    }
    return await keepJoined(host, {
      url,
      serviceKey,
      name: display,
      first: first.value,
      entries: fetched.value.entries,
    });
  } finally {
    host.hub.unwant(url, token);
  }
}

/** Stores the record and the history collected so far, then syncs the rest (the join included). */
async function keepJoined(
  host: Host,
  input: {
    url: string;
    serviceKey: string;
    name: string;
    first: { genesis: GenesisEvent };
    entries: LogEntry[];
  },
): Promise<Result<WorldJoined>> {
  const { genesis } = input.first;
  const existing = await host.store.world(genesis.id);
  if (!existing.ok) return existing;
  const record = existing.value ?? {
    id: genesis.id,
    genesis,
    url: input.url,
    serviceKey: input.serviceKey,
    name: input.name,
    joinedAt: host.nowIso(),
    diverged: null,
    refused: [],
  };
  const stored = await host.serial(genesis.id, async () => {
    const put = await host.store.putWorld(record);
    if (!put.ok) return put;
    const log = await host.store.readLog(genesis.id);
    if (!log.ok) return log;
    const fresh = input.entries.filter((entry) => entry.n > log.value.length);
    if (log.value.length === 0 && fresh.length > 0) {
      const appended = await host.store.appendLog(genesis.id, fresh);
      if (!appended.ok) return appended;
    }
    const live = await loadLive(host, record);
    if (!live.ok) return live;
    host.worlds.set(genesis.id, live.value);
    return ok(live.value);
  });
  if (!stored.ok) return stored;
  const current = await host.store.setCurrent(genesis.id);
  if (!current.ok) return current;
  startSync(host, stored.value);
  await emitStatus(host, stored.value);
  const status = statusOf(stored.value, await host.signer());
  // The browser keeps no saves: a joined world is its own "instance".
  return ok({ worldId: genesis.id, instanceId: genesis.id, status });
}
