// The mod install directory, as pure `node:fs/promises` logic with no electron import so vitest can
// drive it against a tmpdir. The harness owns what a manifest *means* (`parseModManifest` /
// `validateModBundle`); this module owns what is allowed to exist on disk.

import { readdir, rm, stat } from "node:fs/promises";
import { parseModManifest, validateModBundle } from "@harness";
import { MOD_MANIFEST_FILE, type ModBundle, type ModManifest, type ModSummary } from "@shared/mods";
import { err, ok, type Result, toError } from "@shared/result";
import { collectDirFiles, collectZipFiles, type ModFiles, writeModFiles } from "./files";
import { isModName, MOD_NAME_HINT, modDir } from "./paths";

const MISSING_HINT = "Install it from the Mods panel, or check <userData>/mods.";

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function guardName(name: string): Result<string> {
  if (!isModName(name))
    return err("mod-name-invalid", `"${name}" is not a mod name`, MOD_NAME_HINT);
  return ok(name);
}

function readManifest(files: ModFiles): Result<ModManifest> {
  const raw = files[MOD_MANIFEST_FILE];
  if (raw === undefined) {
    return err(
      "mod-manifest-missing",
      `No ${MOD_MANIFEST_FILE}`,
      `Every mod has a ${MOD_MANIFEST_FILE} manifest at its top level.`,
    );
  }
  const manifest = parseModManifest(raw);
  if (!manifest.ok) return manifest;
  if (!isModName(manifest.value.name)) {
    return err("mod-name-invalid", `"${manifest.value.name}" is not a mod name`, MOD_NAME_HINT);
  }
  return ok(manifest.value);
}

/**
 * The skill files a manifest's `skills` directories actually contain: a `<skill>/SKILL.md` bundle
 * or a flat `<name>.md`. Anything else in those directories is not a skill and is not offered to
 * the model.
 */
export function skillFiles(manifest: ModManifest, files: ModFiles): string[] {
  const found: string[] = [];
  for (const dir of manifest.skills) {
    const prefix = dir.endsWith("/") ? dir : `${dir}/`;
    for (const path of Object.keys(files)) {
      if (!path.startsWith(prefix) || !path.endsWith(".md")) continue;
      const rest = path.slice(prefix.length).split("/");
      const flat = rest.length === 1;
      const bundled = rest.length === 2 && rest[1] === "SKILL.md";
      if (flat || bundled) found.push(path);
    }
  }
  return [...new Set(found)].sort();
}

export function modSummary(bundle: ModBundle): ModSummary {
  const { manifest } = bundle;
  return {
    name: manifest.name,
    version: manifest.version,
    author: manifest.author,
    description: manifest.description,
    toolCount: manifest.tools.length,
    sectionCount: manifest.prompt.length,
    skillCount: skillFiles(manifest, bundle.files).length,
  };
}

/**
 * Turns a gathered file map into the bundle the renderer mounts: the manifest plus exactly the
 * prompt and skill files it references. A section pointing at a file that is not there is a broken
 * mod, not a mod with one missing section.
 */
export function buildBundle(dir: string, files: ModFiles): Result<ModBundle> {
  const manifest = readManifest(files);
  if (!manifest.ok) return manifest;

  const referenced: ModFiles = {};
  for (const section of manifest.value.prompt) {
    const content = files[section.file];
    if (content === undefined) {
      return err(
        "mod-file-missing",
        `Section "${section.name}" points at ${section.file}, which is not in the mod`,
        `Add ${section.file}, or drop the section from ${MOD_MANIFEST_FILE}.`,
      );
    }
    referenced[section.file] = content;
  }
  for (const path of skillFiles(manifest.value, files)) {
    referenced[path] = files[path] ?? "";
  }

  const bundle: ModBundle = { manifest: manifest.value, files: referenced, dir };
  const valid = validateModBundle(bundle);
  if (!valid.ok) return valid;
  return ok(bundle);
}

/** An empty list is a legitimate `ready` state — no demo mod is ever seeded (Rule 2). */
export async function listMods(dir: string): Promise<Result<ModSummary[]>> {
  let names: string[];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    names = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return ok([]);
  }
  const summaries: ModSummary[] = [];
  for (const name of names.sort()) {
    if (!isModName(name)) continue;
    const bundle = await readModBundle(dir, name);
    // A mod that no longer validates is skipped rather than hiding every other mod behind it; the
    // player sees it disappear from the list and can look at <userData>/mods.
    if (bundle.ok) summaries.push(modSummary(bundle.value));
  }
  return ok(summaries);
}

export async function readModBundle(dir: string, name: string): Promise<Result<ModBundle>> {
  const guarded = guardName(name);
  if (!guarded.ok) return guarded;
  const installed = modDir(dir, guarded.value);
  if (!(await exists(installed))) {
    return err("mod-missing", `No mod named "${name}" is installed`, MISSING_HINT);
  }
  const files = await collectDirFiles(installed);
  if (!files.ok) return files;
  const bundle = buildBundle(installed, files.value);
  if (!bundle.ok) return bundle;
  if (bundle.value.manifest.name !== guarded.value) {
    return err(
      "mod-name-mismatch",
      `The folder "${name}" holds a mod called "${bundle.value.manifest.name}"`,
      `Rename the folder to ${bundle.value.manifest.name}, or fix name: in ${MOD_MANIFEST_FILE}.`,
    );
  }
  return ok(bundle.value);
}

export async function removeMod(dir: string, name: string): Promise<Result<void>> {
  const guarded = guardName(name);
  if (!guarded.ok) return guarded;
  const installed = modDir(dir, guarded.value);
  if (!(await exists(installed))) {
    return err("mod-missing", `No mod named "${name}" is installed`, MISSING_HINT);
  }
  try {
    await rm(installed, { recursive: true, force: true });
    return ok(undefined);
  } catch (error) {
    return err("mod-remove-failed", `Could not remove ${name}`, toError(error).message);
  }
}

async function install(dir: string, files: ModFiles): Promise<Result<ModSummary>> {
  const manifest = readManifest(files);
  if (!manifest.ok) return manifest;
  const destination = modDir(dir, manifest.value.name);
  const bundle = buildBundle(destination, files);
  if (!bundle.ok) return bundle;
  const written = await writeModFiles(dir, manifest.value.name, files);
  if (!written.ok) return written;
  return ok(modSummary(bundle.value));
}

export async function installFromDir(src: string, dir: string): Promise<Result<ModSummary>> {
  const files = await collectDirFiles(src);
  if (!files.ok) return files;
  return install(dir, files.value);
}

export async function installFromZip(bytes: Uint8Array, dir: string): Promise<Result<ModSummary>> {
  const files = collectZipFiles(bytes);
  if (!files.ok) return files;
  return install(dir, files.value);
}
