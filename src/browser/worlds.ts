// `window.seed.world` in the browser proof (rev 6 phase 4, D7): the same `WorldApi` the desktop's
// main answers, run in the page over the browser's WebSocket and IndexedDB. The proof answers
// join, read, append, badges, close, dismissRefused and presence, plus the four listeners; every
// other call — owner actions, AI content, saves, and any a later build adds — answers
// `not-on-this-client` (./unavailable). Beside it, the page hands the mobile shell its
// `PhoneDevice` (./land): the world's land from its genesis pack, and where the player stood.
//
// Appending runs every check main runs before it signs (main/histories/{commit,drafts}.ts): not a
// key the service removed (`access-removed`, kept in the world's record), `seen` not beyond the
// head, the envelope and body (`readEvent` with a placeholder signature), the DSL body
// (`validateEventBody`), then `admit` over the fold with the outbox on top. Only then does the
// WebCrypto key sign, and the event waits in the IndexedDB outbox until the service sequences it.

import { entryVerdict } from "@dsl/history/verdict";
import { validateEventBody } from "@dsl/index";
import type { PhoneDevice } from "@renderer/mobile/phoneDevice";
import { admit } from "@shared/history/admit";
import { readEvent } from "@shared/history/event";
import { FOLD_VERSION } from "@shared/history/fold";
import { eventIdOf } from "@shared/history/sign";
import type { HistoryEvent, UnsignedEvent } from "@shared/history/types";
import { err, ok, type Result } from "@shared/result";
import {
  DRAFT_KINDS,
  type WorldApi,
  type WorldAppended,
  type WorldBadge,
  type WorldDraft,
  type WorldEntriesEvent,
  type WorldPresenceEvent,
  type WorldRead,
  type WorldStatus,
  type WorldStreamEvent,
} from "@shared/worldApi";
import { presenceSchema } from "@shared/worldProtocol";
import { joinWorld } from "./join";
import { phoneDevice } from "./land";
import {
  emitEntries,
  emitStatus,
  type Host,
  type LiveWorld,
  loadLive,
  pendingNow,
  removalOf,
  statusOf,
} from "./live";
import { makeRoom } from "./packs";
import { type BrowserSigner, signEventWith, signerOf } from "./signer";
import { SocketHub } from "./socket";
import type { BrowserStore } from "./store";
import { onDown, onFrame, onReady, startSync, stopSync, submitOutbox } from "./sync";
import { partly } from "./unavailable";

/** Stands in for the signature while the shape is checked: the real one comes after admission. */
const PLACEHOLDER_SIG = "A".repeat(86);

function listeners<T>() {
  const set = new Set<(value: T) => void>();
  return {
    add(listener: (value: T) => void): () => void {
      set.add(listener);
      return () => set.delete(listener);
    },
    emit(value: T): void {
      for (const listener of set) listener(value);
    },
  };
}

