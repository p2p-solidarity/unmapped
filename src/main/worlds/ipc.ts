// `worlds:*` handlers. Every payload is zod-validated here; the store itself assumes nothing about
// the renderer (Rule 6 — the renderer is untrusted once mods and P2P exist).

import { IPC } from "@shared/ipc";
import { z } from "zod";
import type { MainContext } from "../context";
import { handle } from "../handle";
import { createWorldInputSchema, worldFileSchema, worldIdSchema } from "./schemas";
import { createWorld, listWorlds, readWorldFile, removeWorld, writeWorldFile } from "./store";
import { startWorldsWatcher } from "./watcher";

const MAX_FILE_BYTES = 4 * 1024 * 1024;

export function registerWorldsIpc(ctx: MainContext): void {
  handle(IPC.worlds.list, z.tuple([]), () => listWorlds(ctx.worldsDir));

  handle(IPC.worlds.create, z.tuple([createWorldInputSchema]), ([input]) =>
    createWorld(ctx.worldsDir, input),
  );

  handle(IPC.worlds.read, z.tuple([worldIdSchema, worldFileSchema]), ([worldId, file]) =>
    readWorldFile(ctx.worldsDir, worldId, file),
  );

  handle(
    IPC.worlds.write,
    z.tuple([worldIdSchema, worldFileSchema, z.string().max(MAX_FILE_BYTES)]),
    ([worldId, file, content]) => writeWorldFile(ctx.worldsDir, worldId, file, content),
  );

  handle(IPC.worlds.remove, z.tuple([worldIdSchema]), ([worldId]) =>
    removeWorld(ctx.worldsDir, worldId),
  );

  startWorldsWatcher(ctx);
}
