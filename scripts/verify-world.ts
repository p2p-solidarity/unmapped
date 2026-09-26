// Verifies a `.world` file offline (rev 6 phase 4, D5) with exactly the checks the app and the world
// service run (`verifyWorldFile`, src/dsl/history/worldBundle.ts): the archive's limits from its
// central directory before anything is inflated; every listed hash and nothing unlisted; the chain,
// the ownership pass and every receipt under P3 D2's key schedule; every entry's verdict and the
// fold; every beat recomputed; the genesis pack against the genesis; every work pack; physics.
//
//   bun run verify-world -- <file.world> [--json]
//
// Prints the report (entries, authors, owners, services, beats, problems); exits 0 when there is no
// problem, 1 when there is one, 2 when the file cannot be read. No network, no userData, no model.

import { readFileSync } from "node:fs";
import { verifyWorldFile } from "@dsl/history/worldBundle";

function main(): number {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const json = args.includes("--json");
  const file = args.find((arg) => !arg.startsWith("--"));
  if (file === undefined) {
    console.error("usage: bun run verify-world -- <file.world> [--json]");
    return 2;
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(readFileSync(file));
  } catch (error) {
    console.error(`verify-world: cannot read ${file}: ${String(error)}`);
    return 2;
  }
  const started = performance.now();
  const { report } = verifyWorldFile(bytes);
  const ms = Math.round(performance.now() - started);
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return report.problems.length === 0 ? 0 : 1;
  }
  const services = report.services.map(
    (one) => `${one.url} (${one.key.slice(0, 10)}… from #${one.from})`,
  );
  console.log(
    [
      `world      ${report.worldId ?? "?"} "${report.name ?? "?"}"`,
      `cartridge  ${report.cartridge === null ? "?" : `${report.cartridge.cartridgeId}@${report.cartridge.version} ${report.cartridge.contentHash}`}`,
      `head       #${report.head?.n ?? "?"} ${report.head?.chain ?? ""}`,
      `physics    ${report.physicsVersion ?? "?"}   protocol ${report.protocol ?? "?"}`,
      `exported   ${report.exportedAt ?? "?"} by ${report.exportedBy ?? "?"} (signature ${report.signature})`,
      `entries    ${report.entries} by ${report.authors.length} keys; owners ${report.owners.length}`,
      `services   ${services.length === 0 ? "none (never attached)" : services.join(", ")}`,
      `beats      ${report.beats.total} (${report.beats.mismatched.length} do not recompute)`,
      `ignored    ${report.ignored.length} (${report.newer} from a newer build)`,
      `packs      ${report.blobs} (${report.works} AI worlds), ${report.bytes} bytes in all`,
      `checked in ${ms} ms`,
    ].join("\n"),
  );
  if (report.problems.length === 0) {
    console.log("OK — every check passed.");
    return 0;
  }
  console.log(`${report.problems.length} problem(s):`);
  for (const problem of report.problems) {
    const at = problem.n === undefined ? (problem.path ?? "") : `entry ${problem.n}`;
    console.log(
      `  ✗ check ${problem.check} ${problem.code}${at === "" ? "" : ` (${at})`}: ${problem.message}`,
    );
  }
  return 1;
}

process.exit(main());
