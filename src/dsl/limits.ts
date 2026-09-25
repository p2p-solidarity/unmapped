// Hard clamps for every numeric and textual prop the model can write. A hallucinated `x = 9000`
// or a 4 kB NPC line must never reach the engine, so the converters run every value through the
// helpers below instead of trusting the parsed program.

export interface Range {
  readonly min: number;
  readonly max: number;
}

export const LIMITS = {
  /** Floor extent in tiles. */
  floor: { min: 6, max: 32 },
  /** Tile coordinates; additionally clamped into the floor's own bounds. */
  coord: { min: 0, max: 31 },
  wallWidth: { min: 1, max: 32 },
  wallHeight: { min: 1, max: 8 },
  scale: { min: 0.25, max: 4 },
  /** Monster silhouette multiplier; 1 = the kind's default. */
  monsterSize: { min: 0.5, max: 3 },
  /** Patch/Platform extent in tiles (a Patch is additionally clipped to the floor). */
  span: { min: 1, max: 8 },
  patchSpan: { min: 1, max: 32 },
  /** Height of a Platform's underside above the floor, and its thickness. */
  platformY: { min: 0.5, max: 6 },
  platformHeight: { min: 0.2, max: 2 },
  level: { min: 1, max: 99 },
  intensity: { min: 0, max: 5 },
  fogDensity: { min: 0, max: 0.2 },
  power: { min: 0, max: 100 },
  radius: { min: 1, max: 6 },

  maxProps: 60,
  maxPatches: 16,
  maxPlatforms: 12,
  maxNpcs: 6,
  maxMonsters: 6,
  maxTreasures: 6,
  maxWalls: 40,
  maxLights: 3,
  maxExits: 2,
  maxTriggers: 8,
  maxQuests: 4,
  maxLoot: 6,
  maxChoices: 3,
  maxGives: 4,
  maxMeshDna: 8,
  maxArchetype: 5,

  /** Maximum length of every free-text field, in characters. */
  text: {
    id: 32,
    name: 40,
    line: 400,
    effect: 200,
    quest: 200,
    weakness: 80,
    label: 60,
    event: 60,
    exit: 60,
    loot: 40,
    perk: 120,
    curse: 120,
    flavor: 240,
    archetype: 24,
  },
} as const;

const clampNumber = (value: number, range: Range): number =>
  Number.isFinite(value) ? Math.min(range.max, Math.max(range.min, value)) : range.min;

/** Round to an integer inside `range`; non-finite input collapses to `range.min`. */
export function clampInt(value: number, range: Range): number {
  return Math.round(clampNumber(value, range));
}

/** Clamp a float into `range`, keeping at most 3 decimals so the DSL round-trips cleanly. */
/**
 * Three decimals suits tile speeds and distances. Values whose whole useful range lives below that
 * — look sensitivity runs 0.0001..0.02 — must pass a higher `decimals`, or rounding silently
 * rewrites the number the author wrote.
 */
export function clampFloat(value: number, range: Range, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(clampNumber(value, range) * factor) / factor;
}

/** Clamp a tile coordinate into both LIMITS.coord and the floor's own extent. */
export function clampCoord(value: number, extent: number): number {
  return clampInt(value, { min: LIMITS.coord.min, max: Math.min(LIMITS.coord.max, extent - 1) });
}

/** Collapse whitespace and cut to `max` characters. */
export function clampText(value: string, max: number): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : flat.slice(0, max).trimEnd();
}

/** Keep at most `max` entries. */
export function truncate<T>(values: readonly T[], max: number): T[] {
  return values.length <= max ? [...values] : values.slice(0, max);
}
