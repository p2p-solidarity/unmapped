// Dotfiles are the save format (Rule 9). Pure `node:fs/promises` logic with no electron import so
// vitest can drive it against a tmpdir. Every write is announced to the write log so the chokidar
// watcher can tell our own saves from a player editing a file in their text editor.

import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CreateWorldInput } from "@shared/ipc";
import { err, fail, ok, type Result, toError } from "@shared/result";
import {
  EMPTY_INVENTORY,
  WORLD_FILE_NAMES,
  WORLD_FILES,
  type WorldFile,
  type WorldMeta,
} from "@shared/world";
import { isWorldFile, isWorldId, makeWorldId, worldDir, worldFilePath } from "./paths";
import { createWorldInputSchema, parseMetaText, validateFileContent } from "./schemas";
import { noteWrite } from "./writeLog";

export type WorldFiles = Record<WorldFile, string>;

const ID_HINT = "World ids look like `my-world-m4k2p1`; pick one from worlds.list().";

async function writeText(path: string, content: string): Promise<void> {
  await writeFile(path, content, "utf8");
  noteWrite(path);
}

async function writeWorldFilesAtomically(
  worldsDir: string,
  worldId: string,
  files: WorldFiles,
): Promise<Result<void>> {
  const destination = worldDir(worldsDir, worldId);
  const staging = join(worldsDir, `.staging-${worldId}-${process.pid}-${Date.now()}`);
  try {
    await mkdir(staging, { recursive: false });
    for (const file of WORLD_FILE_NAMES) {
      await writeFile(join(staging, file), files[file], "utf8");
    }
    await rename(staging, destination);
    for (const file of WORLD_FILE_NAMES) noteWrite(join(destination, file));
    return ok(undefined);
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    return fail(toError(error, "world-write-failed"));
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function guardId(worldId: string): Result<string> {
  if (!isWorldId(worldId))
    return err("world-id-invalid", `"${worldId}" is not a world id`, ID_HINT);
  return ok(worldId);
}

function guardFile(file: string): Result<WorldFile> {
  if (!isWorldFile(file)) {
    return err(
      "world-file-unknown",
      `"${file}" is not a world file`,
      `Expected one of ${WORLD_FILE_NAMES.join(", ")}.`,
    );
  }
  return ok(file);
}

export async function ensureWorldsDir(worldsDir: string): Promise<Result<string>> {
  try {
    await mkdir(worldsDir, { recursive: true });
    return ok(worldsDir);
  } catch (error) {
    return fail(toError(error, "worlds-dir-failed"));
  }
}

/** An empty list is a legitimate `ready` state — never seed a sample world (Rule 2). */
export async function listWorlds(worldsDir: string): Promise<Result<WorldMeta[]>> {
  let names: string[];
  try {
    const entries = await readdir(worldsDir, { withFileTypes: true });
    names = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return ok([]);
  }
  const metas: WorldMeta[] = [];
  for (const name of names) {
    if (!isWorldId(name)) continue;
    let raw: string;
    try {
      raw = await readFile(worldFilePath(worldsDir, name, WORLD_FILES.meta), "utf8");
    } catch {
      continue;
    }
    const parsed = parseMetaText(raw);
    if (parsed.ok) metas.push({ ...parsed.value, id: name });
  }
  metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return ok(metas);
}

function initialFiles(meta: WorldMeta, genesis: unknown, scene: string): WorldFiles {
  return {
    [WORLD_FILES.meta]: `${JSON.stringify(meta, null, 2)}\n`,
    [WORLD_FILES.genesis]: `${JSON.stringify(genesis, null, 2)}\n`,
    [WORLD_FILES.scene]: scene.endsWith("\n") ? scene : `${scene}\n`,
    [WORLD_FILES.karma]: "",
    [WORLD_FILES.inventory]: `${JSON.stringify(EMPTY_INVENTORY, null, 2)}\n`,
  };
}

export async function createWorld(
  worldsDir: string,
  input: CreateWorldInput,
  now: Date = new Date(),
): Promise<Result<WorldMeta>> {
  const parsed = createWorldInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return err(
      "world-input-invalid",
      issue?.message ?? "invalid world input",
      "name, genesis and scene are all required.",
    );
  }
  const validScene = validateFileContent(WORLD_FILES.scene, parsed.data.scene);
  if (!validScene.ok) return validScene;
  const at = now.toISOString();
  const id = makeWorldId(parsed.data.name, now.getTime());
  const dir = worldDir(worldsDir, id);
  const meta: WorldMeta = {
    id,
    name: parsed.data.name,
    archetype: parsed.data.genesis.archetype,
    createdAt: at,
    updatedAt: at,
    floor: 1,
    mutation: null,
    flags: {},
    mods: [],
  };
  try {
    await mkdir(worldsDir, { recursive: true });
    if (await exists(dir)) throw new Error("world directory already exists");
  } catch (error) {
    return err(
      "world-exists",
      `A world directory named ${id} already exists`,
      `Delete ${dir} or rename the world. (${toError(error).message})`,
    );
  }
  const files = initialFiles(meta, parsed.data.genesis, parsed.data.scene);
  const written = await writeWorldFilesAtomically(worldsDir, id, files);
  return written.ok ? ok(meta) : written;
}

export async function readWorldFile(
  worldsDir: string,
  worldId: string,
  file: string,
): Promise<Result<string>> {
  const id = guardId(worldId);
  if (!id.ok) return id;
  const name = guardFile(file);
  if (!name.ok) return name;
  try {
    return ok(await readFile(worldFilePath(worldsDir, id.value, name.value), "utf8"));
  } catch (error) {
    return err(
      "world-file-missing",
      `${worldId}/${file} could not be read`,
      `The world directory may have been deleted outside the app. (${toError(error).message})`,
    );
  }
}

/** Writes one dotfile after validating its shape, then stamps `meta.updatedAt`. */
export async function writeWorldFile(
  worldsDir: string,
  worldId: string,
  file: string,
  content: string,
  now: Date = new Date(),
): Promise<Result<WorldMeta>> {
  const id = guardId(worldId);
  if (!id.ok) return id;
  const name = guardFile(file);
  if (!name.ok) return name;
  const dir = worldDir(worldsDir, id.value);
  if (!(await exists(dir))) {
    return err("world-missing", `World ${worldId} does not exist`, ID_HINT);
  }
  const valid = validateFileContent(name.value, content);
  if (!valid.ok) return valid;
  try {
    await writeText(worldFilePath(worldsDir, id.value, name.value), content);
  } catch (error) {
    return fail(toError(error, "world-write-failed"));
  }
  return touchMeta(worldsDir, id.value, now);
}

/** Re-reads `meta.json`, refreshes `updatedAt` and keeps `id` in sync with the directory name. */
export async function touchMeta(
  worldsDir: string,
  worldId: string,
  now: Date = new Date(),
): Promise<Result<WorldMeta>> {
  const path = worldFilePath(worldsDir, worldId, WORLD_FILES.meta);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    return err(
      "world-meta-missing",
      `${worldId}/${WORLD_FILES.meta} could not be read`,
      `Restore it from a .seed export. (${toError(error).message})`,
    );
  }
  const parsed = parseMetaText(raw);
  if (!parsed.ok) return parsed;
  const meta: WorldMeta = { ...parsed.value, id: worldId, updatedAt: now.toISOString() };
  try {
    await writeText(path, `${JSON.stringify(meta, null, 2)}\n`);
  } catch (error) {
    return fail(toError(error, "world-write-failed"));
  }
  return ok(meta);
}

