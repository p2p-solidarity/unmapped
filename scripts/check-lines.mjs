// Enforces the repo rule: no source file may exceed MAX_LINES. Run via `bun run lines`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MAX_LINES = 600;
const ROOTS = ["src", "tests", "scripts"];
const EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js", ".css", ".html"]);

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if ([...EXTENSIONS].some((ext) => name.endsWith(ext))) out.push(full);
  }
  return out;
}

const offenders = [];
for (const root of ROOTS) {
  let files = [];
  try {
    files = walk(root, []);
  } catch {
    continue;
  }
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n").length;
    if (lines > MAX_LINES) offenders.push({ file, lines });
  }
}

if (offenders.length > 0) {
  console.error(`Files over ${MAX_LINES} lines:`);
  for (const { file, lines } of offenders) console.error(`  ${file}: ${lines}`);
  process.exit(1);
}
console.log(`ok: all source files are <= ${MAX_LINES} lines`);
