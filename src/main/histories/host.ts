// The world host (rev 6 phase 3, D11): everything `window.seed.world.*` does, as one object main
// keeps for its lifetime. It owns the loaded histories and the service sockets; the IPC layer
// (./ipc) only validates payloads and calls it. On quit it writes the day's walk the land had not
// written yet as a `visit` (D13: the land writes it when Play goes, and a quit from Play never gets
// there), flushes outboxes for up to 2 s, writes snapshots and closes the sockets.

import { randomBytes } from "node:crypto";
import type { ChunkCoord } from "@shared/chunks";
import { inviteLink } from "@shared/history/access";
import { base32, DAY_MS } from "@shared/history/ids";
import { isOwner, OWNER_PATH_MAX, ownerPath } from "@shared/history/owners";
import { authorKeyFor, newSecretKey } from "@shared/history/sign";
import type { AccessPolicy } from "@shared/history/types";
import { err, ok, type Result } from "@shared/result";
import type {
  ClaimAnswer,
  StreamFrame,
  WorldAppended,
  WorldDraft,
  WorldEnsured,
  WorldInvite,
  WorldJoined,
  WorldRead,
  WorldStatus,
} from "@shared/worldApi";
import type { ClaimTarget, Presence } from "@shared/worldProtocol";
import { attachWorld } from "./attach";
import { appendDraft } from "./commit";
import { HostCore, type HostDeps } from "./core";
import { ensureWorld } from "./ensure";
import { joinWorld } from "./join";
import { isLocalOnly, type LoadedWorld, snapshotWorld } from "./loaded";
import { appendDismissed, readRefused } from "./logStore";
import { isWorldId } from "./paths";
import { SyncHub } from "./sync";
import { claimOnline, onDown, onFrame, onReady, startSync, stopSync, submit } from "./syncWorld";

/** How long quitting waits for the outboxes to be sequenced (D11). */
export const FLUSH_MS = 2_000;

export class WorldHost {
  readonly core: HostCore;
  /** Per world: the chunks walked today that no `visit` holds yet, as the land last reported. */
  private readonly walks = new Map<string, ChunkCoord[]>();

  constructor(deps: HostDeps) {
    const core = new HostCore(deps);
    core.hub = new SyncHub(
      {
        key: deps.key,
        pinnedKey: (url) => this.pinnedKey(url),
        ...(deps.WebSocketImpl === undefined ? {} : { WebSocketImpl: deps.WebSocketImpl }),
      },
      {
        ready: (url) => onReady(core, url),
        frame: (url, frame) => void onFrame(core, url, frame),
        down: (url, error, fatal) => onDown(core, url, error, fatal),
      },
    );
    this.core = core;
  }

  /** The service key a URL was attached or joined with (the first loaded world's). */
  private pinnedKey(url: string): string | null {
    for (const world of this.core.worlds.values()) {
      if (world.link?.url === url) return world.link.key;
    }
    return null;
  }

  ensure(instanceId: string, name: string): Promise<Result<WorldEnsured>> {
    return ensureWorld(this.core, instanceId, name);
  }

  read(worldId: string): Promise<Result<WorldRead>> {
    const core = this.core;
    return core.withWorld(worldId, async (world) => {
      if (!isLocalOnly(world)) startSync(core, world);
      const refused = await readRefused(world.dir);
      return ok({
        world: world.id,
        genesis: world.genesis,
        snapshot: world.base,
        entries: world.tail,
        pending: world.outbox,
        refused: refused.ok ? refused.value.active : [],
        status: await core.status(world),
      });
    });
  }

  close(worldId: string): Promise<Result<void>> {
    const core = this.core;
    return core.withWorld(worldId, async (world) => {
      await snapshotWorld(world);
      stopSync(core, world);
      return ok(undefined);
    });
  }

  append(worldId: string, draft: WorldDraft): Promise<Result<WorldAppended>> {
    // The land wrote its visit (or tried: a refused one would be refused again on quit).
    if (draft.kind === "visit") this.walks.delete(worldId);
    return appendDraft(this.core, worldId, draft);
  }

  /** The land's walk not yet written as a visit; an empty list forgets it. */
  walked(worldId: string, chunks: ChunkCoord[]): Promise<Result<void>> {
    if (!isWorldId(worldId)) return Promise.resolve(err("world-id-invalid", "Not a world id."));
    if (chunks.length === 0) this.walks.delete(worldId);
    else this.walks.set(worldId, chunks);
    return Promise.resolve(ok(undefined));
  }

  /** On quit: the walks the land did not write become each world's visit (the fold keeps one a day). */
  private async writeWalks(): Promise<void> {
    const walks = [...this.walks];
    this.walks.clear();
    for (const [worldId, chunks] of walks) {
      const written = await appendDraft(this.core, worldId, (world) => ({
        kind: "visit",
        body: { chunks },
        seen: world.now.head.n,
      }));
      const tag = `[world] ${worldId.slice(0, 12)}…`;
      if (written.ok) console.log(`${tag} visit of ${chunks.length} chunks written on quit`);
      else if (written.error.code !== "visit-today") {
        console.warn(`${tag} visit not written on quit: ${written.error.code}`);
      }
    }
  }

