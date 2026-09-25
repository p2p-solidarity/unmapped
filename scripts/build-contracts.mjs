// Compiles contracts/src/*.sol and writes the artifact the app and the deploy script read.
// Run `bun run contracts:build` after changing a contract; the artifact is committed.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import solc from "solc";

const root = resolve("contracts/src");
const sources = {};
for (const name of readdirSync(root).filter((file) => file.endsWith(".sol"))) {
  sources[name] = { content: readFileSync(join(root, name), "utf8") };
}
const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const fatal = (output.errors ?? []).filter((error) => error.severity === "error");
if (fatal.length > 0) {
  process.stderr.write(`${fatal.map((error) => error.formattedMessage).join("\n")}\n`);
  process.exit(1);
}
for (const warning of output.errors ?? []) process.stdout.write(`${warning.formattedMessage}\n`);
const contract = output.contracts["UnwrittenLedger.sol"].UnwrittenLedger;
const artifact = {
  contract: "UnwrittenLedger",
  solc: solc.version(),
  abi: contract.abi,
  bytecode: `0x${contract.evm.bytecode.object}`,
};
writeFileSync("contracts/UnwrittenLedger.json", `${JSON.stringify(artifact, null, 2)}\n`);
process.stdout.write(
  `UnwrittenLedger compiled with ${artifact.solc} (${artifact.bytecode.length / 2 - 1} bytes)\n`,
);