export async function removeWorld(worldsDir: string, worldId: string): Promise<Result<void>> {
  const id = guardId(worldId);
  if (!id.ok) return id;
  const dir = worldDir(worldsDir, id.value);
  if (!(await exists(dir))) {
    return err("world-missing", `World ${worldId} does not exist`, ID_HINT);
  }
  for (const file of WORLD_FILE_NAMES) noteWrite(worldFilePath(worldsDir, id.value, file));
  try {
    await rm(dir, { recursive: true, force: true });
    return ok(undefined);
  } catch (error) {
    return fail(toError(error, "world-remove-failed"));
  }
}

/** Imports the five files of an unpacked `.seed` as a brand new world with a fresh id. */
export async function importWorldFiles(
  worldsDir: string,
  files: WorldFiles,
  now: Date = new Date(),
): Promise<Result<WorldMeta>> {
  for (const file of WORLD_FILE_NAMES) {
    const valid = validateFileContent(file, files[file]);
    if (!valid.ok) return valid;
  }
  const source = parseMetaText(files[WORLD_FILES.meta]);
  if (!source.ok) return source;
  const at = now.toISOString();
  const id = makeWorldId(source.value.name, now.getTime());
  const meta: WorldMeta = {
    id,
    name: source.value.name,
    archetype: source.value.archetype,
    createdAt: source.value.createdAt,
    updatedAt: at,
    floor: source.value.floor,
    mutation: source.value.mutation,
    flags: source.value.flags,
    mods: source.value.mods,
  };
  try {
    await mkdir(worldsDir, { recursive: true });
    if (await exists(worldDir(worldsDir, id))) throw new Error("world directory already exists");
  } catch (error) {
    return err(
      "world-exists",
      `A world directory named ${id} already exists`,
      `Try the import again in a moment. (${toError(error).message})`,
    );
  }
  const importedFiles: WorldFiles = {
    ...files,
    [WORLD_FILES.meta]: `${JSON.stringify(meta, null, 2)}\n`,
  };
  const written = await writeWorldFilesAtomically(worldsDir, id, importedFiles);
  return written.ok ? ok(meta) : written;
}