  setAccess(worldId: string, policy: AccessPolicy): Promise<Result<WorldAppended>> {
    return appendDraft(this.core, worldId, (world) => ({
      kind: "access",
      body: { policy },
      seen: world.now.head.n,
    }));
  }

  hide(worldId: string, id: string, hidden: boolean): Promise<Result<WorldAppended>> {
    return appendDraft(this.core, worldId, (world) => ({
      kind: "hide",
      body: { id, hidden },
      seen: world.now.head.n,
    }));
  }

  /** The loaded world, without holding its lock while a claim waits on the network. */
  private async world(worldId: string): Promise<Result<LoadedWorld>> {
    return this.core.withWorld(worldId, async (world) => ok(world));
  }

  async claim(worldId: string, target: ClaimTarget): Promise<Result<ClaimAnswer>> {
    const world = await this.world(worldId);
    if (!world.ok) return world;
    const frame = await claimOnline(this.core, world.value, { t: "claim", target });
    if (!frame.ok) return frame;
    if (frame.value === null) return err("claim-offline", "No answer from the world's service.");
    const { status, sid, by, n, text } = frame.value;
    return ok({
      status,
      ...(sid === undefined ? {} : { sid }),
      ...(by === undefined ? {} : { by }),
      ...(n === undefined ? {} : { n }),
      ...(text === undefined ? {} : { text }),
    });
  }

  async release(worldId: string, target: ClaimTarget): Promise<Result<void>> {
    const world = await this.world(worldId);
    if (!world.ok) return world;
    const sent = await claimOnline(this.core, world.value, { t: "release", target });
    return sent.ok ? ok(undefined) : sent;
  }

  private async sendTo(
    worldId: string,
    message: (world: string) => Parameters<SyncHub["send"]>[1],
  ): Promise<Result<void>> {
    const world = await this.world(worldId);
    if (!world.ok) return world;
    const url = world.value.link?.url;
    if (url === undefined || this.core.sync.get(worldId)?.link !== "online") {
      return err("claim-offline", "The world's service is not connected.");
    }
    return this.core.hub.send(url, message(worldId));
  }

  sendStream(worldId: string, frame: StreamFrame): Promise<Result<void>> {
    return this.sendTo(worldId, (world) => ({ t: "stream", world, ...frame }));
  }

  sendPresence(worldId: string, p: Presence | null): Promise<Result<void>> {
    return this.sendTo(worldId, (world) => ({ t: "presence", world, p }));
  }

  attach(worldId: string, url: string): Promise<Result<WorldStatus>> {
    return attachWorld(this.core, worldId, url);
  }

  async invite(
    worldId: string,
    options: { uses: number; days: number },
  ): Promise<Result<WorldInvite>> {
    const key = await this.core.deps.key();
    if (!key.ok) return key;
    const world = await this.world(worldId);
    if (!world.ok) return world;
    // Any owner invites (phase 4, D5); a co-owner's link carries the path back to the maker (`&o=`).
    const path = ownerPath(world.value.now, key.value.author);
    if (path === null) {
      return isOwner(world.value.now, key.value.author)
        ? err(
            "invite-owner-path-long",
            `This device became a co-owner more than ${OWNER_PATH_MAX} steps from the world's maker.`,
            "Ask an owner closer to the maker to send the invite.",
          )
        : err(
            "access-owner-only",
            "Only the world's owners invite.",
            "Do it from the device that made the world, or a co-owner's.",
          );
    }
    const svc = world.value.link?.url;
    if (svc === undefined) {
      return err(
        "invite-not-attached",
        "This world is not shared yet.",
        "Attach it to a world service first.",
      );
    }
    const secret = newSecretKey();
    const exp = new Date(this.core.deps.clock().getTime() + options.days * DAY_MS).toISOString();
    const invite = key.value.signInvite({
      v: 1,
      world: worldId,
      svc,
      by: key.value.author,
      key: authorKeyFor(secret),
      nonce: base32(new Uint8Array(randomBytes(20))),
      exp,
      uses: options.uses,
    });
    return ok({ link: inviteLink(invite, secret, path), exp, uses: options.uses });
  }

  dismissRefused(worldId: string, id: string): Promise<Result<void>> {
    const core = this.core;
    return core.withWorld(worldId, async (world) => {
      await appendDismissed(world.dir, id, core.nowIso());
      await core.emitStatus(world);
      return ok(undefined);
    });
  }

  join(link: string, name: string, instanceId?: string): Promise<Result<WorldJoined>> {
    return joinWorld(this.core, link, name, instanceId);
  }

  /**
   * On quit: write the walks, submit what waits, give it up to `ms` to be sequenced, snapshot,
   * close sockets.
   */
  async flush(ms = FLUSH_MS): Promise<void> {
    await this.writeWalks();
    const worlds = [...this.core.worlds.values()];
    for (const world of worlds) if (world.outbox.length > 0) submit(this.core, world);
    const deadline = Date.now() + ms;
    const waiting = () =>
      worlds.some(
        (world) => world.outbox.length > 0 && this.core.sync.get(world.id)?.link === "online",
      );
    while (waiting() && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 50));
    for (const world of worlds) await snapshotWorld(world).catch(() => undefined);
    this.core.hub.closeAll();
  }
}
