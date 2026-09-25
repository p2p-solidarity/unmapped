// One-time ENSv2 setup for cartridge names on Sepolia. Run it yourself — it spends Sepolia gas (the
// registration fee is MockUSDC, which anyone may mint for free):
//
//   UNWRITTEN_PRIVATE_KEY=0x… bun run ens:setup <label>            # makes <label>.eth the parent
//   bun run ens:setup <label> --dry-run                           # simulates every step, sends nothing
//
// Steps (scripts/lib/ensParent.ts): deploy this key's Permissioned Resolver and a User Registry for
// the parent, register <label>.eth pointing at both — or, when the key already owns it, point it at
// them — and set the registry's parent. The dry run then registers one cartridge subname and reads it
// back through the Universal Resolver. Paste the printed lines into .env; the app writes every
// cartridge name after that.

import { config as loadEnv } from "dotenv";
import {
  type Abi,
  type Address,
  createPublicClient,
  decodeFunctionResult,
  type Hex,
  http,
  type PublicClient,
} from "viem";
import { sepolia } from "viem/chains";
import {
  labelId,
  NAME_STATUS,
  registryAbi,
  resolverAbi,
  subnameCalls,
  textProfileAbi,
  textQuery,
  universalResolverAbi,
} from "../src/main/chain/ensCalls";
import { dryExec, liveExec, read } from "./lib/chainExec";
import { checkEnsDeployment, setUpParent } from "./lib/ensParent";

loadEnv({ quiet: true });
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const label = args.find((arg) => !arg.startsWith("--"))?.toLowerCase();
if (label === undefined || !/^[a-z0-9-]{3,63}$/.test(label)) {
  process.stderr.write("Usage: bun run ens:setup <label> [--dry-run]   (label: a-z 0-9 -)\n");
  process.exit(1);
}
const rpcUrl = process.env.UNWRITTEN_ENS_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl) }) as PublicClient;
const say = (line: string) => process.stdout.write(`${line}\n`);

const key = process.env.UNWRITTEN_PRIVATE_KEY;
if (!dryRun && !key) {
  process.stderr.write(
    "Set UNWRITTEN_PRIVATE_KEY (a Sepolia key with test ETH), or pass --dry-run.\n",
  );
  process.exit(1);
}
const exec = dryRun ? dryExec(client) : liveExec(client, key as Hex, rpcUrl);
say(`${dryRun ? "Dry run" : "Setting up"} ${label}.eth on Sepolia ENSv2 as ${exec.account}`);
await checkEnsDeployment(client);

const { parent, registry, resolver } = await setUpParent(
  exec,
  label,
  dryRun
    ? {}
    : {
        registry: process.env.UNWRITTEN_ENS_REGISTRY as Address | undefined,
        resolver: process.env.UNWRITTEN_ENS_RESOLVER as Address | undefined,
      },
);

if (dryRun) {
  const sub = "dry-run-cartridge";
  const texts = {
    "unwritten.cartridge": sub,
    "unwritten.version": "1",
    "unwritten.hash": `sha256:${"ab".repeat(32)}`,
  };
  for (const [index, request] of subnameCalls({
    owner: exec.account,
    registry,
    resolver,
    label: sub,
    parent,
    register: true,
    texts,
  }).entries()) {
    await exec.send(request, index === 0 ? `register ${sub}.${parent}` : "write cartridge records");
  }
  const name = `${sub}.${parent}`;
  // What the app checks before it writes: the label's state in our registry and the resolver's record.
  const state = (await read(exec, registry, registryAbi as Abi, "getState", [labelId(sub)])) as {
    status: number;
    latestOwner: Address;
  };
  const direct = textQuery(name, "unwritten.cartridge");
  const held = decodeFunctionResult({
    abi: textProfileAbi,
    functionName: "text",
    data: (await read(exec, resolver, resolverAbi as Abi, "resolve", [
      direct.name,
      direct.data,
    ])) as Hex,
  });
  say(
    `  registry: ${sub} status ${state.status} owner ${state.latestOwner}; resolver: unwritten.cartridge = ${held}`,
  );
  if (
    state.status !== NAME_STATUS.registered ||
    state.latestOwner.toLowerCase() !== exec.account.toLowerCase() ||
    held !== sub
  ) {
    throw new Error("the app's pre-write checks would misread this name");
  }
  const query = textQuery(name, "unwritten.hash");
  const [result, via] = (await read(
    exec,
    sepolia.contracts.ensUniversalResolver.address,
    universalResolverAbi as Abi,
    "resolve",
    [query.name, query.data],
  )) as [Hex, Address];
  const value = decodeFunctionResult({ abi: textProfileAbi, functionName: "text", data: result });
  say(`  Universal Resolver: ${name} unwritten.hash = ${value} (resolver ${via})`);
  if (value !== texts["unwritten.hash"])
    throw new Error("the subname did not resolve to its record");
}

say(`\n${dryRun ? "# would be:" : "# add to .env:"}`);
say(`UNWRITTEN_ENS_PARENT=${parent}`);
say(`UNWRITTEN_ENS_REGISTRY=${registry}`);
say(`UNWRITTEN_ENS_RESOLVER=${resolver}`);
