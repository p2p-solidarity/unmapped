// Readers/writers for the JSON dotfiles of a world. Everything on disk is hand-editable, so each
// file is validated before it reaches the store: a typo surfaces as an AppError with a hint, never
// as a half-populated world (Rule 2, Rule 5).

import { type AppError, err, ok, type Result } from "@shared/result";
import {
  ARCHETYPES,
  type Archetype,
  BIOMES,
  type Genesis,
  type Inventory,
  ITEM_KINDS,
  type ItemKind,
  type ItemSpec,
  PHYSICS_MODES,
  type PhysicsMode,
  type WorldMeta,
} from "@shared/world";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** meta.flags is optional on disk: a world written before flags existed simply has none. */
function parseFlags(value: unknown): Result<WorldMeta["flags"]> {
  if (value === undefined || value === null) return ok({});
  if (!isRecord(value)) return invalid("meta.json", "flags must be an object");
  const flags: WorldMeta["flags"] = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string" && typeof entry !== "number" && typeof entry !== "boolean") {
      return invalid("meta.json", `flags.${key} must be a string, number or boolean`);
    }
    flags[key] = entry;
  }
  return ok(flags);
}

function invalid(file: string, detail: string): Result<never> {
  return err(
    "world-file-invalid",
    `${file} is not valid: ${detail}.`,
    `Open ${file} in the world folder and fix it, or delete the world and start again.`,
  );
}

function parseObject(text: string, file: string): Result<Record<string, unknown>> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return invalid(file, e instanceof Error ? e.message : "unparseable JSON");
  }
  if (!isRecord(raw)) return invalid(file, "the top level is not an object");
  return ok(raw);
}

export function parseMeta(text: string): Result<WorldMeta> {
  const parsed = parseObject(text, "meta.json");
  if (!parsed.ok) return parsed;
  const raw = parsed.value;
  const { id, name, archetype, createdAt, updatedAt, floor, mutation, flags, mods } = raw;
  if (typeof id !== "string" || id.length === 0) return invalid("meta.json", "id is missing");
  if (typeof name !== "string") return invalid("meta.json", "name is missing");
  if (typeof archetype !== "string" || !isArchetype(archetype)) {
    return invalid("meta.json", `archetype must be one of ${ARCHETYPES.join(", ")}`);
  }
  if (typeof createdAt !== "string" || typeof updatedAt !== "string") {
    return invalid("meta.json", "createdAt/updatedAt must be ISO strings");
  }
  if (typeof floor !== "number" || !Number.isFinite(floor)) {
    return invalid("meta.json", "floor must be a number");
  }
  if (mutation !== undefined && mutation !== null) {
    if (!isRecord(mutation)) return invalid("meta.json", "mutation must be an object or null");
    if (mutation.skyColor !== null && typeof mutation.skyColor !== "string") {
      return invalid("meta.json", "mutation.skyColor must be a string or null");
    }
    if (mutation.fogDensity !== null && typeof mutation.fogDensity !== "number") {
      return invalid("meta.json", "mutation.fogDensity must be a number or null");
    }
    if (
      mutation.biome !== null &&
      (typeof mutation.biome !== "string" ||
        !BIOMES.includes(mutation.biome as (typeof BIOMES)[number]))
    ) {
      return invalid("meta.json", `mutation.biome must be one of ${BIOMES.join(", ")}`);
    }
  }
  if (mods !== undefined && !isStringArray(mods)) {
    return invalid("meta.json", "mods must be an array of mod names");
  }
  const parsedFlags = parseFlags(flags);
  if (!parsedFlags.ok) return parsedFlags;
  return ok({
    id,
    name,
    archetype,
    createdAt,
    updatedAt,
    floor,
    flags: parsedFlags.value,
    mods: mods ?? [],
    mutation:
      mutation === null || mutation === undefined
        ? null
        : {
            skyColor: mutation.skyColor as string | null,
            fogDensity: mutation.fogDensity as number | null,
            biome: mutation.biome as (typeof BIOMES)[number] | null,
          },
  });
}

