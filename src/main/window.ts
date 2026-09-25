// The single BrowserWindow: hardened webPreferences (Rule 6), a Content-Security-Policy applied to
// every response, and external links handed to the OS browser instead of opening a second window.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { WORK_SCHEME } from "@shared/works";
import { app, BrowserWindow, session, shell } from "electron";
import { isHttpUrl } from "./app/url";

const WIDTH = 1440;
const HEIGHT = 900;
const MIN_WIDTH = 1024;
const MIN_HEIGHT = 640;
/** Matches the renderer's darkest surface token so the first paint does not flash white. */
const BACKGROUND = "rgb(11, 13, 26)";

export function isDev(): boolean {
  try {
    return !app.isPackaged;
  } catch {
    return true;
  }
}

/**
 * electron-vite emits `out/preload/index.js` for a CommonJS build and `index.mjs` for an ESM one.
 * A sandboxed preload must be CommonJS, so `.js`/`.cjs` win; `.mjs` is only a last resort.
 */
export function preloadPath(baseDir: string = __dirname): string {
  const dir = join(baseDir, "../preload");
  for (const name of ["index.js", "index.cjs"]) {
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  const esm = join(dir, "index.mjs");
  if (existsSync(esm)) {
    process.stderr.write(
      "preload: only out/preload/index.mjs exists. Electron refuses ESM preloads when sandbox " +
        "is on, so window.seed will be undefined. Force the preload output to cjs in " +
        "electron.vite.config.ts.\n",
    );
    return esm;
  }
  return join(dir, "index.js");
}

/**
 * `unsafe-inline` scripts are allowed only in dev, where Vite injects the HMR client inline.
 * `connect-src` stays wide because the renderer talks to local model servers (127.0.0.1), ENS RPC
 * over https and y-webrtc signaling over wss.
 */
export function cspHeader(dev: boolean): string {
  return [
    "default-src 'self'",
    dev
      ? "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'"
      : "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self' ws: wss: http://127.0.0.1:* http://localhost:* https:",
    "worker-src 'self' blob:",
    // AI-written worlds run only in sandboxed frames on the work scheme; nothing else may be framed.
    `frame-src ${WORK_SCHEME}:`,
  ].join("; ");
}

export function applyCsp(target = session.defaultSession): void {
  const policy = cspHeader(isDev());
  target.webRequest.onHeadersReceived((details, callback) => {
    // A world page carries its own, much stricter policy; the app policy must not replace it.
    if (details.url.startsWith(`${WORK_SCHEME}:`)) {
      callback({});
      return;
    }
    const headers: Record<string, string | string[]> = { ...details.responseHeaders };
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === "content-security-policy") delete headers[key];
    }
    headers["Content-Security-Policy"] = [policy];
    callback({ responseHeaders: headers });
  });
  // Worlds get no permissions at all (camera, notifications, clipboard, …). Everything else keeps
  // Electron's existing behaviour.
  const fromWork = (url: string | undefined): boolean =>
    url?.startsWith(`${WORK_SCHEME}:`) === true;
  target.setPermissionRequestHandler((_contents, _permission, callback, details) => {
    callback(!fromWork(details.requestingUrl));
  });
  target.setPermissionCheckHandler((_contents, _permission, _origin, details) => {
    return !fromWork(details.requestingUrl);
  });
}

export function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    backgroundColor: BACKGROUND,
    title: "UNMAPPED — 無界之地",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Isolated dev smoke tests drive a window that is usually covered; keep its timers and
      // animation frames running like a visible window. Players keep Chromium's default.
      backgroundThrottling: !(isDev() && process.env.AETHER_TEST_USER_DATA),
    },
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  // Dev only: mirror renderer console + load failures into the terminal so `bun run dev`
  // logs show renderer errors without opening DevTools.
  if (isDev()) {
    window.webContents.on("console-message", (event) => {
      const level = event.level === "error" ? "ERR" : event.level === "warning" ? "WARN" : "LOG";
      process.stderr.write(
        `[renderer:${level}] ${event.message} (${event.sourceId}:${event.lineNumber})\n`,
      );
    });
    window.webContents.on("did-fail-load", (_e, code, desc, url) => {
      process.stderr.write(`[renderer] did-fail-load ${code} ${desc} ${url}\n`);
    });
    window.webContents.on("render-process-gone", (_e, details) => {
      process.stderr.write(`[renderer] process gone: ${details.reason}\n`);
    });
  }

  // Second layer behind the host CSP's frame-src: a subframe may only ever show a world page.
  window.webContents.on("will-frame-navigate", (details) => {
    if (!details.isMainFrame && !details.url.startsWith(`${WORK_SCHEME}://`)) {
      details.preventDefault();
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (isDev() && typeof devUrl === "string" && devUrl.length > 0) {
    void window.loadURL(devUrl);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return window;
}
