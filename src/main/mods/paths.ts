// Path rules for the mod install directory. A mod is untrusted content that arrived as a zip or a
// folder the player dropped in, so every name and every entry inside it is checked here before any
// filesystem call sees it: no traversal, no absolute paths, no surprise binaries.

import { join } from "node:path";
import { MOD_MANIFEST_FILE } from "@shared/mods";

export const MODS_DIR_NAME = "mods";

/** Prompt and skill markdown is small. Anything larger is not what this format is for. */
export const MAX_MOD_FILE_BYTES = 1024 * 1024;

/** The only extensions ever copied into the install directory. Mods never ship executable code. */
export const MOD_FILE_EXTENSIONS = [".yml", ".md", ".txt", ".json"] as const;

/** How deep we will walk a mod folder while collecting its files. */
export const MAX_MOD_DEPTH = 6;

const MOD_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export const MOD_NAME_HINT =
  "A mod name is 1–64 characters of lowercase letters, digits, dot, dash or underscore.";

export function modsDir(userData: string): string {
  return join(userData, MODS_DIR_NAME);
}

export function isModName(value: string): boolean {
  return MOD_NAME.test(value) && value !== "." && value !== "..";
}

export function modDir(dir: string, name: string): string {
  return join(dir, name);
}

export function manifestPath(dir: string, name: string): string {
  return join(modDir(dir, name), MOD_MANIFEST_FILE);
}

/**
 * True for a relative POSIX path that stays inside the mod: no leading slash, no drive letter, no
 * `.`/`..` segment, no backslash (a Windows separator inside a zip entry hides traversal), no NUL.
 */
export function isSafeRelativePath(path: string): boolean {
  if (path.length === 0 || path.length > 255) return false;
  if (path.includes("\0") || path.includes("\\")) return false;
  if (path.startsWith("/") || /^[a-zA-Z]:/.test(path)) return false;
  const segments = path.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

export function hasModExtension(path: string): boolean {
  return MOD_FILE_EXTENSIONS.some((extension) => path.toLowerCase().endsWith(extension));
}

/** Resolves a validated relative path against a base directory. */
export function insidePath(base: string, relative: string): string {
  return join(base, ...relative.split("/"));
}