export function parseGenesis(text: string): Result<Genesis> {
  const parsed = parseObject(text, "genesis.json");
  if (!parsed.ok) return parsed;
  const { archetype, physics, language, seed, intent, createdAt } = parsed.value;
  if (typeof archetype !== "string" || !isArchetype(archetype)) {
    return invalid("genesis.json", `archetype must be one of ${ARCHETYPES.join(", ")}`);
  }
  if (typeof physics !== "string" || !isPhysics(physics)) {
    return invalid("genesis.json", `physics must be one of ${PHYSICS_MODES.join(", ")}`);
  }
  if (typeof language !== "string") return invalid("genesis.json", "language is missing");
  if (typeof seed !== "number" || !Number.isFinite(seed)) {
    return invalid("genesis.json", "seed must be a number");
  }
  if (typeof intent !== "string") return invalid("genesis.json", "intent is missing");
  if (typeof createdAt !== "string") return invalid("genesis.json", "createdAt is missing");
  return ok({ archetype, physics, language, seed, intent, createdAt });
}

function parseItem(raw: unknown, index: number): Result<ItemSpec> {
  if (!isRecord(raw)) return invalid("inventory.json", `items[${index}] is not an object`);
  const { id, name, kind, power, perk, curse, meshDna, archetype, flavor } = raw;
  if (typeof id !== "string" || typeof name !== "string") {
    return invalid("inventory.json", `items[${index}] needs id and name`);
  }
  if (typeof kind !== "string" || !isItemKind(kind)) {
    return invalid(
      "inventory.json",
      `items[${index}].kind must be one of ${ITEM_KINDS.join(", ")}`,
    );
  }
  if (typeof power !== "number" || !Number.isFinite(power)) {
    return invalid("inventory.json", `items[${index}].power must be a number`);
  }
  if (typeof perk !== "string" || typeof flavor !== "string") {
    return invalid("inventory.json", `items[${index}] needs perk and flavor`);
  }
  if (curse !== null && typeof curse !== "string") {
    return invalid("inventory.json", `items[${index}].curse must be a string or null`);
  }
  if (!isStringArray(meshDna) || !isStringArray(archetype)) {
    return invalid("inventory.json", `items[${index}] needs meshDna[] and archetype[]`);
  }
  return ok({ id, name, kind, power, perk, curse, meshDna, archetype, flavor });
}

export function parseInventory(text: string): Result<Inventory> {
  const parsed = parseObject(text, "inventory.json");
  if (!parsed.ok) return parsed;
  const { items, materials } = parsed.value;
  if (!Array.isArray(items)) return invalid("inventory.json", "items must be an array");
  if (!isStringArray(materials))
    return invalid("inventory.json", "materials must be a string array");
  const out: ItemSpec[] = [];
  for (const [index, raw] of items.entries()) {
    const item = parseItem(raw, index);
    if (!item.ok) return item;
    out.push(item.value);
  }
  return ok({ items: out, materials });
}

export function serializeInventory(inventory: Inventory): string {
  return `${JSON.stringify(inventory, null, 2)}\n`;
}

export function serializeMeta(meta: WorldMeta): string {
  return `${JSON.stringify(meta, null, 2)}\n`;
}

/** An absent karma.jsonl / inventory.json means "nothing recorded yet", not a broken world. */
export function isMissingFile(error: AppError): boolean {
  return /not.?found|enoent|no such file|missing/i.test(`${error.code} ${error.message}`);
}

function isArchetype(value: string): value is Archetype {
  return (ARCHETYPES as readonly string[]).includes(value);
}

function isPhysics(value: string): value is PhysicsMode {
  return (PHYSICS_MODES as readonly string[]).includes(value);
}

function isItemKind(value: string): value is ItemKind {
  return (ITEM_KINDS as readonly string[]).includes(value);
}
