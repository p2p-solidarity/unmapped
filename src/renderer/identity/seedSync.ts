// Encrypted seed blob. Passkey portability depends on runtime WebAuthn PRF support; the
// keychain fallback is intentionally same-machine only.
//
// `window.seed.worlds.exportSeed` writes a *plaintext* .seed to a path the player picks, which is
// the wrong shape for sync, so this module reads the five dotfiles over IPC, zips them itself and
// encrypts the zip. `packFiles` deliberately mirrors main's `seeds/pack` layout — every world file
// at the zip root, meta.json included — so a .seed.enc decrypts into something main can also read.
// Keep the two in sync if that layout ever changes.

import { parseScene } from "@dsl/index";
import { translate } from "@renderer/i18n";
import type { SeedApi } from "@shared/ipc";
import { err, ok, type Result } from "@shared/result";
import {
  ARCHETYPES,
  BIOMES,
  CHOICE_ACTIONS,
  type Genesis,
  ITEM_KINDS,
  PHYSICS_MODES,
  WORLD_FILE_NAMES,
  WORLD_FILES,
  type WorldFile,
  type WorldMeta,
} from "@shared/world";
import { strFromU8, strToU8, type Unzipped, unzipSync, type Zippable, zipSync } from "fflate";
import { z } from "zod";
import { seedApi } from "./api";
import { type Bytes, fromBase64, toBase64 } from "./bytes";
import { decryptBytes, encryptBytes, type KeyLike } from "./crypto";

export type WorldFiles = Record<WorldFile, string>;

const genesisSchema = z.object({
  archetype: z.enum(ARCHETYPES),
  physics: z.enum(PHYSICS_MODES),
  language: z.string().min(1),
  seed: z.number(),
  intent: z.string(),
  createdAt: z.string().min(1),
});

const metaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  archetype: z.enum(ARCHETYPES),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  floor: z.number().int(),
  mutation: z
    .object({
      skyColor: z.string().nullable(),
      fogDensity: z.number().nullable(),
      biome: z.enum(BIOMES).nullable(),
    })
    .nullable()
    .optional(),
  flags: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  mods: z.array(z.string()).optional(),
});

