// What the browser proof keeps on the device (rev 6 phase 4, D7), all in one IndexedDB database:
//
//   meta     "device-keys" → the WebCrypto CryptoKeyPair (non-extractable private half);
//            "current" → the world last opened
//   worlds   one record per joined world: genesis, service URL and pinned key, the player's name
//            there, a divergence (never cleared silently), refused own events (Rule 2)
//   entries  the world's sequenced log, keyed [world, n]
//   outbox   own events not yet sequenced, one record per world (rewritten whole, like main's
//            outbox.jsonl, so order is kept)
//   blobs    packs by content hash, verified again on every read
//   cache    the LRU's view of the three droppable kinds (./lru): size and last use
//   places   where this player last stood in each world (`SavedPosition`, keyed by world): device
//            only, never sent anywhere but in presence while the world is online
//
// Storage risk (plan D7): if the browser evicts this origin, the device key and all of this go
// with it; the page then starts as a new device. Nothing here is worth more than that: the history
// lives on the service, and the proof keeps no personal progress beyond where the player stood.

import type { SavedPosition } from "@shared/cartridge";
import type { LogEntry, StoredEvent } from "@shared/history/types";
import { type AppError, err, ok, type Result } from "@shared/result";
import type { RefusedEvent } from "@shared/worldApi";
import { verifyBlob } from "./blobs";
import { attempt, committed, done, openDatabase } from "./idb";
import type { CacheItem } from "./lru";
import { newDeviceKeys } from "./signer";

const DB_NAME = "unmapped-browser";
/** 1: the first pass; 2 adds `places`. */
const DB_VERSION = 2;

export interface WorldRecord {
  id: string;
  genesis: StoredEvent;
  /** The invite's service URL. */
  url: string;
  /** The key the service proved when this device joined; a different one is another service. */
  serviceKey: string;
  /** This player's name in the world (the `member.join` name). */
  name: string;
  joinedAt: string;
  diverged: AppError | null;
  refused: RefusedEvent[];
}

interface EntryRow {
  world: string;
  n: number;
  entry: LogEntry;
}

interface OutboxRow {
  world: string;
  events: StoredEvent[];
}

const bytesOf = (value: unknown): number => JSON.stringify(value).length;

function isKeyPair(value: unknown): value is CryptoKeyPair {
  const pair = value as Partial<CryptoKeyPair> | null;
  return (
    typeof pair === "object" &&
    pair !== null &&
    pair.privateKey instanceof CryptoKey &&
    pair.publicKey instanceof CryptoKey
  );
}