/** The page's `window.seed.world` and the shell's device, over one store, key and socket hub. */
export function browserClient(store: BrowserStore): { world: WorldApi; device: PhoneDevice } {
  const entries = listeners<WorldEntriesEvent>();
  const statuses = listeners<WorldStatus>();
  const presences = listeners<WorldPresenceEvent>();
  const streams = listeners<WorldStreamEvent>();
  const queues = new Map<string, Promise<unknown>>();
  let signer: Promise<Result<BrowserSigner>> | null = null;

  const hub = new SocketHub(
    {
      signer: () => host.signer(),
      pinnedKey: (url) =>
        [...host.worlds.values()].find((world) => world.record.url === url)?.record.serviceKey ??
        null,
    },
    {
      ready: (url) => onReady(host, url),
      frame: (url, frame) => void onFrame(host, url, frame),
      down: (url, error, fatal) => onDown(host, url, error, fatal),
    },
  );
  const host: Host = {
    store,
    hub,
    signer() {
      signer ??= store.deviceKeys().then((pair) => (pair.ok ? signerOf(pair.value) : pair));
      return signer;
    },
    worlds: new Map(),
    serial<T>(world: string, body: () => Promise<T>): Promise<T> {
      const previous = queues.get(world) ?? Promise.resolve();
      const next = previous.then(body, body);
      queues.set(
        world,
        next.catch(() => undefined),
      );
      return next;
    },
    emitEntries: entries.emit,
    emitStatus: statuses.emit,
    emitPresence: presences.emit,
    emitStream: streams.emit,
    nowIso: () => new Date().toISOString(),
  };

  /** The world held in memory, loading it (and syncing it) on first use. */
  async function live(worldId: string): Promise<Result<LiveWorld>> {
    const held = host.worlds.get(worldId);
    if (held !== undefined) return ok(held);
    const record = await store.world(worldId);
    if (!record.ok) return record;
    if (record.value === null) {
      return err(
        "world-unknown",
        "This browser has not joined that world.",
        "Open its invite link.",
      );
    }
    const loaded = await loadLive(host, record.value);
    if (!loaded.ok) return loaded;
    host.worlds.set(worldId, loaded.value);
    startSync(host, loaded.value);
    return loaded;
  }

  async function read(worldId: string): Promise<Result<WorldRead>> {
    return host.serial(worldId, async () => {
      const world = await live(worldId);
      if (!world.ok) return world;
      const current = await store.setCurrent(worldId);
      if (!current.ok) return current;
      await store.touch(`log:${worldId}`);
      const { now, record, outbox } = world.value;
      return ok({
        world: worldId,
        genesis: record.genesis,
        snapshot: { foldVersion: FOLD_VERSION, head: now.head, now },
        entries: [],
        pending: outbox,
        refused: record.refused,
        status: statusOf(world.value, await host.signer()),
      });
    });
  }

  async function prepare(world: LiveWorld, draft: WorldDraft, key: BrowserSigner) {
    if (!(DRAFT_KINDS as readonly string[]).includes(draft.kind)) {
      return err("draft-kind", `A ${draft.kind} is not written from a draft.`);
    }
    if (draft.seen > world.now.head.n) {
      return err(
        "draft-seen-ahead",
        `The draft claims to have seen entry ${draft.seen}; this device has ${world.now.head.n}.`,
        "Reload and try again.",
      );
    }
    const at = host.nowIso();
    const unsigned = {
      v: 1,
      world: world.record.id,
      kind: draft.kind,
      author: key.author,
      at,
      seen: draft.seen,
      body: draft.body,
    } as UnsignedEvent;
    const provisional = readEvent({ ...unsigned, id: eventIdOf(unsigned), sig: PLACEHOLDER_SIG });
    if (!provisional.ok) return provisional;
    const body = validateEventBody(provisional.value);
    if (!body.ok) return body;
    const admitted = admit(pendingNow(world, at), provisional.value, at);
    if (!admitted.ok) return admitted;
    const signed = (await signEventWith(key, unsigned)) as HistoryEvent;
    const back = readEvent(signed);
    return back.ok && back.value.id === provisional.value.id
      ? ok(back.value)
      : err("draft-sign-failed", "The signed event does not read back as the checked draft.");
  }

  async function append(worldId: string, draft: WorldDraft): Promise<Result<WorldAppended>> {
    return host.serial(worldId, async () => {
      const world = await live(worldId);
      if (!world.ok) return world;
      if (world.value.record.diverged !== null)
        return { ok: false, error: world.value.record.diverged };
      // D8: a removed key writes nothing. Its copy ends before its own `member.remove`, so only
      // the service's refusal (kept in the record) says so; without this the page would sign and
      // queue notes nobody will ever sequence.
      const removed = removalOf(world.value);
      if (removed !== null) {
        return err("access-removed", "The owner removed this key from the world.", removed.hint);
      }
      const key = await host.signer();
      if (!key.ok) return key;
      const event = await prepare(world.value, draft, key.value);
      if (!event.ok) return event;
      const outbox = [
        ...world.value.outbox,
        { event: event.value, verdict: entryVerdict(event.value) },
      ];
      const room = await makeRoom(host, JSON.stringify(event.value).length);
      if (!room.ok) return room;
      const kept = await store.writeOutbox(
        worldId,
        outbox.map((pending) => pending.event),
      );
      if (!kept.ok) return kept;
      world.value.outbox = outbox;
      emitEntries(host, world.value, []);
      await emitStatus(host, world.value);
      submitOutbox(host, world.value);
      return ok({ id: event.value.id, n: null });
    });
  }

  async function badges(): Promise<Result<WorldBadge[]>> {
    const records = await store.worlds();
    if (!records.ok) return records;
    return ok(
      records.value
        .sort((a, b) => (a.joinedAt < b.joinedAt ? 1 : -1))
        .map((record) => {
          const author = typeof record.genesis.author === "string" ? record.genesis.author : "";
          const names = host.worlds.get(record.id)?.now.names;
          return {
            instanceId: record.id,
            worldId: record.id,
            kind: "joined" as const,
            url: record.url,
            owner: author,
            ownerName: names?.[author] ?? null,
          };
        }),
    );
  }

  async function dismissRefused(worldId: string, id: string): Promise<Result<void>> {
    return host.serial(worldId, async () => {
      const world = await live(worldId);
      if (!world.ok) return world;
      const refused = world.value.record.refused.filter((one) => one.event.id !== id);
      world.value.record = { ...world.value.record, refused };
      const put = await store.putWorld(world.value.record);
      if (put.ok) await emitStatus(host, world.value);
      return put;
    });
  }

  const world = partly<WorldApi>({
    read,
    close: async (worldId) => {
      const world = host.worlds.get(worldId);
      if (world !== undefined) stopSync(host, world);
      return ok(undefined);
    },
    append,
    sendPresence: async (worldId, presence) => {
      const world = host.worlds.get(worldId);
      if (world === undefined || world.link !== "online") {
        return err("world-offline", "The world's service is not connected.");
      }
      if (presence !== null && !presenceSchema.safeParse(presence).success) {
        return err("presence-invalid", "That presence does not read.");
      }
      return host.hub.send(world.record.url, { t: "presence", world: worldId, p: presence });
    },
    dismissRefused,
    join: (link, name) => joinWorld(host, link, name),
    badges,
    onEntries: entries.add,
    onStatus: statuses.add,
    onPresence: presences.add,
    onStream: streams.add,
  });
  return {
    world,
    device: phoneDevice(host, (worldId) => host.serial(worldId, () => live(worldId))),
  };
}
