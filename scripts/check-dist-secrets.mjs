// Last step of `bun run dist`: fails the build when a packaged app could leak this machine's
// secrets. It checks that no `.env` file made it into `out/` or into the app bundle (app.asar
// included), and that no value from the local `.env` — nor any key-like variable in the
// environment — appears in their bytes. Only variable names are ever printed, never values.
// A red run means: do not upload the dmg.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { parse } from "dotenv";

const root = process.cwd();
const require = createRequire(import.meta.url);
const { listPackage } = require("@electron/asar");

const KEY_LIKE = /(KEY|TOKEN|SECRET|PRIVATE|PASSWORD)/i;
const MIN_LENGTH = 8;

/** Name → value for everything that must never ship: the local .env, plus key-like env vars. */
function secrets() {
  const out = new Map();
  const envPath = join(root, ".env");
  if (existsSync(envPath)) {
    for (const [name, value] of Object.entries(parse(readFileSync(envPath)))) {
      if (value.length >= MIN_LENGTH) out.set(name, value);
    }
  }
  for (const [name, value] of Object.entries(process.env)) {
    if (KEY_LIKE.test(name) && value !== undefined && value.length >= MIN_LENGTH) {
      out.set(name, value);
    }
  }
  return out;
}

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (entry.isFile()) yield path;
  }
}

function targets() {
  const found = [];
  if (existsSync(join(root, "out"))) found.push(join(root, "out"));
  const dist = join(root, "dist");
  if (existsSync(dist)) {
    for (const dir of readdirSync(dist)) {
      const full = join(dist, dir);
      if (!statSync(full).isDirectory()) continue;
      for (const app of readdirSync(full)) if (app.endsWith(".app")) found.push(join(full, app));
    }
  }
  return found;
}

const problems = [];
const values = secrets();
let scanned = 0;
for (const target of targets()) {
  for (const path of files(target)) {
    const rel = path.slice(root.length + 1);
    if (/(^|\/)\.env(\.|$)/.test(rel)) problems.push(`${rel} is a .env file`);
    if (path.endsWith("app.asar")) {
      for (const entry of listPackage(path)) {
        if (/(^|\/)\.env(\.|$)/.test(entry)) problems.push(`${rel} contains ${entry}`);
      }
    }
    const bytes = readFileSync(path);
    scanned += 1;
    for (const [name, value] of values) {
      if (bytes.includes(value)) problems.push(`${rel} contains the value of ${name}`);
    }
  }
}

if (scanned === 0) {
  console.error("check-dist-secrets: nothing to check — run it after electron-vite build.");
  process.exit(1);
}
if (problems.length > 0) {
  console.error("check-dist-secrets: the build would leak secrets. Do not ship it.");
  for (const problem of problems) console.error(`  ✘ ${problem}`);
  process.exit(1);
}
console.log(`check-dist-secrets: ${values.size} secret values, ${scanned} files — clean.`);
