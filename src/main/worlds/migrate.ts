// Preserves a legacy `worlds/<id>/` (Rule 9 v0: five dotfiles, one generated floor) as the new
// shapes: the current floor becomes one terminal scene of an immutable cartridge, and the
// world's progress (flags, inventory, mutation, karma) becomes a pinned instance. The source
// directory is never deleted; a `migrated.json` receipt makes the migration idempotent.

import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_RULES_SOURCE, parseScene, serializeScene } from "@dsl/index";
import type {
  CartridgeManifest,
  CartridgeManifestCore,
  CartridgeRef,
  LegacyMigrationReceipt,
} from "@shared/cartridge";
import { ENGINE_API_VERSION, SAVE_SCHEMA_VERSION } from "@shared/cartridge";
import type { GameplayKitId } from "@shared/gameplay";
import { err, fail, ok, type Result, toError } from "@shared/result";
import { WORLD_FILES } from "@shared/world";
import { z } from "zod";
import { publishCartridgeRevision } from "../cartridges/store";
import {
  checkpointInstance,
  createInstance,
  listInstances,
  readInstance,
} from "../instances/store";
import { isWorldId, worldDir } from "./paths";
import { parseGenesisText, parseInventoryText, parseKarmaText, parseMetaText } from "./schemas";
import { readWorldFile } from "./store";

export const RECEIPT_FILE = "migrated.json";
const LEGACY_KIT: GameplayKitId = "tps_exploration@1";

export interface MigrationDirs {
  worldsDir: string;
  cartridgesDir: string;
  instancesDir: string;
}

const receiptSchema: z.ZodType<LegacyMigrationReceipt> = z
  .object({
    formatVersion: z.literal(1),
    worldId: z.string().min(1),
    cartridge: z
      .object({
        cartridgeId: z.string().min(1),
        version: z.string().min(1),
        contentHash: z.custom<CartridgeRef["contentHash"]>(
          (value) => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value),
        ),
      })
      .strict(),
    instanceId: z.string().min(1),
    migratedAt: z.string().min(1),
  })
  .strict();

async function existingReceipt(
  dirs: MigrationDirs,
  worldId: string,
): Promise<LegacyMigrationReceipt | null> {
  const path = join(worldDir(dirs.worldsDir, worldId), RECEIPT_FILE);
  try {
    await stat(path);
    const parsed = receiptSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
    if (!parsed.success || parsed.data.worldId !== worldId) return null;
    const instance = await readInstance(dirs.instancesDir, parsed.data.instanceId);
    if (!instance.ok) return null;
    const pinned = instance.value.meta.cartridge;
    return pinned.cartridgeId === parsed.data.cartridge.cartridgeId &&
      pinned.version === parsed.data.cartridge.version &&
      pinned.contentHash === parsed.data.cartridge.contentHash
      ? parsed.data
      : null;
  } catch {
    return null;
  }
}

function cartridgeIdFor(worldId: string): string {
  return `legacy-${worldId}`.slice(0, 80).replace(/-+$/, "");
}

const MAX_LEGACY_PATCHES = 1000;

/**
 * Publishes under the first free patch version. Identical bytes reuse the existing revision; a
 * world hand-edited after a stale receipt gets `1.0.<n+1>` instead of a permanent conflict.
 */
async function publishLegacyRevision(
  cartridgesDir: string,
  manifest: CartridgeManifestCore,
  scenes: Record<string, string>,
): Promise<Result<CartridgeManifest>> {
  for (let patch = 0; patch < MAX_LEGACY_PATCHES; patch += 1) {
    const result = await publishCartridgeRevision(cartridgesDir, {
      manifest: { ...manifest, version: `1.0.${patch}` },
      rules: DEFAULT_RULES_SOURCE,
      scenes,
    });
    if (result.ok || result.error.code !== "cartridge-version-conflict") return result;
  }
  return err(
    "migration-version-exhausted",
    `${manifest.cartridgeId} already has ${MAX_LEGACY_PATCHES} legacy revisions.`,
    "Delete unused legacy revisions from the cartridges directory.",
  );
}

/** A retry after a lost receipt adopts the instance already pinned to this revision. */
async function adoptedInstanceId(
  instancesDir: string,
  contentHash: CartridgeRef["contentHash"],
): Promise<string | null> {
  const instances = await listInstances(instancesDir);
  if (!instances.ok) return null;
  return (
    instances.value.find((meta) => meta.cartridge.contentHash === contentHash)?.instanceId ?? null
  );
}

