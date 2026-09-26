// What the browser proof may drop when its storage share runs out (rev 6 phase 4, D7). The phone
// keeps three kinds of things in IndexedDB, each with its size and when it was last used:
//
//   blob    a pack fetched by hash — refetchable from the world's service;
//   log     a world's sequenced entries — re-syncable from its service;
//   outbox  own events not yet sequenced — held nowhere else, so never dropped.
//
// A world's log also stays while its outbox waits (its pending fold needs it), the world on screen
// keeps its log and its genesis pack (the land drawn offline), and a plan that cannot make room
// even by dropping everything droppable drops nothing: the new item is refused instead (Rule 2:
// the caller says storage is full). Pure, so the rules are tested alone (tests/browser/lru.test.ts).

export type CacheKind = "blob" | "log" | "outbox";

export interface CacheItem {
  /** "blob:<hash>", "log:<world>" or "outbox:<world>". */
  id: string;
  kind: CacheKind;
  /** The world a log or an outbox belongs to; null for a blob. */
  world: string | null;
  /** A blob's content hash; null otherwise. */
  hash: string | null;
  bytes: number;
  /** Epoch ms of the last read or write. */
  usedAt: number;
}

export interface Keep {
  /** The world on screen. */
  current: string | null;
  /** The current world's genesis pack (its latest `pack` event), or null. */
  pack: string | null;
}

export interface EvictionPlan {
  evict: CacheItem[];
  /** Whether the stored items plus `incoming` fit the budget after the evictions. */
  fits: boolean;
}

/** Whether `item` may ever be dropped under `keep`, given every item stored. */
export function evictable(item: CacheItem, items: readonly CacheItem[], keep: Keep): boolean {
  switch (item.kind) {
    case "outbox":
      return false;
    case "log":
      return (
        item.world !== keep.current &&
        !items.some((other) => other.kind === "outbox" && other.world === item.world)
      );
    case "blob":
      return keep.pack === null || item.hash !== keep.pack;
  }
}

/**
 * The least recently used droppable items whose removal lets `incoming` more bytes fit `budget`,
 * or none at all (with `fits: false`) when no set of droppable items would.
 */
export function planEviction(
  items: readonly CacheItem[],
  budget: number,
  incoming: number,
  keep: Keep,
): EvictionPlan {
  if (Number.isNaN(budget) || budget < 0 || !(incoming >= 0)) return { evict: [], fits: false };
  const total = items.reduce((sum, item) => sum + item.bytes, 0);
  let over = total + incoming - budget;
  if (over <= 0) return { evict: [], fits: true };
  const candidates = items
    .filter((item) => evictable(item, items, keep))
    .sort((a, b) => a.usedAt - b.usedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const evict: CacheItem[] = [];
  for (const item of candidates) {
    if (over <= 0) break;
    evict.push(item);
    over -= item.bytes;
  }
  return over <= 0 ? { evict, fits: true } : { evict: [], fits: false };
}

/** The share of the origin's quota the proof lets itself use. */
export const STORAGE_SHARE = 0.5;
/** The budget when the browser gives no estimate. */
export const FALLBACK_BUDGET = 64 * 1024 * 1024;

/** Bytes the proof may keep, from `navigator.storage.estimate()` (or its absence). */
export function storageBudget(estimate: { quota?: number } | null): number {
  const quota = estimate?.quota;
  return quota !== undefined && Number.isFinite(quota) && quota > 0
    ? Math.floor(quota * STORAGE_SHARE)
    : FALLBACK_BUDGET;
}
