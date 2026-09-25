import { spawnSync } from "node:child_process";

if (process.platform !== "darwin") {
  process.stdout.write("Skipping afm-bridge build: Foundation Models is macOS-only.\n");
  process.exit(0);
}

const configuration = process.argv[2] ?? "debug";
if (configuration !== "debug" && configuration !== "release") {
  process.stderr.write("Usage: node scripts/build-afm-bridge.mjs [debug|release]\n");
  process.exit(2);
}

const built = spawnSync(
  "swift",
  ["build", "-c", configuration, "--package-path", "native/afm-bridge"],
  { stdio: "inherit" },
);
if (built.error !== undefined) {
  process.stderr.write(`Could not start Swift: ${built.error.message}\n`);
  process.exit(1);
}
process.exit(built.status ?? 1);
