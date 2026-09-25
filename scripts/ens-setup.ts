// One-time ENSv2 setup for cartridge names on Sepolia. Run it yourself — it spends Sepolia gas (the
// registration fee is MockUSDC, which anyone may mint for free):
//
//   UNWRITTEN_PRIVATE_KEY=0x… bun run ens:setup <label>            # makes <label>.eth the parent
//   bun run ens:setup <label> --dry-run                           # simulates every step, sends nothing
//
// Steps: deploy this key's Permissioned Resolver and a User Registry for the parent (Verifiable
// Factory proxies), register <label>.eth through the ETH Registrar (commit → wait → register) pointing
// at both — or, when the key already owns it, point it at them — and set the registry's parent. The
// dry run then registers one cartridge subname and reads it back through the Universal Resolver.
// Paste the printed lines into .env; the app writes every cartridge name after that.

import { config as loadEnv } from "dotenv";
import {
  type Abi,
  type Address,
  createPublicClient,
  createWalletClient,
  decodeFunctionResult,
  encodeFunctionData,
  type Hex,
  http,
  type Log,
  parseAbi,
  parseEther,
  parseEventLogs,
  toHex,
  zeroHash,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  type Call,
  deployRegistryCall,
  deployResolverCall,
  ENSV2_SEPOLIA,
  factoryAbi,
  labelId,
  NAME_STATUS,
  registrarAbi,
  registryAbi,
  resolverAbi,
  subnameCalls,
  textProfileAbi,
  textQuery,
  universalResolverAbi,
  usdcAbi,
} from "../src/main/chain/ensCalls";

loadEnv({ quiet: true });
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const label = args.find((arg) => !arg.startsWith("--"))?.toLowerCase();
if (label === undefined || !/^[a-z0-9-]{3,63}$/.test(label)) {
  process.stderr.write("Usage: bun run ens:setup <label> [--dry-run]   (label: a-z 0-9 -)\n");
  process.exit(1);
}
const parent = `${label}.eth`;
const rpcUrl = process.env.UNWRITTEN_ENS_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
const say = (line: string) => process.stdout.write(`${line}\n`);

interface Exec {
  account: Address;
  read(call: Call): Promise<Hex>;
  send(call: Call, what: string): Promise<Log[]>;
  /** Lets `seconds` of chain time pass. */
  wait(seconds: bigint): Promise<void>;
}

function liveExec(): Exec {
  const key = process.env.UNWRITTEN_PRIVATE_KEY;
  if (!key) {
    process.stderr.write(
      "Set UNWRITTEN_PRIVATE_KEY (a Sepolia key with test ETH), or pass --dry-run.\n",
    );
    process.exit(1);
  }
  const account = privateKeyToAccount(key as Hex);
  const wallet = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });
  return {
    account: account.address,
    read: async (call) => (await client.call({ account: account.address, ...call })).data ?? "0x",
    send: async (call, what) => {
      const hash = await wallet.sendTransaction(call);
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`${what} reverted (${hash})`);
      say(`  ✓ ${what}  ${hash}`);
      return receipt.logs;
    },
    wait: async (seconds) => {
      const until = (await client.getBlock()).timestamp + seconds;
      while ((await client.getBlock()).timestamp < until)
        await new Promise((done) => setTimeout(done, 4_000));
    },
  };
}

/** Every "send" becomes one simulated block; reads re-run all blocks, then the read. Nothing is sent. */
function dryExec(): Exec {
  const account = privateKeyToAccount(generatePrivateKey()).address;
  const blocks: { time: bigint; call: Call }[] = [];
  let time = BigInt(Math.floor(Date.now() / 1000)) + 15n;
  const run = async (extra: Call) => {
    const all = [...blocks, { time, call: extra }];
    const result = await client.simulateBlocks({
      blocks: all.map((block, index) => ({
        blockOverrides: { time: block.time },
        stateOverrides: index === 0 ? [{ address: account, balance: parseEther("10") }] : undefined,
        calls: [{ account, to: block.call.to, data: block.call.data }],
      })),
    });
    const last = result.at(-1)?.calls[0];
    if (last === undefined || last.status !== "success") {
      throw new Error(last?.error?.message ?? "simulation returned nothing");
    }
    return last;
  };
  return {
    account,
    read: async (call) => (await run(call)).data,
    send: async (call, what) => {
      const outcome = await run(call);
      blocks.push({ time, call });
      time += 12n;
      say(`  ✓ ${what}  (simulated)`);
      return outcome.logs as Log[];
    },
    wait: async (seconds) => {
      time += seconds;
    },
  };
}

async function read(
  exec: Exec,
  to: Address,
  abi: Abi,
  functionName: string,
  args: readonly unknown[],
): Promise<unknown> {
  const data = encodeFunctionData({ abi, functionName, args });
  return decodeFunctionResult({ abi, functionName, data: await exec.read({ to, data }) });
}

function call(to: Address, abi: Abi, functionName: string, args: readonly unknown[]): Call {
  return { to, data: encodeFunctionData({ abi, functionName, args }) };
}

