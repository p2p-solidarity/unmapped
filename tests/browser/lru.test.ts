// The browser proof's storage LRU (rev 6 phase 4, D7): what the phone may drop when its share of
// the browser's quota runs out. Isolated because the loss it guards against is silent: a dropped
// outbox is a note that never reaches the world, and a dropped pack is a land that cannot be drawn
// offline, and no E2E fills a real quota.
//
// Ways it could fail, each guarded below:
//   1. evicting an unsent outbox (nothing else holds those events);
//   2. evicting the log of a world whose outbox still waits (its pending fold goes with it);
//   3. evicting the current world's log;
//   4. evicting the current world's genesis pack to make room for something else;
//   5. evicting a newer item before an older one;
//   6. evicting more than the incoming bytes need;
//   7. evicting caches and still not fitting (data destroyed for nothing) — it must evict nothing;
//   8. a broken budget (NaN, negative) evicting anything.

import { describe, expect, it } from "vitest";
import { type CacheItem, planEviction } from "../../src/browser/lru";

const W1 = `h${"a".repeat(52)}`;
const W2 = `h${"b".repeat(52)}`;
const W3 = `h${"c".repeat(52)}`;
const PACK = `sha256:${"1".repeat(64)}`;
const OTHER = `sha256:${"2".repeat(64)}`;
const OLD = `sha256:${"3".repeat(64)}`;

const blob = (hash: string, bytes: number, usedAt: number): CacheItem => ({
  id: `blob:${hash}`,
  kind: "blob",
  world: null,
  hash,
  bytes,
  usedAt,
});
const log = (world: string, bytes: number, usedAt: number): CacheItem => ({
  id: `log:${world}`,
  kind: "log",
  world,
  hash: null,
  bytes,
  usedAt,
});
const outbox = (world: string, bytes: number, usedAt: number): CacheItem => ({
  id: `outbox:${world}`,
  kind: "outbox",
  world,
  hash: null,
  bytes,
  usedAt,
});

const ids = (items: readonly CacheItem[]) => items.map((item) => item.id);

describe("planEviction", () => {
  const items = [
    outbox(W2, 400, 1),
    log(W2, 500, 2),
    blob(PACK, 900, 3),
    log(W1, 700, 4),
    blob(OLD, 300, 5),
    log(W3, 200, 6),
    blob(OTHER, 250, 7),
  ];
  const keep = { current: W1, pack: PACK };
  const total = items.reduce((sum, item) => sum + item.bytes, 0);

  it("never evicts an outbox, its world's log, the current log or pack (1–4)", () => {
    const plan = planEviction(items, 2_000, 0, keep);
    const kept = new Set([`outbox:${W2}`, `log:${W2}`, `log:${W1}`, `blob:${PACK}`]);
    expect(ids(plan.evict).some((id) => kept.has(id))).toBe(false);
    expect(plan.fits).toBe(false);
    expect(plan.evict).toEqual([]);
  });

  it("evicts oldest first, and only what the incoming bytes need (5, 6)", () => {
    // 3,250 stored; room for 3,000 with 100 incoming: 350 must go → OLD (300), then W3's log (200).
    const plan = planEviction(items, 3_000, 100, keep);
    expect(ids(plan.evict)).toEqual([`blob:${OLD}`, `log:${W3}`]);
    expect(plan.fits).toBe(true);
    expect(planEviction(items, total + 100, 100, keep)).toEqual({ evict: [], fits: true });
  });

  it("evicts nothing when even every evictable item would not make room (7)", () => {
    // Evictable: OLD 300, W3 200, OTHER 250 = 750; 3,250 − 750 + 1 > 2,500.
    expect(planEviction(items, 2_500, 1, keep)).toEqual({ evict: [], fits: false });
    // The pack is protected only while its world is current.
    const other = planEviction(items, 2_500, 1, { current: W3, pack: null });
    expect(other.fits).toBe(true);
    expect(ids(other.evict)).toContain(`blob:${PACK}`);
    expect(ids(other.evict)).not.toContain(`log:${W3}`);
  });

  it("refuses a broken budget without evicting (8)", () => {
    for (const budget of [Number.NaN, -1, Number.NEGATIVE_INFINITY]) {
      expect(planEviction(items, budget, 10, keep)).toEqual({ evict: [], fits: false });
    }
    expect(planEviction(items, Number.POSITIVE_INFINITY, 10, keep)).toEqual({
      evict: [],
      fits: true,
    });
  });
});
