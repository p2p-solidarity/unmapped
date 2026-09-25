// Pure path vocabulary for `<userData>/worlds`. No electron, no fs — unit-testable and reused by
// the store, the chokidar watcher and the seed importer.

import { isAbsolute, join, relative } from "node:path";
import { WORLD_FILE_NAMES, type WorldFile } from "@shared/world";

/** A world id is `<slug>-<base36 timestamp>`; the guard also blocks path traversal. */
const WORLD_ID = /^[a-z0-9][a-z0-9-]{0,80}$/;
const MAX_SLUG = 40;

export function slug(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned.slice(0, MAX_SLUG).replace(/-+$/g, "") || "world" : "world";
}

export function makeWorldId(name: string, now: number = Date.now()): string {
  return `${slug(name)}-${now.toString(36)}`;
}

export function isWorldId(value: string): boolean {
  return WORLD_ID.test(value);
}

export function isWorldFile(value: string): value is WorldFile {
  return (WORLD_FILE_NAMES as readonly string[]).includes(value);
}

export function worldDir(worldsDir: string, worldId: string): string {
  return join(worldsDir, worldId);
}

export function worldFilePath(worldsDir: string, worldId: string, file: WorldFile): string {
  return join(worldsDir, worldId, file);
}

export interface ChangedPath {
  worldId: string;
  file: WorldFile;
}

/**
 * Maps an absolute path reported by chokidar back to `{ worldId, file }`. Returns null for
 * anything that is not exactly `<worldsDir>/<worldId>/<known world file>` — editor swap files,
 * nested directories and paths outside the worlds dir are ignored.
 */
export function mapChangedPath(worldsDir: string, absolutePath: string): ChangedPath | null {
  const rel = relative(worldsDir, absolutePath);
  if (rel.length === 0 || rel.startsWith("..") || isAbsolute(rel)) return null;
  const segments = rel.split(/[\\/]/);
  if (segments.length !== 2) return null;
  const [worldId, file] = segments;
  if (worldId === undefined || file === undefined) return null;
  if (!isWorldId(worldId) || !isWorldFile(file)) return null;
  return { worldId, file };
}