async function deploy(exec: Exec, what: string, request: Call): Promise<Address> {
  const logs = await exec.send(request, what);
  const [deployed] = parseEventLogs({ abi: factoryAbi, eventName: "ProxyDeployed", logs });
  if (deployed === undefined) throw new Error(`${what}: no ProxyDeployed event`);
  return deployed.args.proxyAddress;
}

const exec = dryRun ? dryExec() : liveExec();
const { ethRegistrar, ethRegistry, mockUsdc } = ENSV2_SEPOLIA;
say(`${dryRun ? "Dry run" : "Setting up"} ${parent} on Sepolia ENSv2 as ${exec.account}`);

// The Universal Resolver must still walk the deployment these addresses belong to.
const liveRoot = await client.readContract({
  address: sepolia.contracts.ensUniversalResolver.address,
  abi: parseAbi(["function ROOT_REGISTRY() view returns (address)"]),
  functionName: "ROOT_REGISTRY",
});
const liveEth = await client.readContract({
  address: liveRoot,
  abi: registryAbi,
  functionName: "getSubregistry",
  args: ["eth"],
});
if (
  liveRoot.toLowerCase() !== ENSV2_SEPOLIA.rootRegistry ||
  liveEth.toLowerCase() !== ethRegistry
) {
  process.stderr.write(
    `ENSv2 on Sepolia was redeployed (root ${liveRoot}, .eth ${liveEth}). Update ENSV2_SEPOLIA in src/main/chain/ensCalls.ts from ensdomains/contracts-v2 deployments.\n`,
  );
  process.exit(1);
}

const envResolver = dryRun ? undefined : process.env.UNWRITTEN_ENS_RESOLVER;
const envRegistry = dryRun ? undefined : process.env.UNWRITTEN_ENS_REGISTRY;
const resolver =
  (envResolver as Address | undefined) ??
  (await deploy(exec, "deploy Permissioned Resolver", deployResolverCall(exec.account)));
const registry =
  (envRegistry as Address | undefined) ??
  (await deploy(
    exec,
    `deploy User Registry for ${parent}`,
    deployRegistryCall(exec.account, parent),
  ));

if (await read(exec, ethRegistrar, registrarAbi, "isAvailable", [label])) {
  const minimum = (await read(
    exec,
    ethRegistrar,
    registrarAbi,
    "MIN_REGISTER_DURATION",
    [],
  )) as bigint;
  const duration = minimum > 31_536_000n ? minimum : 31_536_000n;
  const [base, premium] = (await read(exec, ethRegistrar, registrarAbi, "getRegisterPrice", [
    label,
    duration,
    mockUsdc,
  ])) as [bigint, bigint];
  const price = base + premium;
  say(`  price ${Number(price) / 1e6} MockUSDC for ${duration / 86_400n} days`);
  await exec.send(call(mockUsdc, usdcAbi, "mint", [exec.account, price]), "mint MockUSDC");
  await exec.send(call(mockUsdc, usdcAbi, "approve", [ethRegistrar, price]), "approve registrar");
  const secret = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const commitment = (await read(exec, ethRegistrar, registrarAbi, "makeCommitment", [
    label,
    exec.account,
    secret,
    registry,
    resolver,
    duration,
    zeroHash,
  ])) as Hex;
  await exec.send(call(ethRegistrar, registrarAbi, "commit", [commitment]), "commit");
  const age = (await read(exec, ethRegistrar, registrarAbi, "MIN_COMMITMENT_AGE", [])) as bigint;
  say(`  waiting ${age + 2n} s for the commitment to age…`);
  await exec.wait(age + 2n);
  await exec.send(
    call(ethRegistrar, registrarAbi, "register", [
      label,
      exec.account,
      secret,
      registry,
      resolver,
      duration,
      mockUsdc,
      zeroHash,
    ]),
    `register ${parent}`,
  );
} else {
  const state = (await read(exec, ethRegistry, registryAbi, "getState", [labelId(label)])) as {
    latestOwner: Address;
  };
  if (state.latestOwner.toLowerCase() !== exec.account.toLowerCase()) {
    process.stderr.write(`${parent} belongs to ${state.latestOwner}; pick another label.\n`);
    process.exit(1);
  }
  await exec.send(
    call(ethRegistry, registryAbi, "setSubregistry", [labelId(label), registry]),
    "point subregistry",
  );
  await exec.send(
    call(ethRegistry, registryAbi, "setResolver", [labelId(label), resolver]),
    "point resolver",
  );
}
await exec.send(
  call(registry, registryAbi, "setParent", [ethRegistry, label]),
  "set registry parent",
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
  const state = (await read(exec, registry, registryAbi, "getState", [labelId(sub)])) as {
    status: number;
    latestOwner: Address;
  };
  const direct = textQuery(name, "unwritten.cartridge");
  const held = decodeFunctionResult({
    abi: textProfileAbi,
    functionName: "text",
    data: (await read(exec, resolver, resolverAbi, "resolve", [direct.name, direct.data])) as Hex,
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
    universalResolverAbi,
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
