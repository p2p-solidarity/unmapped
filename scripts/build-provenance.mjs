// Compiles contracts/src/provenance/WorldProvenance.sol into contracts/WorldProvenance.json, which
// the world service (src/service/chain), main's reader (src/main/chain/provenance.ts) and
// `bun run provenance` read. Run `bun run contracts:build` after changing it; the artifact is
// committed. Cancun, like the lineage market, so it deploys unchanged on Sepolia and its L2s.
import { writeFileSync } from "node:fs";
import { byteLength, compile, readSources, solc } from "./lib/solc.mjs";

const contract = compile(
  readSources("contracts/src/provenance", "provenance/"),
  { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" },
  ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
)["provenance/WorldProvenance.sol"].WorldProvenance;
const artifact = {
  contract: "WorldProvenance",
  solc: solc.version(),
  abi: contract.abi,
  bytecode: `0x${contract.evm.bytecode.object}`,
};
writeFileSync("contracts/WorldProvenance.json", `${JSON.stringify(artifact, null, 2)}\n`);
process.stdout.write(
  `WorldProvenance compiled with ${artifact.solc} ` +
    `(${byteLength(contract.evm.deployedBytecode.object)} bytes deployed)\n`,
);
