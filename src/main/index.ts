// Main entry. Order matters: `.env` is loaded before any module can read a provider key, then the
// worlds directory is created, then the IPC surface is registered, then the window appears.

import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { app, BrowserWindow } from "electron";
import type { MainContext } from "./context";
import { loadEnv } from "./env";
import {
  createManagedAppleLocalSceneProvider,
  resolveAppleLocalHelperPath,
} from "./inference/appleLocalHelper";
import { registerIpc } from "./ipc";
import { applyCsp, createWindow } from "./window";
import { registerWorkScheme } from "./works/ipc";

loadEnv();
// Custom schemes must be declared before the app is ready.
registerWorkScheme();

// Isolated development smoke tests never open the player's real cartridge library.
if (!app.isPackaged && process.env.AETHER_TEST_USER_DATA) {
  app.setPath("userData", resolve(process.env.AETHER_TEST_USER_DATA));
  // Smoke tests drive a window that is usually covered. Keep occluded windows and their
  // out-of-process frames (sandboxed worlds) rendering, so animation frames keep arriving.
  app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
  app.commandLine.appendSwitch("disable-renderer-backgrounding");
}

type Cleanup = () => Promise<void> | void;

const cleanups: Cleanup[] = [];
let shuttingDown = false;

function createContext(appleLocalProvider: MainContext["appleLocalProvider"]): MainContext {
  const userData = app.getPath("userData");
  return {
    appleLocalProvider,
    userData,
    worldsDir: join(userData, "worlds"),
    cartridgesDir: join(userData, "cartridges"),
    instancesDir: join(userData, "instances"),
    workspacesDir: join(userData, "workspaces"),
    profilesDir: join(userData, "profiles"),
    broadcast(channel, payload) {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send(channel, payload);
      }
    },
    onBeforeQuit(cleanup) {
      cleanups.push(cleanup);
    },
  };
}

/** Runs registered cleanups (watchers, sidecars) once, then lets the quit proceed. */
app.on("before-quit", (event) => {
  if (shuttingDown || cleanups.length === 0) return;
  shuttingDown = true;
  event.preventDefault();
  const pending = cleanups.map(async (cleanup) => {
    await cleanup();
  });
  void Promise.allSettled(pending).then(() => {
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

async function boot(): Promise<void> {
  const appleLocalProvider =
    process.platform === "darwin"
      ? createManagedAppleLocalSceneProvider({
          helperPath: resolveAppleLocalHelperPath({
            isPackaged: app.isPackaged,
            appPath: app.getAppPath(),
            resourcesPath: process.resourcesPath,
          }),
          onBeforeQuit(cleanup) {
            cleanups.push(cleanup);
          },
        })
      : null;
  const ctx = createContext(appleLocalProvider);
  await Promise.all(
    [ctx.worldsDir, ctx.cartridgesDir, ctx.instancesDir, ctx.workspacesDir, ctx.profilesDir].map(
      (directory) => mkdir(directory, { recursive: true }),
    ),
  );
  if (appleLocalProvider !== null) {
    const capabilities = await appleLocalProvider.capabilities();
    if (process.env.AETHER_AFM_MAIN_SMOKE === "1") {
      process.stdout.write(`AFM_MAIN_SMOKE ${JSON.stringify(capabilities)}\n`);
      app.quit();
      return;
    }
    if (!capabilities.ok) {
      process.stderr.write(
        `[apple-local] ${capabilities.error.code}: ${capabilities.error.message}\n`,
      );
    } else if (!capabilities.value.available) {
      process.stderr.write(`[apple-local] unavailable: ${capabilities.value.unavailableReason}\n`);
    }
  }
  applyCsp();
  registerIpc(ctx);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

void app.whenReady().then(boot, (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`UNMAPPED failed to start: ${message}\n`);
  app.quit();
});
