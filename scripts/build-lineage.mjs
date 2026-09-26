// Compiles the lineage market (contracts/src/lineage/*.sol) into contracts/LineageMarket.json, which
// src/main/chain/lineageCalls.ts and `bun run lineage:market` read. Uniswap v4 and OpenZeppelin come
// from node_modules; the EVM is Cancun, what the v4 PoolManager on Sepolia was built for.
// Run `bun run contracts:build` after changing a contract; the artifact is committed.
import { writeFileSync } from "node:fs";
import { byteLength, compile, readSources, solc } from "./lib/solc.mjs";

const compiled = compile(
  readSources("contracts/src/lineage", "lineage/"),
  { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" },
  ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
);
const market = { solc: solc.version(), contracts: {} };
for (const [file, name] of [
  ["LineageRegistry", "LineageRegistry"],
  ["LineageHook", "LineageHook"],
  ["LineageRouter", "LineageRouter"],
  ["WorldToken", "WorldToken"],
  ["PasskeyAccount", "PasskeyAccount"],
  ["PasskeyAccount", "PasskeyAccountFactory"],
]) {
  const contract = compiled[`lineage/${file}.sol`][name];
  const runtime = byteLength(contract.evm.deployedBytecode.object);
  // EIP-170: a deployed contract's code may not exceed 24,576 bytes.
  if (runtime > 24_576) {
    process.stderr.write(`${name} runtime is ${runtime} bytes, over the 24,576-byte limit\n`);
    process.exit(1);
  }
  market.contracts[name] = { abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}` };
  process.stdout.write(`${name} compiled (${runtime} bytes deployed)\n`);
}
writeFileSync("contracts/LineageMarket.json", `${JSON.stringify(market, null, 2)}\n`);
