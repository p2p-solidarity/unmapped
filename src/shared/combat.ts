// Hitscan combat (`shooter_combat@1`). Pure maths and state transitions — no Three.js — so the
// hit rule is unit-tested and main can validate a cartridge's weapons without a renderer.
//
// Weapons are declared in `rules.oui`, never hard-coded here (Rule 7). That is what lets plan.md
// §4's `add_weapon` be a data change that produces a new cartridge revision and a new hash.

export const WEAPON_KINDS = ["gun", "melee", "tool"] as const;
export type WeaponKind = (typeof WEAPON_KINDS)[number];

export interface WeaponSpec {
  assetId?: string;
  id: string;
  name: string;
  kind: WeaponKind;
  damage: number;
  /** Maximum reach in tiles. Beyond it a shot simply misses. */
  range: number;
  cooldownMs: number;
  /** Shots before a reload, or null for a weapon that never runs dry. */
  magazine: number | null;
}

export interface Combatant {
  id: string;
  hp: number;
  maxHp: number;
  /**
   * Position on the floor plane in world units (tile centre = tile + 0.5, like the renderer), and
   * the radius the hitscan ray tests against. The ray and the blockers use the same frame.
   */
  x: number;
  z: number;
  radius: number;
  /** Eye/centre height above the floor, so a shot can pass over a small target. */
  height: number;
}

export interface DamageResult {
  combatant: Combatant;
  applied: number;
  killed: boolean;
}

export function isAlive(combatant: Combatant): boolean {
  return combatant.hp > 0;
}

export function applyDamage(combatant: Combatant, amount: number): DamageResult {
  const applied = Math.max(0, Math.min(combatant.hp, Math.round(amount)));
  const hp = combatant.hp - applied;
  return { combatant: { ...combatant, hp }, applied, killed: hp <= 0 && combatant.hp > 0 };
}

export interface Ray {
  /** Origin: x/z in world units on the floor plane, y is height above the floor surface. */
  x: number;
  y: number;
  z: number;
  /** Normalised direction. */
  dx: number;
  dy: number;
  dz: number;
}

export interface HitscanHit {
  combatantId: string;
  /** Distance from the ray origin, in tiles. */
  distance: number;
}

/**
 * Closest point along a ray to a sphere's centre, clamped to the forward half-line, and whether
 * the ray passes within the sphere. Vertical extent is the combatant's own
 * height, so a shot passing above a short target misses rather than snapping to it.
 */
function raySphereDistance(ray: Ray, target: Combatant): number | null {
  // Normalised here rather than trusted: a caller passing a non-unit direction would otherwise get
  // silently wrong distances, which read as random misses at range.
  const length = Math.hypot(ray.dx, ray.dy, ray.dz);
  if (length === 0) return null;
  const dx = ray.dx / length;
  const dy = ray.dy / length;
  const dz = ray.dz / length;

  const centreY = target.height / 2;
  const ox = target.x - ray.x;
  const oy = centreY - ray.y;
  const oz = target.z - ray.z;
  const along = ox * dx + oy * dy + oz * dz;
  if (along <= 0) return null; // behind the shooter

  const closestX = ox - dx * along;
  const closestY = oy - dy * along;
  const closestZ = oz - dz * along;
  const miss = Math.sqrt(closestX * closestX + closestY * closestY + closestZ * closestZ);
  // A capsule-ish allowance: the horizontal radius, widened by half the target's height.
  return miss <= Math.max(target.radius, target.height / 2) ? along : null;
}

/** Solid axis-aligned box a shot cannot pass (a wall), in the ray's frame. */
export interface Blocker {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}

function contains(box: Blocker, x: number, y: number, z: number): boolean {
  return (
    x >= box.min[0] &&
    x <= box.max[0] &&
    y >= box.min[1] &&
    y <= box.max[1] &&
    z >= box.min[2] &&
    z <= box.max[2]
  );
}

/** Slab test: distance along the ray at which it enters the box, or null if it never does. */
function rayBoxEntry(ray: Ray, box: Blocker): number | null {
  const length = Math.hypot(ray.dx, ray.dy, ray.dz);
  if (length === 0) return null;
  const origin = [ray.x, ray.y, ray.z];
  const dir = [ray.dx / length, ray.dy / length, ray.dz / length];
  let near = Number.NEGATIVE_INFINITY;
  let far = Number.POSITIVE_INFINITY;
  for (let axis = 0; axis < 3; axis += 1) {
    const o = origin[axis] ?? 0;
    const d = dir[axis] ?? 0;
    const lo = box.min[axis] ?? 0;
    const hi = box.max[axis] ?? 0;
    if (d === 0) {
      if (o < lo || o > hi) return null;
      continue;
    }
    const t1 = (lo - o) / d;
    const t2 = (hi - o) / d;
    near = Math.max(near, Math.min(t1, t2));
    far = Math.min(far, Math.max(t1, t2));
  }
  // A shooter already inside the box (clipped into a wall) is not stopped by it.
  if (near > far || near < 0) return null;
  return near;
}

/**
 * True when a blocker stands between the shooter and a target `distance` along the ray. A box the
 * target's own centre sits in is ignored: a monster placed inside a wall must stay killable.
 */
function occluded(
  ray: Ray,
  target: Combatant,
  distance: number,
  blockers: readonly Blocker[],
): boolean {
  for (const box of blockers) {
    if (contains(box, target.x, target.height / 2, target.z)) continue;
    const entry = rayBoxEntry(ray, box);
    if (entry !== null && entry < distance) return true;
  }
  return false;
}

/**
 * The nearest living target the shot connects with, or null for a miss. Deterministic: the same
 * ray against the same targets always resolves to the same combatant. A target behind one of the
 * `blockers` is out of the line of fire, so cover actually covers.
 */
export function hitscan(
  ray: Ray,
  weapon: WeaponSpec,
  targets: readonly Combatant[],
  blockers: readonly Blocker[] = [],
): HitscanHit | null {
  let best: HitscanHit | null = null;
  for (const target of targets) {
    if (!isAlive(target)) continue;
    const distance = raySphereDistance(ray, target);
    if (distance === null || distance > weapon.range) continue;
    if (best !== null && distance >= best.distance) continue;
    if (occluded(ray, target, distance, blockers)) continue;
    best = { combatantId: target.id, distance };
  }
  return best;
}

/** Hit points a monster of this level starts with, from the rules' base and per-level step. */
export function monsterHp(base: number, perLevel: number, level: number): number {
  return Math.max(1, Math.round(base + perLevel * Math.max(0, level - 1)));
}
