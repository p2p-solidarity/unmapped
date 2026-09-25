// Main entry. Order matters: `.env` is loaded before any module can read a provider key, then the
// worlds directory is created, then the IPC surface is registered, then the window appears.

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { app, BrowserWindow } from "electron";
import type { MainContext } from "./context";
import { loadEnv } from "./env";
import { registerIpc } from "./ipc";
import { applyCsp, createWindow } from "./window";

loadEnv();

type Cleanup = () => Promise<void> | void;

const cleanups: Cleanup[] = [];
let shuttingDown = false;

function createContext(): MainContext {
  const userData = app.getPath("userData");
  return {
    userData,
    worldsDir: join(userData, "worlds"),
    cartridgesDir: join(userData, "cartridges"),
    instancesDir: join(userData, "instances"),
    workspacesDir: join(userData, "workspaces"),
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
  const ctx = createContext();
  await Promise.all(
    [ctx.worldsDir, ctx.cartridgesDir, ctx.instancesDir, ctx.workspacesDir].map((directory) =>
      mkdir(directory, { recursive: true }),
    ),
  );
  applyCsp();
  registerIpc(ctx);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

void app.whenReady().then(boot, (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Aether Spire failed to start: ${message}\n`);
  app.quit();
});