/** A stored position read back as untrusted: finite numbers and a scene id, nothing else used. */
function isPosition(value: unknown): value is SavedPosition {
  const at = value as Partial<SavedPosition> | null;
  return (
    typeof at === "object" &&
    at !== null &&
    typeof at.sceneId === "string" &&
    [at.x, at.y, at.z, at.yaw].every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

export class BrowserStore {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(): Promise<Result<BrowserStore>> {
    const db = await openDatabase(DB_NAME, DB_VERSION, (database, from) => {
      if (from < 1) {
        database.createObjectStore("meta");
        database.createObjectStore("worlds", { keyPath: "id" });
        database.createObjectStore("entries", { keyPath: ["world", "n"] });
        database.createObjectStore("outbox", { keyPath: "world" });
        database.createObjectStore("blobs", { keyPath: "hash" });
        database.createObjectStore("cache", { keyPath: "id" });
      }
      if (from < 2) database.createObjectStore("places", { keyPath: "world" });
    });
    return db.ok ? ok(new BrowserStore(db.value)) : db;
  }

  private store(name: string, mode: IDBTransactionMode = "readonly"): IDBObjectStore {
    return this.db.transaction(name, mode).objectStore(name);
  }

  /**
   * This browser's device key: the stored pair, or a new one when none was ever stored. A stored
   * value that is not a key pair is an error, never overwritten (P3 D7: key errors never
   * regenerate — the old key may still be a member somewhere).
   */
  async deviceKeys(): Promise<Result<CryptoKeyPair>> {
    const stored = await attempt(() => done(this.store("meta").get("device-keys")));
    if (!stored.ok) return stored;
    if (stored.value !== undefined) {
      return isKeyPair(stored.value)
        ? ok(stored.value)
        : err(
            "identity-key-unreadable",
            "This browser's device key does not read.",
            "Clear this site's data to start as a new device.",
          );
    }
    const made = await newDeviceKeys();
    if (!made.ok) return made;
    const saved = await attempt(() =>
      done(this.store("meta", "readwrite").add(made.value, "device-keys")),
    );
    if (saved.ok) return made;
    // Two tabs racing: keep whichever pair landed first; any other failure is the error.
    const again = await attempt(() => done(this.store("meta").get("device-keys")));
    return again.ok && isKeyPair(again.value) ? ok(again.value) : saved;
  }

  async current(): Promise<Result<string | null>> {
    const read = await attempt(() => done(this.store("meta").get("current")));
    return read.ok ? ok(typeof read.value === "string" ? read.value : null) : read;
  }

  setCurrent(world: string): Promise<Result<void>> {
    return attempt(async () => {
      await done(this.store("meta", "readwrite").put(world, "current"));
    });
  }

  worlds(): Promise<Result<WorldRecord[]>> {
    return attempt(() => done(this.store("worlds").getAll() as IDBRequest<WorldRecord[]>));
  }

  async world(id: string): Promise<Result<WorldRecord | null>> {
    const read = await attempt(() => done(this.store("worlds").get(id)));
    return read.ok ? ok((read.value as WorldRecord | undefined) ?? null) : read;
  }

  putWorld(record: WorldRecord): Promise<Result<void>> {
    return attempt(async () => {
      await done(this.store("worlds", "readwrite").put(record));
    });
  }

  /** The world's sequenced entries, in order of n. */
  async readLog(world: string): Promise<Result<LogEntry[]>> {
    const range = IDBKeyRange.bound([world, 0], [world, Number.MAX_SAFE_INTEGER]);
    const rows = await attempt(
      () => done(this.store("entries").getAll(range)) as Promise<EntryRow[]>,
    );
    return rows.ok ? ok(rows.value.map((row) => row.entry)) : rows;
  }

  /** Appends verified entries and grows the log's cache record, in one transaction. */
  appendLog(world: string, entries: readonly LogEntry[]): Promise<Result<void>> {
    return attempt(async () => {
      const tx = this.db.transaction(["entries", "cache"], "readwrite");
      const rows = tx.objectStore("entries");
      for (const entry of entries) rows.put({ world, n: entry.n, entry } satisfies EntryRow);
      const cache = tx.objectStore("cache");
      const id = `log:${world}`;
      const item = (await done(cache.get(id))) as CacheItem | undefined;
      const added = entries.reduce((sum, entry) => sum + bytesOf(entry), 0);
      cache.put({
        id,
        kind: "log",
        world,
        hash: null,
        bytes: (item?.bytes ?? 0) + added,
        usedAt: Date.now(),
      } satisfies CacheItem);
      await committed(tx);
    });
  }

  async readOutbox(world: string): Promise<Result<StoredEvent[]>> {
    const read = await attempt(() => done(this.store("outbox").get(world)));
    return read.ok ? ok((read.value as OutboxRow | undefined)?.events ?? []) : read;
  }

  /** Replaces the world's outbox whole (and its cache record); an empty one is removed. */
  writeOutbox(world: string, events: readonly StoredEvent[]): Promise<Result<void>> {
    return attempt(async () => {
      const tx = this.db.transaction(["outbox", "cache"], "readwrite");
      const id = `outbox:${world}`;
      if (events.length === 0) {
        tx.objectStore("outbox").delete(world);
        tx.objectStore("cache").delete(id);
      } else {
        tx.objectStore("outbox").put({ world, events: [...events] } satisfies OutboxRow);
        tx.objectStore("cache").put({
          id,
          kind: "outbox",
          world,
          hash: null,
          bytes: bytesOf(events),
          usedAt: Date.now(),
        } satisfies CacheItem);
      }
      await committed(tx);
    });
  }

  /** A stored blob, re-verified against its hash; null when absent. */
  async blob(hash: string): Promise<Result<Uint8Array | null>> {
    const read = await attempt(() => done(this.store("blobs").get(hash)));
    if (!read.ok) return read;
    const row = read.value as { hash: string; bytes: ArrayBuffer } | undefined;
    if (row === undefined) return ok(null);
    const checked = verifyBlob(new Uint8Array(row.bytes), hash);
    if (!checked.ok) return checked;
    await this.touch(`blob:${hash}`);
    return checked;
  }

  putBlob(hash: string, bytes: Uint8Array): Promise<Result<void>> {
    return attempt(async () => {
      const tx = this.db.transaction(["blobs", "cache"], "readwrite");
      const copy = bytes.slice().buffer;
      tx.objectStore("blobs").put({ hash, bytes: copy });
      tx.objectStore("cache").put({
        id: `blob:${hash}`,
        kind: "blob",
        world: null,
        hash,
        bytes: bytes.length,
        usedAt: Date.now(),
      } satisfies CacheItem);
      await committed(tx);
    });
  }

  /** Where this player last stood in `world` (a well-formed sample), or null. */
  async place(world: string): Promise<Result<SavedPosition | null>> {
    const read = await attempt(() => done(this.store("places").get(world)));
    if (!read.ok) return read;
    const row = read.value as { position?: unknown } | undefined;
    return ok(isPosition(row?.position) ? row.position : null);
  }

  keepPlace(world: string, position: SavedPosition): Promise<Result<void>> {
    return attempt(async () => {
      await done(this.store("places", "readwrite").put({ world, position }));
    });
  }

  cacheItems(): Promise<Result<CacheItem[]>> {
    return attempt(() => done(this.store("cache").getAll() as IDBRequest<CacheItem[]>));
  }

  /** Marks a cache item used now (the LRU drops the least recently used first). */
  touch(id: string): Promise<Result<void>> {
    return attempt(async () => {
      const tx = this.db.transaction("cache", "readwrite");
      const cache = tx.objectStore("cache");
      const item = (await done(cache.get(id))) as CacheItem | undefined;
      if (item !== undefined) cache.put({ ...item, usedAt: Date.now() });
      await committed(tx);
    });
  }

  /** Drops evicted blobs and logs (never an outbox: the LRU plan never names one). */
  evict(items: readonly CacheItem[]): Promise<Result<void>> {
    return attempt(async () => {
      const tx = this.db.transaction(["blobs", "entries", "cache"], "readwrite");
      for (const item of items) {
        if (item.kind === "blob" && item.hash !== null) tx.objectStore("blobs").delete(item.hash);
        else if (item.kind === "log" && item.world !== null) {
          const range = IDBKeyRange.bound([item.world, 0], [item.world, Number.MAX_SAFE_INTEGER]);
          tx.objectStore("entries").delete(range);
        } else continue;
        tx.objectStore("cache").delete(item.id);
      }
      await committed(tx);
    });
  }
}
