import { readFile, writeFile } from "node:fs/promises";
import { IPC, type SeedExport } from "@shared/ipc";
import { err, fail, ok, type Result, toError } from "@shared/result";
import { dialog } from "electron";
import { z } from "zod";
import type { MainContext } from "../context";
import { handle } from "../handle";
import { manifestCore } from "./integrity";
import { packCartridge, unpackCartridge } from "./pack";
import { publishCartridgeInputSchema } from "./schemas";
import { listCartridgeRevisions, publishCartridgeRevision, readCartridgeRevision } from "./store";

const cartridgeIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const versionSchema = z.string().min(1).max(128);
const PACK_FILTER = [{ name: "Unwritten Land cartridge", extensions: ["cartridge"] }];
const CANCEL_HINT = "Choose a file to continue, or pick the action again when you are ready.";

async function exportPack(
  ctx: MainContext,
  cartridgeId: string,
  version: string,
): Promise<Result<SeedExport>> {
  const revision = await readCartridgeRevision(ctx.cartridgesDir, cartridgeId, version);
  if (!revision.ok) return revision;
  const packed = packCartridge(revision.value);
  if (!packed.ok) return packed;
  const chosen = await dialog.showSaveDialog({
    title: "Export cartridge",
    defaultPath: `${cartridgeId}-${version}.cartridge`,
    filters: PACK_FILTER,
  });
  if (chosen.canceled || chosen.filePath === undefined || chosen.filePath.length === 0) {
    return err("cancelled", "Export cancelled", CANCEL_HINT);
  }
  try {
    await writeFile(chosen.filePath, packed.value);
  } catch (error) {
    return fail(toError(error, "cartridge-write-failed"));
  }
  return ok({ path: chosen.filePath, bytes: packed.value.byteLength });
}

async function importPack(ctx: MainContext) {
  const chosen = await dialog.showOpenDialog({
    title: "Import cartridge",
    properties: ["openFile"],
    filters: PACK_FILTER,
  });
  const path = chosen.filePaths[0];
  if (chosen.canceled || path === undefined) {
    return err("cancelled", "Import cancelled", CANCEL_HINT);
  }
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (error) {
    return fail(toError(error, "cartridge-read-failed"));
  }
  const unpacked = unpackCartridge(new Uint8Array(bytes));
  if (!unpacked.ok) return unpacked;
  // Publishing re-validates routes and kits and is idempotent for identical bytes; a different
  // revision at the same id/version is refused rather than overwritten.
  return publishCartridgeRevision(ctx.cartridgesDir, {
    manifest: manifestCore(unpacked.value.manifest),
    rules: unpacked.value.rules,
    scenes: unpacked.value.scenes,
    assets: unpacked.value.assets,
  });
}

export function registerCartridgesIpc(ctx: MainContext): void {
  handle(IPC.cartridges.list, z.tuple([]), () => listCartridgeRevisions(ctx.cartridgesDir));
  handle(
    IPC.cartridges.read,
    z.tuple([cartridgeIdSchema, versionSchema]),
    ([cartridgeId, version]) => readCartridgeRevision(ctx.cartridgesDir, cartridgeId, version),
  );
  handle(IPC.cartridges.publish, z.tuple([publishCartridgeInputSchema]), ([input]) =>
    publishCartridgeRevision(ctx.cartridgesDir, input),
  );
  handle(
    IPC.cartridges.exportPack,
    z.tuple([cartridgeIdSchema, versionSchema]),
    ([cartridgeId, version]) => exportPack(ctx, cartridgeId, version),
  );
  handle(IPC.cartridges.importPack, z.tuple([]), () => importPack(ctx));
}
