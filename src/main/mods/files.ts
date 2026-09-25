// Reading a mod's files out of a folder or a `.mod` zip, and writing them into the install
// directory. Everything is gathered into memory first so a mod is validated *before* a single byte
// lands in `<userData>/mods` — a half-copied mod would be a broken install the player has to clean
// up by hand.

import type { Stats } from "node:fs";
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MOD_MANIFEST_FILE } from "@shared/mods";
import { err, fail, ok, type Result, toError } from "@shared/result";
import { strFromU8, unzipSync } from "fflate";
import {
  hasModExtension,
  insidePath,
  isSafeRelativePath,
  MAX_MOD_DEPTH,
  MAX_MOD_FILE_BYTES,
  MOD_FILE_EXTENSIONS,
  modDir,
} from "./paths";

/** Relative POSIX path → UTF-8 content, for every file of a mod that we are willing to keep. */
export type ModFiles = Record<string, string>;

const EXTENSION_HINT = `A mod may only contain ${MOD_FILE_EXTENSIONS.join(", ")} files.`;
const SIZE_HINT = `Mod files are prompt and skill text; the limit is ${
  MAX_MOD_FILE_BYTES / 1024
} KB per file.`;

function tooLarge(path: string, bytes: number): Result<never> {
  return err("mod-file-too-large", `${path} is ${bytes} bytes`, SIZE_HINT);
}

function unsafe(path: string): Result<never> {
  return err(
    "mod-path-unsafe",
    `Refusing the entry "${path}"`,
    "Mod entries must be relative paths inside the mod folder.",
  );
}

/** Walks a mod folder, keeping only the text files a mod is allowed to ship. */
export async function collectDirFiles(src: string): Promise<Result<ModFiles>> {
  const files: ModFiles = {};
  const walk = async (dir: string, prefix: string, depth: number): Promise<Result<null>> => {
    if (depth > MAX_MOD_DEPTH) return ok(null);
    let entries: string[];
    try {
      entries = await readdir(dir, { encoding: "utf8" });
    } catch (error) {
      return err("mod-unreadable", `Could not read ${dir}`, toError(error).message);
    }
    for (const entry of entries) {
      if (entry.startsWith(".")) continue;
      const relative = prefix.length === 0 ? entry : `${prefix}/${entry}`;
      if (!isSafeRelativePath(relative)) return unsafe(relative);
      const full = join(dir, entry);
      let info: Stats;
      try {
        info = await lstat(full);
      } catch (error) {
        return err("mod-unreadable", `Could not read ${relative}`, toError(error).message);
      }
      // Symlinks are the other way out of the folder; a mod never needs one.
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) {
        const nested = await walk(full, relative, depth + 1);
        if (!nested.ok) return nested;
        continue;
      }
      if (!info.isFile() || !hasModExtension(relative)) continue;
      if (info.size > MAX_MOD_FILE_BYTES) return tooLarge(relative, info.size);
      try {
        files[relative] = await readFile(full, "utf8");
      } catch (error) {
        return err("mod-unreadable", `Could not read ${relative}`, toError(error).message);
      }
    }
    return ok(null);
  };

  const walked = await walk(src, "", 0);
  if (!walked.ok) return walked;
  if (files[MOD_MANIFEST_FILE] === undefined) {
    return err(
      "mod-manifest-missing",
      `No ${MOD_MANIFEST_FILE} in ${src}`,
      `A mod folder has ${MOD_MANIFEST_FILE} at its top level.`,
    );
  }
  return ok(files);
}

/**
 * Finds the prefix every zip entry shares. A `.mod` is either the mod folder's contents at the zip
 * root or exactly one top-level folder containing them — anything else is ambiguous.
 */
export function zipRoot(names: string[]): Result<string> {
  if (names.includes(MOD_MANIFEST_FILE)) return ok("");
  const roots = names
    .filter((name) => name.endsWith(`/${MOD_MANIFEST_FILE}`))
    .map((name) => name.slice(0, -MOD_MANIFEST_FILE.length));
  const root = roots[0];
  if (root === undefined || roots.length > 1 || root.split("/").length !== 2) {
    return err(
      "mod-manifest-missing",
      `The archive has no ${MOD_MANIFEST_FILE}`,
      `A .mod holds ${MOD_MANIFEST_FILE} at its root or inside a single top-level folder.`,
    );
  }
  return ok(root);
}

export function collectZipFiles(bytes: Uint8Array): Result<ModFiles> {
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes);
  } catch (error) {
    return err(
      "mod-unreadable",
      "That file is not a readable .mod archive",
      `Export it again, or install the mod folder instead. (${toError(error).message})`,
    );
  }
  const names = Object.keys(unzipped).filter((name) => !name.endsWith("/"));
  const root = zipRoot(names);
  if (!root.ok) return root;

  const files: ModFiles = {};
  for (const name of names) {
    // A traversal entry is an attack, not a stray file: refuse the whole archive.
    if (name.includes("..") || name.includes("\\") || name.startsWith("/")) return unsafe(name);
    if (!name.startsWith(root.value)) return unsafe(name);
    const relative = name.slice(root.value.length);
    if (!isSafeRelativePath(relative)) return unsafe(name);
    if (!hasModExtension(relative)) {
      return err("mod-file-rejected", `Refusing "${relative}"`, EXTENSION_HINT);
    }
    const raw = unzipped[name];
    if (raw === undefined) continue;
    if (raw.byteLength > MAX_MOD_FILE_BYTES) return tooLarge(relative, raw.byteLength);
    files[relative] = strFromU8(raw);
  }
  if (files[MOD_MANIFEST_FILE] === undefined) {
    return err(
      "mod-manifest-missing",
      `The archive has no ${MOD_MANIFEST_FILE}`,
      `A .mod holds ${MOD_MANIFEST_FILE} at its root or inside a single top-level folder.`,
    );
  }
  return ok(files);
}

/**
 * Writes an already-validated set of files as `<modsDir>/<name>`, staging first so a failed copy
 * cannot leave a partial mod behind and an upgrade never removes the old one until the new one is
 * fully on disk.
 */
export async function writeModFiles(
  dir: string,
  name: string,
  files: ModFiles,
): Promise<Result<string>> {
  const destination = modDir(dir, name);
  const staging = join(dir, `.staging-${name}-${process.pid}-${Date.now()}`);
  const replaced = `${staging}-replaced`;
  try {
    await mkdir(dir, { recursive: true });
    await mkdir(staging, { recursive: false });
    for (const [relative, content] of Object.entries(files)) {
      const target = insidePath(staging, relative);
      await mkdir(join(target, ".."), { recursive: true });
      await writeFile(target, content, "utf8");
    }
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    return fail(toError(error, "mod-write-failed"));
  }

  let swapped = false;
  try {
    await rename(destination, replaced).catch(() => undefined);
    await rename(staging, destination);
    swapped = true;
  } catch (error) {
    // Put the previous install back rather than leaving the player with neither version.
    if (!swapped) await rename(replaced, destination).catch(() => undefined);
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    return fail(toError(error, "mod-write-failed"));
  }
  await rm(replaced, { recursive: true, force: true }).catch(() => undefined);
  return ok(destination);
}
