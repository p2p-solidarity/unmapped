import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { IPC, type SeedExport } from "@shared/ipc";
import { err, fail, ok, type Result, toError } from "@shared/result";
import { app, dialog } from "electron";
import { z } from "zod";
import type { MainContext } from "../context";
import { handle } from "../handle";
import { publishLicensedCartridge } from "../images/cartridgeLicences";
import { installCartridgePack } from "./install";
import { packCartridge } from "./pack";
import { publishCartridgeInputSchema } from "./schemas";
import { listCartridgeRevisions, readCartridgeRevision } from "./store";

const cartridgeIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const versionSchema = z.string().min(1).max(128);
const PACK_FILTER = [{ name: "UNMAPPED cartridge", extensions: ["cartridge"] }];
const CANCEL_HINT = "Choose a file to continue, or pick the action again when you are ready.";

/**
 * A native dialog cannot be driven over CDP: an E2E run of the unpackaged app on a throwaway
 * userData may set AETHER_TEST_CARTRIDGE_PATH, and both dialogs answer with it (as backups do with
 * AETHER_TEST_BACKUP_PATH). The renderer still never names a file.
 */
function scriptedPath(): string | null {
  if (app.isPackaged || !process.env.AETHER_TEST_USER_DATA) return null;
  const path = process.env.AETHER_TEST_CARTRIDGE_PATH;
  return path !== undefined && isAbsolute(path) ? path : null;
}

async function exportPack(
  ctx: MainContext,
  cartridgeId: string,
  version: string,
): Promise<Result<SeedExport>> {
  const revision = await readCartridgeRevision(ctx.cartridgesDir, cartridgeId, version);
  if (!revision.ok) return revision;
  const packed = packCartridge(revision.value);
  if (!packed.ok) return packed;
  const scripted = scriptedPath();
  const chosen =
    scripted !== null
      ? { canceled: false, filePath: scripted }
      : await dialog.showSaveDialog({
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
  const scripted = scriptedPath();
  const chosen =
    scripted !== null
      ? { canceled: false, filePaths: [scripted] }
      : await dialog.showOpenDialog({
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
  // The exact revision that was exported: bible, story and dialogues included (./install.ts).
  return installCartridgePack(ctx.cartridgesDir, new Uint8Array(bytes));
}

export function registerCartridgesIpc(ctx: MainContext): void {
  handle(IPC.cartridges.list, z.tuple([]), () => listCartridgeRevisions(ctx.cartridgesDir));
  handle(
    IPC.cartridges.read,
    z.tuple([cartridgeIdSchema, versionSchema]),
    ([cartridgeId, version]) => readCartridgeRevision(ctx.cartridgesDir, cartridgeId, version),
  );
  // Main names every picture's licence in a hashed assets/licences.json, and refuses new pictures
  // whose licence is not commercial while commercial mode is on (rev 6 phase 4, D4).
  handle(IPC.cartridges.publish, z.tuple([publishCartridgeInputSchema]), ([input]) =>
    publishLicensedCartridge(ctx, input),
  );
  handle(
    IPC.cartridges.exportPack,
    z.tuple([cartridgeIdSchema, versionSchema]),
    ([cartridgeId, version]) => exportPack(ctx, cartridgeId, version),
  );
  handle(IPC.cartridges.importPack, z.tuple([]), () => importPack(ctx));
}
