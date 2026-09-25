// `app:*` handlers: environment facts the renderer may safely know, the external-link escape hatch
// and the two file dialogs. Secrets from `.env` never appear here.

import { readFile, writeFile } from "node:fs/promises";
import { type AppInfo, IPC } from "@shared/ipc";
import { err, fail, ok, type Result, toError } from "@shared/result";
import { app, dialog, shell } from "electron";
import { z } from "zod";
import type { MainContext } from "../context";
import { handle, handleValue } from "../handle";
import { isHttpUrl } from "./url";

const BASE64 = /^[A-Za-z0-9+/\r\n]*={0,2}$/;
const MAX_BASE64_CHARS = 32 * 1024 * 1024;

const pickFileOptionsSchema = z.object({
  title: z.string().min(1).max(200),
  extensions: z.array(z.string().min(1).max(16)).max(16),
});

const saveFileInputSchema = z.object({
  title: z.string().min(1).max(200),
  defaultName: z.string().min(1).max(200),
  base64: z.string().max(MAX_BASE64_CHARS).regex(BASE64, "expected base64"),
});

/** `process.platform` is wider than `AppInfo["platform"]`; everything else reports as linux. */
export function currentPlatform(): AppInfo["platform"] {
  const value: string = process.platform;
  if (value === "darwin" || value === "win32") return value;
  return "linux";
}

function appInfo(ctx: MainContext): AppInfo {
  return {
    version: app.getVersion(),
    platform: currentPlatform(),
    electron: process.versions.electron ?? "unknown",
    userData: ctx.userData,
    worldsDir: ctx.worldsDir,
    cartridgesDir: ctx.cartridgesDir,
    instancesDir: ctx.instancesDir,
    workspacesDir: ctx.workspacesDir,
  };
}

async function openExternal(url: string): Promise<Result<void>> {
  if (!isHttpUrl(url)) {
    return err(
      "url-not-allowed",
      `Refusing to open ${url}`,
      "Only http:// and https:// links open in your browser.",
    );
  }
  try {
    await shell.openExternal(url);
    return ok(undefined);
  } catch (error) {
    return fail(toError(error, "open-external-failed"));
  }
}

async function pickFile(
  options: z.output<typeof pickFileOptionsSchema>,
): Promise<Result<{ path: string; base64: string } | null>> {
  const filters =
    options.extensions.length > 0 ? [{ name: "Files", extensions: options.extensions }] : [];
  const chosen = await dialog.showOpenDialog({
    title: options.title,
    properties: ["openFile"],
    filters,
  });
  const path = chosen.filePaths[0];
  if (chosen.canceled || path === undefined) return ok(null);
  try {
    const bytes = await readFile(path);
    return ok({ path, base64: bytes.toString("base64") });
  } catch (error) {
    return fail(toError(error, "pick-file-failed"));
  }
}

async function saveFile(
  input: z.output<typeof saveFileInputSchema>,
): Promise<Result<{ path: string } | null>> {
  const chosen = await dialog.showSaveDialog({
    title: input.title,
    defaultPath: input.defaultName,
  });
  if (chosen.canceled || chosen.filePath === undefined || chosen.filePath.length === 0) {
    return ok(null);
  }
  try {
    await writeFile(chosen.filePath, Buffer.from(input.base64, "base64"));
    return ok({ path: chosen.filePath });
  } catch (error) {
    return fail(toError(error, "save-file-failed"));
  }
}

export function registerAppIpc(ctx: MainContext): void {
  handleValue(IPC.app.info, () => appInfo(ctx));
  handle(IPC.app.openExternal, z.tuple([z.string().max(2048)]), ([url]) => openExternal(url));
  handle(IPC.app.pickFile, z.tuple([pickFileOptionsSchema]), ([options]) => pickFile(options));
  handle(IPC.app.saveFile, z.tuple([saveFileInputSchema]), ([input]) => saveFile(input));
}
