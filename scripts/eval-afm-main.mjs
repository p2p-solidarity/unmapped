import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const electron = resolve(root, "node_modules", ".bin", "electron");
const child = spawn(electron, [root], {
  cwd: root,
  env: { ...process.env, AETHER_AFM_MAIN_SMOKE: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  stdout += chunk;
});
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

const timeout = setTimeout(() => child.kill("SIGTERM"), 45_000);
const exitCode = await new Promise((resolveExit, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => resolveExit(code));
});
clearTimeout(timeout);

const marker = stdout.split("\n").find((line) => line.startsWith("AFM_MAIN_SMOKE "));
if (exitCode !== 0 || marker === undefined) {
  throw new Error(
    `Electron AFM main smoke failed (exit ${String(exitCode)}).\n${stdout}\n${stderr}`,
  );
}
const result = JSON.parse(marker.slice("AFM_MAIN_SMOKE ".length));
if (result.ok !== true || result.value?.providerId !== "apple-local") {
  throw new Error(`Electron main returned an invalid AFM capability result: ${marker}`);
}
process.stdout.write(`${JSON.stringify(result.value)}\n`);
