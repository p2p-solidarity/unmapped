// zod mirrors of the dotfile shapes in `@shared/world`. Used both to validate IPC payloads and to
// refuse writing a file that a hand-editing player (or a mod) would corrupt.

import { parseScene } from "@dsl/index";
import { genesisSchema } from "@shared/cartridgeSchemas";
import { err, ok, type Result } from "@shared/result";
import {
  ARCHETYPES,
  BIOMES,
  CHOICE_ACTIONS,
  type Genesis,
  type Inventory,
  ITEM_KINDS,
  type KarmaEntry,
  LEDGER_ACTIONS,
  WORLD_FILE_NAMES,
  WORLD_FILES,
  type WorldFile,
  type WorldMeta,
} from "@shared/world";
import { z } from "zod";

const KARMA_ACTIONS = [...CHOICE_ACTIONS, ...LEDGER_ACTIONS] as const;

export const itemSpecSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(ITEM_KINDS),
  power: z.number(),
  perk: z.string(),
  curse: z.string().nullable(),
  meshDna: z.array(z.string()),
  archetype: z.array(z.string()),
  flavor: z.string(),
});

// Pure, so a cartridge manifest can be read outside main (rev 6 phase 4, @shared/cartridgeSchemas).
export { genesisSchema };

/** Quest switches and counters written by tools (`set_flag` in `@shared/effects`). */
export const worldFlagsSchema = z.record(
  z.string().min(1).max(64),
  z.union([z.string().max(2_000), z.number(), z.boolean()]),
);

export const worldMetaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  archetype: z.enum(ARCHETYPES),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  floor: z.number().int().min(1),
  mutation: z
    .object({
      skyColor: z.string().nullable(),
      fogDensity: z.number().nullable(),
      biome: z.enum(BIOMES).nullable(),
    })
    .nullable()
    .optional(),
  // `flags` and `mods` arrived with the harness. A meta.json written before it is still a valid
  // world, so both are optional on read and defaulted by `metaDefaults` below.
  flags: worldFlagsSchema.optional(),
  mods: z.array(z.string().min(1).max(64)).max(64).optional(),
});

export const karmaEntrySchema = z.object({
  at: z.string().min(1),
  floor: z.number(),
  npcId: z.string().nullable(),
  choice: z.string(),
  action: z.enum(KARMA_ACTIONS),
  effect: z.string(),
  cx: z.number().int().min(-40_000).max(40_000).optional(),
  cz: z.number().int().min(-40_000).max(40_000).optional(),
});

export const inventorySchema = z.object({
  items: z.array(itemSpecSchema),
  materials: z.array(z.string()),
});

export const worldIdSchema = z.string().min(1).max(96);
export const worldFileSchema = z.enum(WORLD_FILE_NAMES);

export const createWorldInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  genesis: genesisSchema,
  scene: z.string().min(1),
});

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (issue === undefined) return "does not match the expected shape";
  return issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message;
}

function parseJson<T>(label: string, raw: string, schema: z.ZodType<T>): Result<T> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    return err("world-file-invalid", `${label} is not valid JSON`, why);
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return err(
      "world-file-invalid",
      `${label} ${firstIssue(parsed.error)}`,
      `Fix ${label} by hand or restore it from a .seed export.`,
    );
  }
  return ok(parsed.data);
}

/**
 * Fills in the fields a world written by an older build does not have, so a meta.json from before
 * the harness still loads instead of failing validation.
 */
export function metaDefaults<T extends z.output<typeof worldMetaSchema>>(meta: T): WorldMeta {
  return {
    ...meta,
    mutation: meta.mutation ?? null,
    flags: meta.flags ?? {},
    mods: meta.mods ?? [],
  };
}

export function parseMetaText(raw: string): Result<WorldMeta> {
  const parsed = parseJson(WORLD_FILES.meta, raw, worldMetaSchema);
  return parsed.ok ? ok(metaDefaults(parsed.value)) : parsed;
}

export function parseGenesisText(raw: string): Result<Genesis> {
  return parseJson(WORLD_FILES.genesis, raw, genesisSchema);
}

export function parseInventoryText(raw: string): Result<Inventory> {
  return parseJson(WORLD_FILES.inventory, raw, inventorySchema);
}

export function parseKarmaText(raw: string): Result<KarmaEntry[]> {
  const entries: KarmaEntry[] = [];
  const lines = raw.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = (lines[index] ?? "").trim();
    if (line.length === 0) continue;
    const parsed = parseJson(`${WORLD_FILES.karma} line ${index + 1}`, line, karmaEntrySchema);
    if (!parsed.ok) return parsed;
    entries.push(parsed.value);
  }
  return ok(entries);
}

/** Gate for every write: a corrupt dotfile never reaches disk. */
export function validateFileContent(file: WorldFile, content: string): Result<null> {
  switch (file) {
    case WORLD_FILES.scene: {
      if (content.trim().length === 0) {
        return err(
          "world-file-invalid",
          `${WORLD_FILES.scene} is empty`,
          "A floor must contain an OpenUI Lang Scene program.",
        );
      }
      const parsed = parseScene(content);
      if (!parsed.ok) {
        return err(
          "world-file-invalid",
          `${WORLD_FILES.scene} could not be parsed: ${parsed.error.message}`,
          parsed.error.hint,
        );
      }
      return ok(null);
    }
    case WORLD_FILES.meta: {
      const parsed = parseMetaText(content);
      return parsed.ok ? ok(null) : parsed;
    }
    case WORLD_FILES.genesis: {
      const parsed = parseGenesisText(content);
      return parsed.ok ? ok(null) : parsed;
    }
    case WORLD_FILES.inventory: {
      const parsed = parseInventoryText(content);
      return parsed.ok ? ok(null) : parsed;
    }
    case WORLD_FILES.karma: {
      const parsed = parseKarmaText(content);
      return parsed.ok ? ok(null) : parsed;
    }
    default:
      return err(
        "world-file-unknown",
        `${String(file)} is not a world file`,
        `Expected one of ${WORLD_FILE_NAMES.join(", ")}.`,
      );
  }
}
