// Click to walk on the land: the path from where the walker stands to where the player clicked —
// A* over the tiles the walker can stand on, eight ways but never cutting a corner, then pulled
// straight wherever the ground between two points is clear — and the steering that follows it.
// Pure: the caller says where the walker can stand (the same test the walker moves by).

export interface Point {
  x: number;
  z: number;
}

export interface Route {
  /** Points still ahead; the last one is where the walk ends. */
  points: Point[];
  /** Interaction id to use on arrival (a person, a treasure, a gate…), or null for plain ground. */
  target: string | null;
  /** Stop this far from the last point (close enough to interact); 0 walks all the way. */
  stopWithin: number;
  /** Seconds spent without getting anywhere; the walk is given up past STUCK_SECONDS. */
  stuck: number;
}

/** Expanded tiles before a click is judged unreachable: well past a screenful of land. */
const SEARCH_LIMIT = 8000;
/** A click farther than this (tiles) is not walked to. */
const MAX_REACH = 60;
/** How far around an unwalkable clicked tile to look for ground to stop on. */
const NEAR_GOAL = 3;
const ARRIVE = 0.12;
/** Line-of-sight sampling step (tiles) when straightening the path. */
const SAMPLE = 0.25;
export const STUCK_SECONDS = 0.6;

type Stand = (x: number, z: number) => boolean;

const key = (x: number, z: number): string => `${x},${z}`;

/** A binary heap on f-score: the search touches thousands of tiles, a sorted array would crawl. */
class Open {
  private readonly items: { x: number; z: number; f: number }[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: { x: number; z: number; f: number }): void {
    const items = this.items;
    items.push(item);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const a = items[parent];
      const b = items[i];
      if (a === undefined || b === undefined || a.f <= b.f) break;
      items[parent] = b;
      items[i] = a;
      i = parent;
    }
  }
  pop(): { x: number; z: number; f: number } | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0 && last !== undefined) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if ((items[l]?.f ?? Infinity) < (items[m]?.f ?? Infinity)) m = l;
        if ((items[r]?.f ?? Infinity) < (items[m]?.f ?? Infinity)) m = r;
        if (m === i) break;
        const a = items[i];
        const b = items[m];
        if (a === undefined || b === undefined) break;
        items[i] = b;
        items[m] = a;
        i = m;
      }
    }
    return top;
  }
}

function clear(stand: Stand, a: Point, b: Point): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / SAMPLE);
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    if (!stand(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
  }
  return true;
}

/**
 * The points to walk through from `from` to `to`, or null when there is no way within reach. A
 * clicked spot the walker cannot stand on (a tree, the edge of the water) ends at the nearest
 * ground next to it.
 */
export function findPath(from: Point, to: Point, stand: Stand): Point[] | null {
  const known = new Map<string, boolean>();
  const free = (x: number, z: number): boolean => {
    const k = key(x, z);
    let hit = known.get(k);
    if (hit === undefined) {
      hit = stand(x + 0.5, z + 0.5);
      known.set(k, hit);
    }
    return hit;
  };
  const sx = Math.floor(from.x);
  const sz = Math.floor(from.z);
  let gx = Math.floor(to.x);
  let gz = Math.floor(to.z);
  if (Math.max(Math.abs(gx - sx), Math.abs(gz - sz)) > MAX_REACH) return null;
  let end: Point | null = stand(to.x, to.z) ? { x: to.x, z: to.z } : null;
  if (!free(gx, gz)) {
    let best: { x: number; z: number; d: number } | null = null;
    for (let dz = -NEAR_GOAL; dz <= NEAR_GOAL; dz += 1) {
      for (let dx = -NEAR_GOAL; dx <= NEAR_GOAL; dx += 1) {
        const d = Math.hypot(gx + dx + 0.5 - to.x, gz + dz + 0.5 - to.z);
        if (free(gx + dx, gz + dz) && (best === null || d < best.d)) {
          best = { x: gx + dx, z: gz + dz, d };
        }
      }
    }
    if (best === null) return null;
    gx = best.x;
    gz = best.z;
    end = null;
  }

  const open = new Open();
  const cost = new Map<string, number>([[key(sx, sz), 0]]);
  const came = new Map<string, string>();
  const h = (x: number, z: number): number => {
    const dx = Math.abs(x - gx);
    const dz = Math.abs(z - gz);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  open.push({ x: sx, z: sz, f: h(sx, sz) });
  let expanded = 0;
  let found = sx === gx && sz === gz;
  while (!found && open.size > 0 && expanded < SEARCH_LIMIT) {
    const node = open.pop();
    if (node === undefined) break;
    expanded += 1;
    const g = cost.get(key(node.x, node.z)) ?? 0;
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dz === 0) continue;
        const nx = node.x + dx;
        const nz = node.z + dz;
        if (!free(nx, nz)) continue;
        // A diagonal step needs both sides open, or it would clip the corner of what is there.
        if (dx !== 0 && dz !== 0 && (!free(node.x + dx, node.z) || !free(node.x, node.z + dz))) {
          continue;
        }
        const next = g + (dx !== 0 && dz !== 0 ? Math.SQRT2 : 1);
        const k = key(nx, nz);
        if (next >= (cost.get(k) ?? Infinity)) continue;
        cost.set(k, next);
        came.set(k, key(node.x, node.z));
        if (nx === gx && nz === gz) found = true;
        open.push({ x: nx, z: nz, f: next + h(nx, nz) });
      }
    }
  }
  if (!found) return null;

  const tiles: Point[] = [];
  for (let k: string | undefined = key(gx, gz); k !== undefined && k !== key(sx, sz); ) {
    const [x = 0, z = 0] = k.split(",").map(Number);
    tiles.unshift({ x: x + 0.5, z: z + 0.5 });
    k = came.get(k);
  }
  if (end !== null) tiles[tiles.length - 1] = end;
  if (tiles.length === 0) return end === null ? [] : [end];

  // Pull the path straight: from each point, jump to the farthest one in plain sight.
  const path: Point[] = [];
  let anchor: Point = from;
  let i = 0;
  while (i < tiles.length) {
    let far = i;
    for (let j = tiles.length - 1; j > i; j -= 1) {
      const point = tiles[j];
      if (point !== undefined && clear(stand, anchor, point)) {
        far = j;
        break;
      }
    }
    const point = tiles[far];
    if (point === undefined) break;
    path.push(point);
    anchor = point;
    i = far + 1;
  }
  return path;
}

/**
 * Which way to push the stick to follow `route` from `at`, as a move axis (strafe right,
 * forward north) no longer than 1 — shorter on the last stretch so a step never overshoots the
 * end. Drops the points already reached; null when the walk is over.
 */
export function steer(
  route: Route,
  at: Point,
  step: number,
): { strafe: number; forward: number } | null {
  for (;;) {
    const next = route.points[0];
    if (next === undefined) return null;
    const last = route.points.length === 1;
    const distance = Math.hypot(next.x - at.x, next.z - at.z);
    const done = last ? distance <= Math.max(ARRIVE, route.stopWithin) : distance <= ARRIVE;
    if (done) {
      route.points.shift();
      continue;
    }
    const scale = last ? Math.min(1, (distance - route.stopWithin) / Math.max(step, 1e-6)) : 1;
    return {
      strafe: ((next.x - at.x) / distance) * scale,
      forward: (-(next.z - at.z) / distance) * scale,
    };
  }
}
