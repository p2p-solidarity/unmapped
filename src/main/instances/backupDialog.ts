// The save/open dialogs for `.spire-backup` files. A native dialog cannot be driven over CDP, so an
// E2E run of the unpackaged app on a throwaway userData (AETHER_TEST_USER_DATA, the same guard as
// index.ts) may set AETHER_TEST_BACKUP_PATH: both dialogs then answer with that absolute path. Main
// reads it from its own environment — the renderer still never names a file.

import { isAbsolute } from "node:path";
import { app, dialog } from "electron";

const BACKUP_FILTER = [{ name: "Unwritten Land save backup", extensions: ["spire-backup"] }];

function scriptedPath(): string | null {
  if (app.isPackaged || !process.env.AETHER_TEST_USER_DATA) return null;
  const path = process.env.AETHER_TEST_BACKUP_PATH;
  return path !== undefined && isAbsolute(path) ? path : null;
}

/** Where to write a backup, or null when the player cancelled. */
export async function chooseBackupTarget(defaultName: string): Promise<string | null> {
  const scripted = scriptedPath();
  if (scripted !== null) return scripted;
  const chosen = await dialog.showSaveDialog({
    title: "Export save backup",
    defaultPath: defaultName,
    filters: BACKUP_FILTER,
  });
  return chosen.canceled || chosen.filePath === undefined || chosen.filePath.length === 0
    ? null
    : chosen.filePath;
}

/** Which backup to read, or null when the player cancelled. */
export async function chooseBackupSource(): Promise<string | null> {
  const scripted = scriptedPath();
  if (scripted !== null) return scripted;
  const chosen = await dialog.showOpenDialog({
    title: "Import save backup",
    properties: ["openFile"],
    filters: BACKUP_FILTER,
  });
  return chosen.canceled ? null : (chosen.filePaths[0] ?? null);
}
