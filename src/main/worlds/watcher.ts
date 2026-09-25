// Hand-editing a dotfile in a text editor must hot-reload the game (Rule 9). chokidar watches
// `<userData>/worlds` two levels deep and broadcasts a `WorldChangedEvent`; writes the main process
// made itself are dropped so a save does not echo back as an external edit.

import { IPC, type WorldChangedEvent } from "@shared/ipc";
import { type FSWatcher, watch } from "chokidar";
import type { MainContext } from "../context";
import { mapChangedPath } from "./paths";
import { wasSelfWrite } from "./writeLog";

const STABILITY_THRESHOLD_MS = 150;
const POLL_INTERVAL_MS = 50;

export function startWorldsWatcher(ctx: MainContext): FSWatcher {
  const watcher = watch(ctx.worldsDir, {
    depth: 2,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: STABILITY_THRESHOLD_MS,
      pollInterval: POLL_INTERVAL_MS,
    },
  });

  const emit = (kind: WorldChangedEvent["kind"]) => (path: string) => {
    if (wasSelfWrite(path)) return;
    const mapped = mapChangedPath(ctx.worldsDir, path);
    if (mapped === null) return;
    const event: WorldChangedEvent = { worldId: mapped.worldId, file: mapped.file, kind };
    ctx.broadcast(IPC.worlds.changed, event);
  };

  watcher.on("add", emit("add"));
  watcher.on("change", emit("change"));
  watcher.on("unlink", emit("unlink"));
  watcher.on("error", (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`worlds watcher: ${message}\n`);
  });

  ctx.onBeforeQuit(async () => {
    await watcher.close();
  });

  return watcher;
}