const itemSchema = z.object({
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
const inventorySchema = z.object({ items: z.array(itemSchema), materials: z.array(z.string()) });
const karmaSchema = z.object({
  at: z.string().min(1),
  floor: z.number(),
  npcId: z.string().nullable(),
  choice: z.string(),
  action: z.enum([...CHOICE_ACTIONS, "wish", "genesis", "floor"] as const),
  effect: z.string(),
});

const CORRUPT_HINT = "The file decrypted, but it is not a zip of an UNMAPPED world.";

export function packFiles(files: WorldFiles): Bytes {
  const entries: Zippable = {};
  for (const name of WORLD_FILE_NAMES) entries[name] = strToU8(files[name]);
  return zipSync(entries);
}

function entry(raw: Unzipped, name: WorldFile): string | null {
  const bytes = raw[name];
  return bytes === undefined ? null : strFromU8(bytes);
}

export function unpackFiles(zipped: Bytes): Result<WorldFiles> {
  let raw: Unzipped;
  try {
    raw = unzipSync(zipped);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return err("seed-corrupt", `Could not unzip the seed: ${message}`, CORRUPT_HINT);
  }
  const scene = entry(raw, WORLD_FILES.scene);
  const genesis = entry(raw, WORLD_FILES.genesis);
  const karma = entry(raw, WORLD_FILES.karma);
  const inventory = entry(raw, WORLD_FILES.inventory);
  const meta = entry(raw, WORLD_FILES.meta);
  const known = new Set<string>(WORLD_FILE_NAMES);
  const extra = Object.keys(raw).filter((name) => !name.endsWith("/") && !known.has(name));
  if (extra.length > 0) {
    return err(
      "seed-unknown-file",
      `Unexpected entries in the seed: ${extra.join(", ")}.`,
      CORRUPT_HINT,
    );
  }
  const missing = WORLD_FILE_NAMES.filter((name) => raw[name] === undefined);
  if (scene === null || genesis === null || karma === null || inventory === null || meta === null) {
    return err("seed-incomplete", `Seed is missing ${missing.join(", ")}.`, CORRUPT_HINT);
  }
  const files = {
    [WORLD_FILES.scene]: scene,
    [WORLD_FILES.genesis]: genesis,
    [WORLD_FILES.karma]: karma,
    [WORLD_FILES.inventory]: inventory,
    [WORLD_FILES.meta]: meta,
  } satisfies WorldFiles;
  const valid = validateSeedFiles(files);
  return valid.ok ? ok(files) : valid;
}

async function readWorldFiles(api: SeedApi, worldId: string): Promise<Result<WorldFiles>> {
  const collected = new Map<WorldFile, string>();
  for (const name of WORLD_FILE_NAMES) {
    const read = await api.worlds.read(worldId, name);
    if (!read.ok) return read;
    collected.set(name, read.value);
  }
  const files = unpackable(collected);
  return files === null
    ? err("world-incomplete", `World ${worldId} did not return every dotfile.`, "Reopen the world.")
    : ok(files);
}

function unpackable(collected: Map<WorldFile, string>): WorldFiles | null {
  const scene = collected.get(WORLD_FILES.scene);
  const genesis = collected.get(WORLD_FILES.genesis);
  const karma = collected.get(WORLD_FILES.karma);
  const inventory = collected.get(WORLD_FILES.inventory);
  const meta = collected.get(WORLD_FILES.meta);
  if (
    scene === undefined ||
    genesis === undefined ||
    karma === undefined ||
    inventory === undefined ||
    meta === undefined
  ) {
    return null;
  }
  return {
    [WORLD_FILES.scene]: scene,
    [WORLD_FILES.genesis]: genesis,
    [WORLD_FILES.karma]: karma,
    [WORLD_FILES.inventory]: inventory,
    [WORLD_FILES.meta]: meta,
  };
}

function parseJson(text: string, file: WorldFile): Result<unknown> {
  try {
    return ok(JSON.parse(text));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return err("seed-bad-json", `${file} is not valid JSON: ${message}`, CORRUPT_HINT);
  }
}

function readMeta(text: string): Result<WorldMeta> {
  const json = parseJson(text, WORLD_FILES.meta);
  if (!json.ok) return json;
  const parsed = metaSchema.safeParse(json.value);
  return parsed.success
    ? ok({
        ...parsed.data,
        mutation: parsed.data.mutation ?? null,
        flags: parsed.data.flags ?? {},
        mods: parsed.data.mods ?? [],
      })
    : err("seed-bad-meta", parsed.error.issues.map((i) => i.message).join("; "), CORRUPT_HINT);
}

function validateSeedFiles(files: WorldFiles): Result<null> {
  const meta = readMeta(files[WORLD_FILES.meta]);
  if (!meta.ok) return meta;
  const genesis = readGenesis(files[WORLD_FILES.genesis]);
  if (!genesis.ok) return genesis;
  const scene = parseScene(files[WORLD_FILES.scene]);
  if (!scene.ok) return err("seed-bad-scene", scene.error.message, CORRUPT_HINT);

  const inventory = parseJson(files[WORLD_FILES.inventory], WORLD_FILES.inventory);
  if (!inventory.ok) return inventory;
  if (!inventorySchema.safeParse(inventory.value).success) {
    return err("seed-bad-inventory", "inventory.json has an invalid shape.", CORRUPT_HINT);
  }

  for (const [index, line] of files[WORLD_FILES.karma].split("\n").entries()) {
    if (line.trim().length === 0) continue;
    const parsed = parseJson(line, WORLD_FILES.karma);
    if (!parsed.ok) return parsed;
    if (!karmaSchema.safeParse(parsed.value).success) {
      return err(
        "seed-bad-karma",
        `karma.jsonl line ${index + 1} has an invalid shape.`,
        CORRUPT_HINT,
      );
    }
  }
  return ok(null);
}

function readGenesis(text: string): Result<Genesis> {
  const json = parseJson(text, WORLD_FILES.genesis);
  if (!json.ok) return json;
  const parsed = genesisSchema.safeParse(json.value);
  return parsed.success
    ? ok(parsed.data)
    : err("seed-bad-genesis", parsed.error.issues.map((i) => i.message).join("; "), CORRUPT_HINT);
}

function fileBase(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, "-").trim();
  return cleaned.length > 0 ? cleaned : "world";
}

/** Reads the world's dotfiles, zips, encrypts, and hands the blob to the OS save dialog. */
export async function exportEncryptedSeed(
  worldId: string,
  key: KeyLike,
): Promise<Result<{ path: string } | null>> {
  const api = seedApi();
  if (!api.ok) return api;
  const files = await readWorldFiles(api.value, worldId);
  if (!files.ok) return files;
  const meta = readMeta(files.value[WORLD_FILES.meta]);
  if (!meta.ok) return meta;

  const encrypted = await encryptBytes(key, packFiles(files.value));
  const saved = await api.value.app.saveFile({
    title: translate("identity.exportSeedDialog"),
    defaultName: `${fileBase(meta.value.name)}.seed.enc`,
    base64: toBase64(encrypted),
  });
  if (!saved.ok) return saved;
  return ok(saved.value);
}

/** Decrypt → unzip → validate → create the world → restore karma, inventory and floor. */
export async function importEncryptedSeedBytes(
  bytes: Bytes,
  key: KeyLike,
): Promise<Result<WorldMeta>> {
  const api = seedApi();
  if (!api.ok) return api;
  const plain = await decryptBytes(key, bytes);
  if (!plain.ok) return plain;
  const files = unpackFiles(plain.value);
  if (!files.ok) return files;

  const meta = readMeta(files.value[WORLD_FILES.meta]);
  if (!meta.ok) return meta;
  const genesis = readGenesis(files.value[WORLD_FILES.genesis]);
  if (!genesis.ok) return genesis;

  const created = await api.value.worlds.create({
    name: `${meta.value.name} (restored)`,
    genesis: genesis.value,
    scene: files.value[WORLD_FILES.scene],
  });
  if (!created.ok) return created;

  const rollback = async <T extends WorldMeta>(failure: Result<T>): Promise<Result<WorldMeta>> => {
    await api.value.worlds.remove(created.value.id);
    return failure;
  };

  const karma = await api.value.worlds.write(
    created.value.id,
    WORLD_FILES.karma,
    files.value[WORLD_FILES.karma],
  );
  if (!karma.ok) return rollback(karma);
  const inventory = await api.value.worlds.write(
    created.value.id,
    WORLD_FILES.inventory,
    files.value[WORLD_FILES.inventory],
  );
  if (!inventory.ok) return rollback(inventory);

  const restored: WorldMeta = {
    ...inventory.value,
    floor: meta.value.floor,
    mutation: meta.value.mutation,
  };
  const written = await api.value.worlds.write(
    created.value.id,
    WORLD_FILES.meta,
    `${JSON.stringify(restored, null, 2)}\n`,
  );
  if (!written.ok) return rollback(written);
  return ok(restored);
}

/** Picks a `.seed.enc` from disk and restores it. `ok(null)` means the player cancelled. */
export async function importEncryptedSeed(key: KeyLike): Promise<Result<WorldMeta | null>> {
  const api = seedApi();
  if (!api.ok) return api;
  const picked = await api.value.app.pickFile({
    title: translate("identity.importSeedDialog"),
    extensions: ["enc"],
  });
  if (!picked.ok) return picked;
  if (picked.value === null) return ok(null);

  let bytes: Bytes;
  try {
    bytes = fromBase64(picked.value.base64);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return err(
      "seed-unreadable",
      `Could not decode ${picked.value.path}: ${message}`,
      CORRUPT_HINT,
    );
  }
  return importEncryptedSeedBytes(bytes, key);
}
