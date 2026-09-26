// Packs and the storage budget on the page (rev 6 phase 4, D7). The world on screen gets its
// genesis pack (the latest `pack` event: the cartridge friends fetch, P3 D10) fetched by hash,
// verified, and kept in IndexedDB so the land can be drawn offline. Before anything is kept, the
// LRU (./lru) makes room within the share of `navigator.storage.estimate()` the proof allows; it
// never drops an outbox, the current world's log or its pack, and when nothing droppable makes
// room the new blob is refused (`browser-storage-full`) instead.

import type { WorldNow } from "@shared/history/types";
import { err, ok, type Result } from "@shared/result";
import { fetchBlob } from "./blobs";
import { emitStatus, type Host, type LiveWorld } from "./live";
import { type CacheItem, planEviction, storageBudget } from "./lru";

async function estimate(): Promise<{ quota?: number } | null> {
  try {
    return (await navigator.storage?.estimate?.()) ?? null;
  } catch {
    return null;
  }
}

/** The world the LRU must keep whole: the one on screen, and its pack. */
async function keepOf(host: Host): Promise<{ current: string | null; pack: string | null }> {
  const current = await host.store.current();
  const id = current.ok ? current.value : null;
  const now: WorldNow | undefined = id === null ? undefined : host.worlds.get(id)?.now;
  return { current: id, pack: now?.pack?.pack ?? null };
}

/**
 * Makes room for `incoming` more bytes: evicts what the plan names (dropping an evicted world's
 * log from memory too, so its next read syncs from the start), or refuses.
 */
export async function makeRoom(host: Host, incoming: number): Promise<Result<void>> {
  const items = await host.store.cacheItems();
  if (!items.ok) return items;
  const plan = planEviction(
    items.value,
    storageBudget(await estimate()),
    incoming,
    await keepOf(host),
  );
  if (!plan.fits) {
    return err(
      "browser-storage-full",
      "This browser's share of storage is full of things it must keep.",
      "Send what waits in the outbox (go online), or clear this site's data.",
    );
  }
  if (plan.evict.length === 0) return ok(undefined);
  const dropped = await host.store.evict(plan.evict);
  if (!dropped.ok) return dropped;
  for (const item of plan.evict) forget(host, item);
  return ok(undefined);
}

function forget(host: Host, item: CacheItem): void {
  if (item.kind === "log" && item.world !== null) host.worlds.delete(item.world);
}

/** Fetches in flight by pack hash: the open handshake and the land may ask at the same moment. */
const fetching = new Map<string, Promise<Result<Uint8Array>>>();

/**
 * The world's genesis pack from its service, verified by hash and kept (within the LRU's budget).
 * Only one fetch per pack runs at a time; the bytes are what `store.blob` will read back.
 */
export function fetchPack(host: Host, world: LiveWorld, hash: string): Promise<Result<Uint8Array>> {
  const running = fetching.get(hash);
  if (running !== undefined) return running;
  const work = (async (): Promise<Result<Uint8Array>> => {
    const signer = await host.signer();
    if (!signer.ok) return signer;
    const fetched = await fetchBlob(world.record.url, world.record.id, hash, signer.value);
    if (!fetched.ok) return fetched;
    const kept = await keep(host, hash, fetched.value);
    return kept.ok ? fetched : kept;
  })().finally(() => fetching.delete(hash));
  fetching.set(hash, work);
  return work;
}

/**
 * Fetches and keeps the current world's genesis pack when it has one and this device lacks it.
 * A failure is advisory: the list still works, and the status carries the error (Rule 2).
 */
export async function ensurePack(host: Host, world: LiveWorld): Promise<void> {
  const pack = world.now.pack;
  if (pack === null) return;
  const have = await host.store.blob(pack.pack);
  if (have.ok && have.value !== null) return;
  const kept = await fetchPack(host, world, pack.pack);
  if (!kept.ok) {
    world.error = kept.error;
    await emitStatus(host, world);
  }
}

async function keep(host: Host, hash: string, bytes: Uint8Array): Promise<Result<void>> {
  const room = await makeRoom(host, bytes.length);
  return room.ok ? host.store.putBlob(hash, bytes) : room;
}
