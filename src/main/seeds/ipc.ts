// `worlds:export-seed` / `worlds:import-seed`. The OS dialogs live here; the zip format lives in
// `./pack.ts`. Cancelling a dialog is an `err("cancelled", …)`, never a silent no-op.

import { readFile, writeFile } from "node:fs/promises";
import { IPC, type SeedExport } from "@shared/ipc";
import { err, fail, ok, type Result, toError } from "@shared/result";
import { WORLD_FILES, type WorldMeta } from "@shared/world";
import { dialog } from "electron";
import { z } from "zod";
import type { MainContext } from "../context";
import { handle } from "../handle";
import { slug, worldDir } from "../worlds/paths";
import { parseMetaText, worldIdSchema } from "../worlds/schemas";
import { importWorldFiles, readWorldFile } from "../worlds/store";
import { packWorld, unpackSeed } from "./pack";

const SEED_FILTER = [{ name: "UNMAPPED seed", extensions: ["seed"] }];
const CANCEL_HINT = "Choose a file to continue, or pick the action again when you are ready.";

async function defaultSeedName(ctx: MainContext, worldId: string): Promise<string> {
  const raw = await readWorldFile(ctx.worldsDir, worldId, WORLD_FILES.meta);
  if (!raw.ok) return `${worldId}.seed`;
  const meta = parseMetaText(raw.value);
  return meta.ok ? `${slug(meta.value.name)}.seed` : `${worldId}.seed`;
}

async function exportSeed(ctx: MainContext, worldId: string): Promise<Result<SeedExport>> {
  const packed = await packWorld(worldDir(ctx.worldsDir, worldId));
  if (!packed.ok) return packed;
  const chosen = await dialog.showSaveDialog({
    title: "Export world seed",
    defaultPath: await defaultSeedName(ctx, worldId),
    filters: SEED_FILTER,
  });
  if (chosen.canceled || chosen.filePath === undefined || chosen.filePath.length === 0) {
    return err("cancelled", "Export cancelled", CANCEL_HINT);
  }
  try {
    await writeFile(chosen.filePath, packed.value);
  } catch (error) {
    return fail(toError(error, "seed-write-failed"));
  }
  return ok({ path: chosen.filePath, bytes: packed.value.byteLength });
}

async function importSeed(ctx: MainContext): Promise<Result<WorldMeta>> {
  const chosen = await dialog.showOpenDialog({
    title: "Import world seed",
    properties: ["openFile"],
    filters: SEED_FILTER,
  });
  const path = chosen.filePaths[0];
  if (chosen.canceled || path === undefined) {
    return err("cancelled", "Import cancelled", CANCEL_HINT);
  }
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (error) {
    return fail(toError(error, "seed-read-failed"));
  }
  const unpacked = unpackSeed(new Uint8Array(bytes));
  if (!unpacked.ok) return unpacked;
  return importWorldFiles(ctx.worldsDir, unpacked.value.files);
}

export function registerSeedIpc(ctx: MainContext): void {
  handle(IPC.worlds.exportSeed, z.tuple([worldIdSchema]), ([worldId]) => exportSeed(ctx, worldId));
  handle(IPC.worlds.importSeed, z.tuple([]), () => importSeed(ctx));
}
