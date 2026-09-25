// `mods:*` handlers. Install is the only one that opens a dialog: the player picks either a `.mod`
// archive or the mod folder itself, and cancelling is an `err("cancelled", …)` rather than a silent
// no-op (Rule 5).

import { mkdir, readFile, stat } from "node:fs/promises";
import { IPC } from "@shared/ipc";
import { MOD_PACK_EXTENSION, type ModSummary } from "@shared/mods";
import { err, fail, type Result, toError } from "@shared/result";
import { dialog } from "electron";
import { z } from "zod";
import type { MainContext } from "../context";
import { handle } from "../handle";
import { modsDir } from "./paths";
import { installFromDir, installFromZip, listMods, readModBundle, removeMod } from "./store";
import { startModsWatcher } from "./watcher";

const MOD_FILTER = [{ name: "Aether Spire mod", extensions: [MOD_PACK_EXTENSION] }];
const CANCEL_HINT = "Pick a .mod file or a mod folder to continue.";

const modNameSchema = z.string().min(1).max(64);

export async function installFromPath(path: string, dir: string): Promise<Result<ModSummary>> {
  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(path);
  } catch (error) {
    return fail(toError(error, "mod-unreadable"));
  }
  if (info.isDirectory()) return installFromDir(path, dir);
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (error) {
    return fail(toError(error, "mod-unreadable"));
  }
  return installFromZip(new Uint8Array(bytes), dir);
}

async function installWithDialog(dir: string): Promise<Result<ModSummary>> {
  const chosen = await dialog.showOpenDialog({
    title: "Install mod",
    properties: ["openFile", "openDirectory"],
    filters: MOD_FILTER,
  });
  const path = chosen.filePaths[0];
  if (chosen.canceled || path === undefined) {
    return err("cancelled", "Install cancelled", CANCEL_HINT);
  }
  return installFromPath(path, dir);
}

export function registerModsIpc(ctx: MainContext): void {
  const dir = modsDir(ctx.userData);
  // The directory must exist before the watcher attaches to it; a first-run miss would leave mod
  // hot-reload silently dead.
  void mkdir(dir, { recursive: true })
    .catch((error: unknown) => {
      process.stderr.write(`mods dir: ${toError(error).message}\n`);
    })
    .then(() => {
      startModsWatcher(ctx, dir);
    });

  handle(IPC.mods.list, z.tuple([]), () => listMods(dir));
  handle(IPC.mods.read, z.tuple([modNameSchema]), ([name]) => readModBundle(dir, name));
  handle(IPC.mods.install, z.tuple([]), () => installWithDialog(dir));
  handle(IPC.mods.remove, z.tuple([modNameSchema]), ([name]) => removeMod(dir, name));
}
