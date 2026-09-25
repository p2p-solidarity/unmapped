// The fixed vocabulary of primitive parts the engine can assemble into an item mesh. The model
// may only pick from this list — anything else is dropped by `toItem`, because the renderer has
// no geometry for a part it has never heard of.

export const MESH_DNA_GROUPS = {
  blade: ["blade_curved", "blade_thin", "blade_broad", "blade_serrated", "blade_twin"],
  point: ["tip_needle", "tip_hook", "head_axe", "head_hammer"],
  grip: ["hilt_wrapped", "hilt_dragon", "hilt_bone", "guard_crescent", "guard_ring", "gear_pommel"],
  shaft: ["shaft_long", "shaft_bamboo", "staff_crystal", "staff_forked"],
  ranged: [
    "barrel_long",
    "barrel_short",
    "barrel_coil",
    "stock_wood",
    "bow_recurve",
    "string_silk",
  ],
  body: ["plate_layered", "plate_scaled", "chain_mesh", "cloak_tattered", "shell_round"],
  charm: ["charm_bell", "charm_feather", "vial_round", "lantern_paper"],
  accent: ["glow_lightning", "glow_rune", "core_ember", "core_void", "wing_shard", "root_twisted"],
} as const;

/** Flat, ordered vocabulary — the only values allowed in `ItemSpec.meshDna`. */
export const MESH_DNA_PARTS: readonly string[] = Object.values(MESH_DNA_GROUPS).flat();

const PART_SET = new Set(MESH_DNA_PARTS);

export const isMeshPart = (value: string): boolean => PART_SET.has(value);

/** One line per group, for the item prompt. */
export const meshDnaLines = (): string[] =>
  Object.entries(MESH_DNA_GROUPS).map(([group, parts]) => `${group}: ${parts.join(", ")}`);
