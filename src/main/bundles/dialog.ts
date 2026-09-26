// The save/open dialogs for `.world` files (rev 6 phase 4, D5). A native dialog cannot be driven
// over CDP, so an E2E run of the unpackaged app on a throwaway userData (AETHER_TEST_USER_DATA, the
// same guard as backups) may set AETHER_TEST_WORLD_PATH: both dialogs then answer with that
// absolute path. Main reads it from its own environment — the renderer never names a file.

import { isAbsolute } from "node:path";
import { WORLD_BUNDLE_EXTENSION } from "@shared/worldBundle";
import { app, dialog } from "electron";

const WORLD_FILTER = [{ name: "UNMAPPED world", extensions: [WORLD_BUNDLE_EXTENSION] }];

function scriptedPath(): string | null {
  if (app.isPackaged || !process.env.AETHER_TEST_USER_DATA) return null;
  const path = process.env.AETHER_TEST_WORLD_PATH;
  return path !== undefined && isAbsolute(path) ? path : null;
}

/** Where to write a `.world`, or null when the player cancelled. */
export async function chooseWorldTarget(defaultName: string): Promise<string | null> {
  const scripted = scriptedPath();
  if (scripted !== null) return scripted;
  const chosen = await dialog.showSaveDialog({
    title: "Export world",
    defaultPath: defaultName,
    filters: WORLD_FILTER,
  });
  return chosen.canceled || chosen.filePath === undefined || chosen.filePath.length === 0
    ? null
    : chosen.filePath;
}

/** Which `.world` to read, or null when the player cancelled. */
export async function chooseWorldSource(): Promise<string | null> {
  const scripted = scriptedPath();
  if (scripted !== null) return scripted;
  const chosen = await dialog.showOpenDialog({
    title: "Import world",
    properties: ["openFile"],
    filters: WORLD_FILTER,
  });
  return chosen.canceled ? null : (chosen.filePaths[0] ?? null);
}
