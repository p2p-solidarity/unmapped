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
import { installQuitSequence, onQuit, quitting, registrantOf } from "./quit";
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
        // A closing window loses its page first (a quit closes every page, and a chat that page
        // started ends with it), so check both.
        if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
          window.webContents.send(channel, payload);
        }
      }
    },
    onBeforeQuit(cleanup) {
      onQuit(registrantOf(new Error().stack), cleanup);
    },
  };
}

// Cleanups (watchers, helpers, the history flush) run once the windows have closed: ./quit.ts.
installQuitSequence();

app.on("window-all-closed", () => {
  // macOS keeps an app with no window running; the dock's `activate` opens a new one. A quit never
  // gets here: once Electron has closed the windows for a quit it goes on to `will-quit`.
  if (process.platform !== "darwin") app.quit();
  else console.log("[app] last window closed; the app stays open (macOS)");
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
            onQuit("appleLocalHelper", cleanup);
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
    if (!quitting() && BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

void app.whenReady().then(boot, (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`UNMAPPED failed to start: ${message}\n`);
  app.quit();
});
