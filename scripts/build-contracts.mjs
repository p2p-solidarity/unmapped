// Compiles contracts/src/*.sol and writes the artifact the app and the deploy script read.
// Run `bun run contracts:build` after changing a contract; the artifact is committed.
// (The lineage market in contracts/src/lineage is built by scripts/build-lineage.mjs.)
import { writeFileSync } from "node:fs";
import { byteLength, compile, readSources, solc } from "./lib/solc.mjs";

const contract = compile(
  readSources("contracts/src", ""),
  { optimizer: { enabled: true, runs: 200 } },
  ["abi", "evm.bytecode.object"],
)["UnwrittenLedger.sol"].UnwrittenLedger;
const artifact = {
  contract: "UnwrittenLedger",
  solc: solc.version(),
  abi: contract.abi,
  bytecode: `0x${contract.evm.bytecode.object}`,
};
writeFileSync("contracts/UnwrittenLedger.json", `${JSON.stringify(artifact, null, 2)}\n`);
process.stdout.write(
  `UnwrittenLedger compiled with ${artifact.solc} (${byteLength(contract.evm.bytecode.object)} bytes)\n`,
);
