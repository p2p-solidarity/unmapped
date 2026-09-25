// solc-js helpers shared by the contract builds: read a folder of sources, resolve package imports
// (`@uniswap/…`, `@openzeppelin/…`) from node_modules, compile or exit with solc's errors.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import solc from "solc";

export { solc };

export function readSources(dir, prefix) {
  const sources = {};
  for (const name of readdirSync(resolve(dir)).filter((file) => file.endsWith(".sol"))) {
    sources[`${prefix}${name}`] = { content: readFileSync(join(resolve(dir), name), "utf8") };
  }
  return sources;
}

function findImports(path) {
  try {
    return { contents: readFileSync(resolve("node_modules", path), "utf8") };
  } catch {
    return { error: `${path} not found in node_modules` };
  }
}

export function compile(sources, settings, outputs) {
  const input = {
    language: "Solidity",
    sources,
    settings: { ...settings, outputSelection: { "*": { "*": outputs } } },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  const fatal = (output.errors ?? []).filter((error) => error.severity === "error");
  if (fatal.length > 0) {
    process.stderr.write(`${fatal.map((error) => error.formattedMessage).join("\n")}\n`);
    process.exit(1);
  }
  for (const warning of output.errors ?? []) process.stdout.write(`${warning.formattedMessage}\n`);
  return output.contracts;
}

export const byteLength = (hex) => hex.length / 2;
