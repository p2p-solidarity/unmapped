// My worlds as one list (Worlds → My worlds): the player sees worlds, never saves, cartridges or
// versions. Row 0 starts a new adventure on the built-in world; then every save, newest first;
// then every installed world nobody has played yet (the newest version of each cartridge id). Each
// cartridge id's other versions and its drafts hang under the one row that stands for it (its
// "head": row 0 for the built-in world, else its newest save, else its own row), behind 更多.
// Pure: no React, no window.seed.

import {
  type CartridgeManifest,
  compareCartridgeVersions,
  ENGINE_API_VERSION,
  type InstanceMeta,
  SAVE_SCHEMA_VERSION,
  type WorkspaceMeta,
} from "@shared/cartridge";
import type { LibraryData } from "../title/useLibrary";

/** Everything installed for one cartridge id: its revisions (newest first) and its drafts. */
export interface WorldGroup {
  cartridgeId: string;
  revisions: CartridgeManifest[];
  drafts: WorkspaceMeta[];
}

export type WorldRow =
  | { kind: "save"; key: string; save: InstanceMeta; group: WorldGroup | null; head: boolean }
  | {
      kind: "world";
      key: string;
      /** The newest revision this build can play; null when every one needs a newer app. */
      playable: CartridgeManifest | null;
      newest: CartridgeManifest;
      group: WorldGroup;
    };

export interface WorldList {
  /** The built-in world's own group (row 0's 更多), when it is installed. */
  builtIn: WorldGroup | null;
  rows: WorldRow[];
  /** Drafts whose world has no row here (listed in the list's own 更多). */
  orphanDrafts: WorkspaceMeta[];
}

export function isCompatible(manifest: CartridgeManifest): boolean {
  return (
    manifest.engineApiVersion <= ENGINE_API_VERSION &&
    manifest.saveSchemaVersion === SAVE_SCHEMA_VERSION
  );
}

function groupsOf(library: LibraryData): Map<string, WorldGroup> {
  const groups = new Map<string, WorldGroup>();
  const group = (cartridgeId: string): WorldGroup => {
    let found = groups.get(cartridgeId);
    if (found === undefined) {
      found = { cartridgeId, revisions: [], drafts: [] };
      groups.set(cartridgeId, found);
    }
    return found;
  };
  for (const manifest of library.cartridges) group(manifest.cartridgeId).revisions.push(manifest);
  for (const one of groups.values()) {
    one.revisions.sort((a, b) => compareCartridgeVersions(b.version, a.version));
  }
  for (const workspace of library.workspaces) {
    const base = groups.get(workspace.base.cartridgeId);
    if (base !== undefined) base.drafts.push(workspace);
  }
  return groups;
}

/** The rows of My worlds; `builtInId` is the built-in world's cartridge id once it is known. */
export function worldList(library: LibraryData, builtInId: string | null): WorldList {
  const groups = groupsOf(library);
  const headed = new Set<string>();
  if (builtInId !== null) headed.add(builtInId);
  const rows: WorldRow[] = [];
  for (const save of library.instances) {
    const id = save.cartridge.cartridgeId;
    const head = !headed.has(id);
    headed.add(id);
    rows.push({
      kind: "save",
      key: `save:${save.instanceId}`,
      save,
      group: groups.get(id) ?? null,
      head,
    });
  }
  for (const group of groups.values()) {
    const newest = group.revisions[0];
    if (headed.has(group.cartridgeId) || newest === undefined) continue;
    headed.add(group.cartridgeId);
    const playable = group.revisions.find(isCompatible) ?? null;
    rows.push({ kind: "world", key: `world:${group.cartridgeId}`, playable, newest, group });
  }
  // Every group has a head row (row 0, a save or its own), so only a draft of a world that is no
  // longer installed has nowhere to hang.
  const orphanDrafts = library.workspaces.filter(
    (workspace) => !groups.has(workspace.base.cartridgeId),
  );
  const builtIn = builtInId === null ? null : (groups.get(builtInId) ?? null);
  return { builtIn, rows, orphanDrafts };
}

/**
 * A save's name as the player reads it: New game names a save "<world> · ABCD-EFGH" (the seed),
 * and a run started elsewhere "<world> run"; the row shows just the world.
 */
export function plainSaveName(name: string): string {
  return name
    .replace(/\s·\s[A-HJ-NP-Z2-9]{4}-?[A-HJ-NP-Z2-9]{4}$/, "")
    .replace(/\srun$/, "")
    .trim();
}

/**
 * Each row's name: a save's ENS name when it has one, else its plain name; a cartridge's name.
 * Names that would read the same get "(2nd)"-style numbers, oldest first, via `numbered`.
 */
export function rowNames(
  rows: readonly WorldRow[],
  ensNames: ReadonlyMap<string, string | null>,
  numbered: (name: string, n: number) => string,
): Map<string, string> {
  const base = new Map<string, string>();
  for (const row of rows) {
    base.set(
      row.key,
      row.kind === "save"
        ? (ensNames.get(row.save.instanceId) ?? plainSaveName(row.save.name))
        : row.newest.name,
    );
  }
  const byName = new Map<string, WorldRow[]>();
  for (const row of rows) {
    const name = base.get(row.key) ?? "";
    byName.set(name, [...(byName.get(name) ?? []), row]);
  }
  const out = new Map(base);
  for (const [name, same] of byName) {
    if (same.length < 2) continue;
    const oldestFirst = [...same].sort((a, b) => since(a).localeCompare(since(b)));
    oldestFirst.forEach((row, index) => {
      out.set(row.key, numbered(name, index + 1));
    });
  }
  return out;
}

function since(row: WorldRow): string {
  return row.kind === "save" ? row.save.createdAt : `~${row.newest.cartridgeId}`;
}
