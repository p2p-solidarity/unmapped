// Editing a mod's markdown in a text editor must reach the running game, exactly like a world
// dotfile does (Rule 9). chokidar watches `<userData>/mods` deep enough to see
// `skills/<skill>/SKILL.md` and broadcasts the mod's name; the renderer re-reads that bundle and
// remounts it.

import { IPC } from "@shared/ipc";
import { type FSWatcher, watch } from "chokidar";
import type { MainContext } from "../context";
import { isModName } from "./paths";

const STABILITY_THRESHOLD_MS = 150;
const POLL_INTERVAL_MS = 50;

export type ModChangeKind = "add" | "change" | "unlink";
export interface ModChangedEvent {
  name: string;
  kind: ModChangeKind;
}

/** `<modsDir>/<name>/…` → `<name>`; anything outside a well-named mod folder is ignored. */
export function modNameFromPath(dir: string, path: string): string | null {
  if (!path.startsWith(dir)) return null;
  const relative = path.slice(dir.length).replace(/^[\\/]+/, "");
  const name = relative.split(/[\\/]/)[0];
  if (name === undefined || name.length === 0 || !isModName(name)) return null;
  return name;
}

export function startModsWatcher(ctx: MainContext, dir: string): FSWatcher {
  const watcher = watch(dir, {
    depth: 3,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: STABILITY_THRESHOLD_MS,
      pollInterval: POLL_INTERVAL_MS,
    },
  });

  const emit = (kind: ModChangeKind) => (path: string) => {
    const name = modNameFromPath(dir, path);
    if (name === null) return;
    const event: ModChangedEvent = { name, kind };
    ctx.broadcast(IPC.mods.changed, event);
  };

  watcher.on("add", emit("add"));
  watcher.on("change", emit("change"));
  watcher.on("unlink", emit("unlink"));
  watcher.on("unlinkDir", emit("unlink"));
  watcher.on("error", (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`mods watcher: ${message}\n`);
  });

  ctx.onBeforeQuit(async () => {
    await watcher.close();
  });

  return watcher;
}
