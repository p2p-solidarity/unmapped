// Main-side writer for cartridge ENS names on Sepolia ENSv2. Needs the UNWRITTEN_ENS_* lines that
// `bun run ens:setup` prints, plus UNWRITTEN_PRIVATE_KEY, which stays in this process (Rule 6).
// The renderer only names a local revision; the id, version and hash written come from disk.

import {
  type CartridgePointer,
  type ClaimNameResult,
  cartridgeLabel,
  ENS_CARTRIDGE_KEYS,
  type EnsNamesConfig,
} from "@shared/ensNames";
import { err, ok, type Result, toError } from "@shared/result";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  decodeFunctionResult,
  type Hex,
  http,
  isAddress,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  labelId,
  NAME_STATUS,
  registryAbi,
  resolverAbi,
  subnameCalls,
  textProfileAbi,
  textQuery,
} from "./ensCalls";

const DEFAULT_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const SETUP_HINT =
  "Run `bun run ens:setup <label>` and put the UNWRITTEN_ENS_* lines it prints in .env.";

export interface EnsNamesEnv {
  parent?: string;
  registry?: string;
  resolver?: string;
  privateKey?: string;
  rpcUrl?: string;
}

interface Configured {
  parent: string;
  registry: Address;
  resolver: Address;
}

function readEnv(env: NodeJS.ProcessEnv = process.env): EnsNamesEnv {
  return {
    parent: env.UNWRITTEN_ENS_PARENT,
    registry: env.UNWRITTEN_ENS_REGISTRY,
    resolver: env.UNWRITTEN_ENS_RESOLVER,
    privateKey: env.UNWRITTEN_PRIVATE_KEY,
    rpcUrl: env.UNWRITTEN_ENS_RPC_URL,
  };
}

function configured(env: EnsNamesEnv): Configured | null {
  const parent = env.parent?.trim().toLowerCase();
  if (parent === undefined || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(parent)) return null;
  if (!isAddress(env.registry ?? "") || !isAddress(env.resolver ?? "")) return null;
  return { parent, registry: env.registry as Address, resolver: env.resolver as Address };
}

export function ensNamesConfig(env: EnsNamesEnv = readEnv()): EnsNamesConfig {
  const setup = configured(env);
  return {
    parent: setup?.parent ?? null,
    writable: setup !== null && typeof env.privateKey === "string" && env.privateKey.length > 0,
  };
}

/** The record as the resolver holds it; "" when it was never written. */
async function readText(client: PublicClient, resolver: Address, name: string, key: string) {
  const query = textQuery(name, key);
  try {
    const data = await client.readContract({
      address: resolver,
      abi: resolverAbi,
      functionName: "resolve",
      args: [query.name, query.data],
    });
    return decodeFunctionResult({ abi: textProfileAbi, functionName: "text", data });
  } catch {
    return "";
  }
}

/** Registers `<cartridgeId>.<parent>` if needed and points its records at this revision. */
export async function claimCartridgeName(
  pointer: CartridgePointer,
  env: EnsNamesEnv = readEnv(),
): Promise<Result<ClaimNameResult>> {
  const setup = configured(env);
  if (setup === null) {
    return err("ens-names-not-configured", "No ENS parent name is configured.", SETUP_HINT);
  }
  if (env.privateKey === undefined || env.privateKey.length === 0) {
    return err(
      "ens-names-read-only",
      "This machine has no signing key for ENS names.",
      "Set UNWRITTEN_PRIVATE_KEY in .env to write names; reading works without it.",
    );
  }
  const label = cartridgeLabel(pointer.cartridgeId);
  if (label === null) {
    return err(
      "ens-bad-label",
      `${pointer.cartridgeId} has no letters or digits to name.`,
      "Remix the cartridge under an id made of a–z, 0–9 and hyphens.",
    );
  }
  const name = `${label}.${setup.parent}`;
  const account = privateKeyToAccount(env.privateKey as Hex);
  const transport = http(env.rpcUrl || DEFAULT_RPC);
  const client = createPublicClient({ chain: sepolia, transport }) as PublicClient;
  const wallet = createWalletClient({ account, chain: sepolia, transport });

  try {
    const state = await client.readContract({
      address: setup.registry,
      abi: registryAbi,
      functionName: "getState",
      args: [labelId(label)],
    });
    const registered = state.status === NAME_STATUS.registered;
    const holder = registered
      ? await readText(client, setup.resolver, name, ENS_CARTRIDGE_KEYS.cartridge)
      : "";
    const ours = state.latestOwner.toLowerCase() === account.address.toLowerCase();
    if (state.status === NAME_STATUS.reserved || (registered && !ours)) {
      return err("ens-name-taken", `${name} is held by ${state.latestOwner}.`, SETUP_HINT);
    }
    if (holder !== "" && holder !== pointer.cartridgeId) {
      return err(
        "ens-name-taken",
        `${name} already names the cartridge ${holder}.`,
        "Two cartridge ids share this label; remix under a different id.",
      );
    }
    const calls = subnameCalls({
      owner: account.address,
      registry: setup.registry,
      resolver: setup.resolver,
      label,
      parent: setup.parent,
      register: !registered,
      texts: {
        [ENS_CARTRIDGE_KEYS.cartridge]: pointer.cartridgeId,
        [ENS_CARTRIDGE_KEYS.version]: pointer.version,
        [ENS_CARTRIDGE_KEYS.hash]: pointer.contentHash,
      },
    });
    const txHashes: string[] = [];
    for (const call of calls) {
      const hash = await wallet.sendTransaction(call);
      txHashes.push(hash);
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        return err("ens-write-failed", `Transaction ${hash} reverted.`, SETUP_HINT);
      }
    }
    return ok({ name, txHashes });
  } catch (cause) {
    return err(
      "ens-write-failed",
      toError(cause, "ens-write-failed").message,
      "Sepolia refused the transaction; check the key has Sepolia ETH and that UNWRITTEN_ENS_* came from `bun run ens:setup` with this key.",
    );
  }
}
