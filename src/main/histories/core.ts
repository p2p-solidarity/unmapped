// What every part of the world host shares (rev 6 phase 3, D11): the directories, the injected DSL
// and device key, the loaded worlds (one `LoadedWorld` each, changed only under that world's
// lock), each world's sync state, the socket hub, and the events main sends the renderer. The
// flows themselves live beside it: ./ensure, ./commit, ./syncWorld, ./attach, ./join, ./host.

import { join } from "node:path";
import { roleOf } from "@shared/history/access";
import { newerCount } from "@shared/history/fold";
import type { VerdictEntry } from "@shared/history/types";
import { type AppError, err, ok, type Result } from "@shared/result";
import {
  type LinkState,
  WORLD_IPC,
  type WorldEntriesEvent,
  type WorldRole,
  type WorldStatus,
} from "@shared/worldApi";
import { BLOBS_DIR } from "../blobs/store";
import type { DeviceKey } from "../identity/deviceKey";
import type { WorkDirs } from "../works/store";
import type { Clock } from "./clock";
import type { WorldDsl } from "./dslSeam";
import { locked } from "./fsx";
import { isLocalOnly, type LoadedWorld, loadWorld, type VerdictOf } from "./loaded";
import { readRefused } from "./logStore";
import { historiesDir, isWorldId } from "./paths";
import type { SourceDirs } from "./sources";
import type { SyncHub } from "./sync";

export interface HostDeps {
  userData: string;
  cartridgesDir: string;
  instancesDir: string;
  works: WorkDirs;
  dsl: WorldDsl;
  key(): Promise<Result<DeviceKey>>;
  clock: Clock;
  broadcast(channel: string, payload: unknown): void;
  /** Installs the shipped revisions (main/game/base.ts), for a joiner of a built-in world. */
  ensureBaseGame(): Promise<Result<unknown>>;
  WebSocketImpl?: typeof WebSocket;
  fetchImpl?: typeof fetch;
}

export interface SyncInfo {
  url: string;
  link: LinkState;
  error: AppError | null;
}

export class HostCore {
  readonly histories: string;
  readonly blobsDir: string;
  readonly sources: SourceDirs;
  readonly worlds = new Map<string, LoadedWorld>();
  readonly sync = new Map<string, SyncInfo>();
  /** Set right after construction by `WorldHost` (its events call back into this core). */
  hub!: SyncHub;
  readonly verdictOf: VerdictOf;

  constructor(readonly deps: HostDeps) {
    this.histories = historiesDir(deps.userData);
    this.blobsDir = join(deps.userData, BLOBS_DIR);
    this.sources = {
      cartridgesDir: deps.cartridgesDir,
      instancesDir: deps.instancesDir,
      blobsDir: this.blobsDir,
      works: deps.works,
    };
    this.verdictOf = (event) => deps.dsl.entryVerdict(event);
  }

  nowIso(): string {
    return this.deps.clock().toISOString();
  }

  /** Runs `run` under the world's lock with the world loaded (from cache, or from disk once). */
  withWorld<T>(
    worldId: string,
    run: (world: LoadedWorld) => Promise<Result<T>>,
  ): Promise<Result<T>> {
    if (!isWorldId(worldId)) return Promise.resolve(err("world-id-invalid", "Not a world id."));
    return locked(`world:${worldId}`, async () => {
      const world = await this.load(worldId);
      return world.ok ? run(world.value) : world;
    });
  }

  /** Call only under the world's lock. */
  async load(worldId: string): Promise<Result<LoadedWorld>> {
    const cached = this.worlds.get(worldId);
    if (cached !== undefined) return ok(cached);
    const loaded = await loadWorld(this.histories, worldId, this.verdictOf);
    if (loaded.ok) this.worlds.set(worldId, loaded.value);
    return loaded;
  }

  /** Drops the cached copy (the files changed underneath: attach, adoption). Under the lock. */
  forget(worldId: string): void {
    this.worlds.delete(worldId);
  }

  linkState(world: LoadedWorld): SyncInfo {
    if (isLocalOnly(world)) return { url: "", link: "local", error: null };
    const url = world.link?.url ?? world.now.sequencer?.url ?? "";
    if (world.link?.diverged != null) {
      return { url, link: "diverged", error: world.link.diverged };
    }
    return this.sync.get(world.id) ?? { url, link: "offline", error: null };
  }

  async status(world: LoadedWorld, key: Result<DeviceKey> | null = null): Promise<WorldStatus> {
    const device = key ?? (await this.deps.key());
    const role: WorldRole = device.ok ? roleOf(world.now, device.value.author) : "visitor";
    const sync = this.linkState(world);
    const refused = await readRefused(world.dir);
    const keyError = device.ok ? null : device.error;
    const local = sync.link === "local";
    const writes =
      device.ok &&
      sync.link !== "diverged" &&
      role !== "removed" &&
      (local
        ? role === "owner"
        : role === "owner" || role === "member" || world.now.access === "public");
    return {
      world: world.id,
      link: sync.link,
      url: sync.url === "" ? null : sync.url,
      role,
      writable: writes,
      head: world.now.head,
      pending: world.outbox.length,
      refused: refused.ok ? refused.value.active.length : 0,
      ignored: world.now.ignored.length,
      newer: newerCount(world.now),
      error: sync.error ?? keyError ?? (refused.ok ? null : refused.error),
    };
  }

  async emitStatus(world: LoadedWorld): Promise<void> {
    this.deps.broadcast(WORLD_IPC.status, await this.status(world));
  }

  emitEntries(world: LoadedWorld, entries: VerdictEntry[], reset = false): void {
    const event: WorldEntriesEvent = {
      world: world.id,
      entries,
      pending: world.outbox,
      head: world.now.head,
      reset,
    };
    this.deps.broadcast(WORLD_IPC.entries, event);
  }

  setSync(worldId: string, info: SyncInfo): void {
    this.sync.set(worldId, info);
  }
}
