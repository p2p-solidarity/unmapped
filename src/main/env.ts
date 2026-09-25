// Loads `.env` into process.env before any other module reads a key. Main-process only: provider
// keys never cross the contextBridge, and nothing here ever logs a value — only file paths and
// variable names, so a crash report cannot leak a secret.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { app } from "electron";

export interface EnvLoadResult {
  /** Absolute path of the `.env` that was loaded, or null when none exists. */
  path: string | null;
  /** Variable names only — never the values. */
  keys: string[];
}

let loaded: EnvLoadResult | null = null;

function appEnvPath(): string | null {
  try {
    return join(app.getAppPath(), ".env");
  } catch {
    return null;
  }
}

function isPackaged(): boolean {
  try {
    return app.isPackaged === true;
  } catch {
    return false;
  }
}

/** The app's own data folder — the one place a Finder-launched build can find a `.env`. */
function userDataEnvPath(): string | null {
  try {
    return join(app.getPath("userData"), ".env");
  } catch {
    return null;
  }
}

/**
 * Dev: the cwd is the repo root. Packaged: the app bundle, the app's data folder, then the cwd.
 * Keys typed in Settings → Model need none of these (`inference/keyStore.ts`).
 */
export function envCandidatePaths(): string[] {
  const fromCwd = join(process.cwd(), ".env");
  const fromApp = appEnvPath();
  const ordered = isPackaged() ? [fromApp, userDataEnvPath(), fromCwd] : [fromCwd, fromApp];
  const unique: string[] = [];
  for (const candidate of ordered) {
    if (candidate !== null && candidate.length > 0 && !unique.includes(candidate)) {
      unique.push(candidate);
    }
  }
  return unique;
}

/** Idempotent: the first call wins, later calls return the same summary. */
export function loadEnv(): EnvLoadResult {
  if (loaded !== null) return loaded;
  for (const path of envCandidatePaths()) {
    if (!existsSync(path)) continue;
    const parsed = config({ path, quiet: true });
    if (parsed.error !== undefined) continue;
    loaded = { path, keys: Object.keys(parsed.parsed ?? {}) };
    return loaded;
  }
  loaded = { path: null, keys: [] };
  return loaded;
}

/** True when the named variable holds a non-empty value. Never returns the value itself. */
export function hasEnvKey(name: string): boolean {
  const value = process.env[name];
  return typeof value === "string" && value.length > 0;
}
