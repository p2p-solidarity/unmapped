// Makes `<label>.eth` on Sepolia ENSv2 a parent that names can be written under. `pointDotEth`
// registers the .eth name through the ETH Registrar (commit → wait → register, paid in MockUSDC, which
// anyone may mint) pointing at a given registry and resolver — or, when the key already owns it,
// repoints it at them. `setUpParent` first deploys this key's own Permissioned Resolver and a User
// Registry for the parent (Verifiable Factory proxies), points the name at them and sets the
// registry's parent: the setup cartridge names use.

import {
  type Abi,
  type Address,
  type Hex,
  type Log,
  type PublicClient,
  parseAbi,
  parseEventLogs,
  toHex,
  zeroHash,
} from "viem";
import { sepolia } from "viem/chains";
import {
  deployRegistryCall,
  deployResolverCall,
  ENSV2_SEPOLIA,
  factoryAbi,
  labelId,
  registrarAbi,
  registryAbi,
  usdcAbi,
} from "../../src/main/chain/ensCalls";
import { type Call, call, type Exec, read } from "./chainExec";

export interface ParentSetup {
  parent: string;
  /** The parent's User Registry. */
  registry: Address;
  /** The key's Permissioned Resolver. */
  resolver: Address;
}

const say = (line: string) => process.stdout.write(`${line}\n`);

/** Throws unless the Universal Resolver still walks the deployment ENSV2_SEPOLIA names. */
export async function checkEnsDeployment(client: PublicClient): Promise<void> {
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
    liveEth.toLowerCase() !== ENSV2_SEPOLIA.ethRegistry
  ) {
    throw new Error(
      `ENSv2 on Sepolia was redeployed (root ${liveRoot}, .eth ${liveEth}). Update ENSV2_SEPOLIA in src/main/chain/ensCalls.ts from ensdomains/contracts-v2 deployments.`,
    );
  }
}

async function deploy(exec: Exec, what: string, request: Call): Promise<Address> {
  const logs: Log[] = await exec.send(request, what);
  const [deployed] = parseEventLogs({ abi: factoryAbi, eventName: "ProxyDeployed", logs });
  if (deployed === undefined) throw new Error(`${what}: no ProxyDeployed event`);
  return deployed.args.proxyAddress;
}

/** Registers `<label>.eth` pointing at `registry` and `resolver`, or repoints it if the key owns it. */
export async function pointDotEth(
  exec: Exec,
  label: string,
  registry: Address,
  resolver: Address,
): Promise<void> {
  const parent = `${label}.eth`;
  const { ethRegistrar, ethRegistry, mockUsdc } = ENSV2_SEPOLIA;
  if (await read(exec, ethRegistrar, registrarAbi as Abi, "isAvailable", [label])) {
    const minimum = (await read(
      exec,
      ethRegistrar,
      registrarAbi as Abi,
      "MIN_REGISTER_DURATION",
      [],
    )) as bigint;
    const duration = minimum > 31_536_000n ? minimum : 31_536_000n;
    const [base, premium] = (await read(
      exec,
      ethRegistrar,
      registrarAbi as Abi,
      "getRegisterPrice",
      [label, duration, mockUsdc],
    )) as [bigint, bigint];
    const price = base + premium;
    say(`  price ${Number(price) / 1e6} MockUSDC for ${duration / 86_400n} days`);
    await exec.send(call(mockUsdc, usdcAbi as Abi, "mint", [exec.account, price]), "mint MockUSDC");
    await exec.send(
      call(mockUsdc, usdcAbi as Abi, "approve", [ethRegistrar, price]),
      "approve registrar",
    );
    const secret = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const commitment = (await read(exec, ethRegistrar, registrarAbi as Abi, "makeCommitment", [
      label,
      exec.account,
      secret,
      registry,
      resolver,
      duration,
      zeroHash,
    ])) as Hex;
    await exec.send(call(ethRegistrar, registrarAbi as Abi, "commit", [commitment]), "commit");
    const age = (await read(
      exec,
      ethRegistrar,
      registrarAbi as Abi,
      "MIN_COMMITMENT_AGE",
      [],
    )) as bigint;
    say(`  waiting ${age + 2n} s for the commitment to age…`);
    await exec.wait(age + 2n);
    await exec.send(
      call(ethRegistrar, registrarAbi as Abi, "register", [
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
    const state = (await read(exec, ethRegistry, registryAbi as Abi, "getState", [
      labelId(label),
    ])) as { latestOwner: Address };
    if (state.latestOwner.toLowerCase() !== exec.account.toLowerCase()) {
      throw new Error(`${parent} belongs to ${state.latestOwner}; pick another label.`);
    }
    await exec.send(
      call(ethRegistry, registryAbi as Abi, "setSubregistry", [labelId(label), registry]),
      "point subregistry",
    );
    await exec.send(
      call(ethRegistry, registryAbi as Abi, "setResolver", [labelId(label), resolver]),
      "point resolver",
    );
  }
}

export async function setUpParent(
  exec: Exec,
  label: string,
  reuse: { registry?: Address; resolver?: Address } = {},
): Promise<ParentSetup> {
  const parent = `${label}.eth`;
  const { ethRegistry } = ENSV2_SEPOLIA;
  const resolver =
    reuse.resolver ??
    (await deploy(exec, "deploy Permissioned Resolver", deployResolverCall(exec.account)));
  const registry =
    reuse.registry ??
    (await deploy(
      exec,
      `deploy User Registry for ${parent}`,
      deployRegistryCall(exec.account, parent),
    ));

  await pointDotEth(exec, label, registry, resolver);
  await exec.send(
    call(registry, registryAbi as Abi, "setParent", [ethRegistry, label]),
    "set registry parent",
  );
  return { parent, registry, resolver };
}