export async function migrateLegacyWorld(
  dirs: MigrationDirs,
  worldId: string,
  now: Date = new Date(),
): Promise<Result<LegacyMigrationReceipt>> {
  if (!isWorldId(worldId)) return err("world-id-invalid", `Invalid world id: ${worldId}`);
  const done = await existingReceipt(dirs, worldId);
  if (done !== null) return ok(done);

  const read = async (file: (typeof WORLD_FILES)[keyof typeof WORLD_FILES]) =>
    readWorldFile(dirs.worldsDir, worldId, file);
  const [metaText, genesisText, sceneText, karmaText, inventoryText] = await Promise.all([
    read(WORLD_FILES.meta),
    read(WORLD_FILES.genesis),
    read(WORLD_FILES.scene),
    read(WORLD_FILES.karma),
    read(WORLD_FILES.inventory),
  ]);
  for (const file of [metaText, genesisText, sceneText, karmaText, inventoryText]) {
    if (!file.ok) return file;
  }
  if (!metaText.ok || !genesisText.ok || !sceneText.ok || !karmaText.ok || !inventoryText.ok) {
    return err("world-file-missing", "A legacy world file could not be read.");
  }
  const meta = parseMetaText(metaText.value);
  if (!meta.ok) return meta;
  const genesis = parseGenesisText(genesisText.value);
  if (!genesis.ok) return genesis;
  const karma = parseKarmaText(karmaText.value);
  if (!karma.ok) return karma;
  const inventory = parseInventoryText(inventoryText.value);
  if (!inventory.ok) return inventory;
  const scene = parseScene(sceneText.value);
  if (!scene.ok) {
    return err(
      "migration-scene-invalid",
      `world.oui does not parse: ${scene.error.message}`,
      "Fix world.oui in the console first; the migration preserves it verbatim.",
    );
  }
  const gate = scene.value.exits[0];
  if (gate === undefined) {
    return err(
      "migration-exit-missing",
      "This floor has no Exit, so it cannot become the cartridge's ending.",
      "Add one Exit to world.oui; reaching it will complete the migrated cartridge.",
    );
  }

  const sceneId = `floor-${meta.value.floor}`;
  const source = serializeScene({
    ...scene.value,
    contract: {
      sceneId,
      kit: LEGACY_KIT,
      requiresFlags: [],
      requiresItems: [],
      inventoryPolicy: "carry",
      grantsFlags: [],
      terminal: true,
    },
    // Legacy exits led to a floor the model would have written next; here they end the cartridge.
    exits: scene.value.exits.map((exit) => ({ ...exit, targetSceneId: null })),
  });
  const title = scene.value.name.trim() || meta.value.name;
  const premise = genesis.value.intent.trim() || meta.value.name;
  const manifest: CartridgeManifestCore = {
    formatVersion: 1,
    cartridgeId: cartridgeIdFor(worldId),
    version: "1.0.0",
    name: meta.value.name,
    description: `Migrated from legacy world ${meta.value.name} (floor ${meta.value.floor}).`,
    author: "legacy",
    createdAt: meta.value.createdAt,
    engineApiVersion: ENGINE_API_VERSION,
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
    entrySceneId: sceneId,
    story: {
      premise,
      finale: gate.to,
      scenes: [{ id: sceneId, title, summary: title, objective: gate.to, kit: LEGACY_KIT }],
    },
    scenes: [{ id: sceneId, title }],
    requiredKits: [LEGACY_KIT],
    genesis: genesis.value,
    lineage: null,
  };
  const published = await publishLegacyRevision(dirs.cartridgesDir, manifest, {
    [sceneId]: source,
  });
  if (!published.ok) return published;
  let instanceId = await adoptedInstanceId(dirs.instancesDir, published.value.contentHash);
  if (instanceId === null) {
    const created = await createInstance(dirs.instancesDir, published.value, meta.value.name, now);
    if (!created.ok) return created;
    instanceId = created.value.meta.instanceId;
    const progressed = await checkpointInstance(
      dirs.instancesDir,
      {
        instanceId,
        expectedUpdatedAt: created.value.meta.updatedAt,
        flags: meta.value.flags,
        inventory: inventory.value,
        mutation: meta.value.mutation,
        karma: karma.value,
      },
      now,
    );
    if (!progressed.ok) return progressed;
  }

  const receipt: LegacyMigrationReceipt = {
    formatVersion: 1,
    worldId,
    cartridge: {
      cartridgeId: published.value.cartridgeId,
      version: published.value.version,
      contentHash: published.value.contentHash,
    },
    instanceId,
    migratedAt: now.toISOString(),
  };
  try {
    await writeFile(
      join(worldDir(dirs.worldsDir, worldId), RECEIPT_FILE),
      `${JSON.stringify(receipt, null, 2)}\n`,
      "utf8",
    );
  } catch (error) {
    return fail(toError(error, "migration-receipt-failed"));
  }
  return ok(receipt);
}
