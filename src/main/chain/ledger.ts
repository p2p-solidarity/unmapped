// Main-side ledger adapter. Reads need `UNWRITTEN_RPC_URL` + `UNWRITTEN_LEDGER_ADDRESS`; writing
// also needs `UNWRITTEN_PRIVATE_KEY`, which stays in this process (Rule 6) and is never logged.
// Every failure is a Result with a hint; the app works with no chain configured at all.

import {
  fromBytes32,
  LEDGER_KINDS,
  LEDGER_NOTE_MAX,
  type LedgerConfig,
  type LedgerRevision,
  type PublishOnChainInput,
  toBytes32,
  type WitnessOnChainInput,
  ZERO_HASH,
} from "@shared/chain";
import { err, ok, type Result, toError } from "@shared/result";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import artifact from "../../../contracts/UnwrittenLedger.json";

const ABI = artifact.abi;

/** Explorers for the chains a hackathon build is likely to use; unknown chains simply have none. */
const EXPLORERS: Record<number, string> = {
  1: "https://etherscan.io/tx/",
  11155111: "https://sepolia.etherscan.io/tx/",
  8453: "https://basescan.org/tx/",
  84532: "https://sepolia.basescan.org/tx/",
};

export interface LedgerEnv {
  rpcUrl?: string;
  address?: string;
  privateKey?: string;
  chainId?: string;
}

function readEnv(env: NodeJS.ProcessEnv = process.env): LedgerEnv {
  return {
    rpcUrl: env.UNWRITTEN_RPC_URL,
    address: env.UNWRITTEN_LEDGER_ADDRESS,
    privateKey: env.UNWRITTEN_PRIVATE_KEY,
    chainId: env.UNWRITTEN_CHAIN_ID,
  };
}

function isAddress(value: string | undefined): value is Address {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function ledgerConfig(env: LedgerEnv = readEnv()): LedgerConfig {
  const chainId = Number(env.chainId ?? "0") || null;
  const readable =
    typeof env.rpcUrl === "string" && env.rpcUrl.length > 0 && isAddress(env.address);
  return {
    readable,
    writable: readable && typeof env.privateKey === "string" && env.privateKey.length > 0,
    chainId,
    address: isAddress(env.address) ? env.address : null,
    explorer: chainId === null ? null : (EXPLORERS[chainId] ?? null),
  };
}

export interface LedgerClients {
  public: PublicClient;
  wallet: WalletClient | null;
  address: Address;
}

/** Built per call so a changed .env takes effect without a restart. Injectable for tests. */
export function ledgerClients(env: LedgerEnv = readEnv()): Result<LedgerClients> {
  const config = ledgerConfig(env);
  if (!config.readable || !isAddress(env.address)) {
    return err(
      "ledger-not-configured",
      "No ledger is configured.",
      "Set UNWRITTEN_RPC_URL and UNWRITTEN_LEDGER_ADDRESS in .env (and UNWRITTEN_PRIVATE_KEY to publish).",
    );
  }
  const chain = defineChain({
    id: config.chainId ?? 31337,
    name: "unwritten-ledger",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [env.rpcUrl ?? ""] } },
  });
  const transport = http(env.rpcUrl);
  const publicClient = createPublicClient({ chain, transport });
  const wallet =
    env.privateKey === undefined || env.privateKey.length === 0
      ? null
      : createWalletClient({
          chain,
          transport,
          account: privateKeyToAccount(env.privateKey as `0x${string}`),
        });
  return ok({ public: publicClient as PublicClient, wallet, address: env.address });
}

export async function lookupRevision(
  contentHash: string,
  clients?: LedgerClients,
): Promise<Result<LedgerRevision | null>> {
  const hash = toBytes32(contentHash);
  if (hash === null) return err("ledger-bad-hash", `${contentHash} is not a sha256 content hash.`);
  const resolved = clients === undefined ? ledgerClients() : ok(clients);
  if (!resolved.ok) return resolved;
  try {
    const revision = (await resolved.value.public.readContract({
      address: resolved.value.address,
      abi: ABI,
      functionName: "revisionOf",
      args: [hash],
    })) as { author: Address; parent: string; publishedAt: bigint; kind: number; uri: string };
    if (/^0x0{40}$/i.test(revision.author)) return ok(null);
    return ok({
      contentHash,
      author: revision.author,
      parent: fromBytes32(revision.parent),
      publishedAt: new Date(Number(revision.publishedAt) * 1000).toISOString(),
      kind: LEDGER_KINDS[revision.kind] ?? "world",
      uri: revision.uri,
    });
  } catch (error) {
    return err("ledger-read-failed", toError(error, "ledger").message, "Check UNWRITTEN_RPC_URL.");
  }
}

async function write(
  functionName: "publish" | "witness",
  args: readonly unknown[],
  clients?: LedgerClients,
): Promise<Result<{ txHash: string }>> {
  const resolved = clients === undefined ? ledgerClients() : ok(clients);
  if (!resolved.ok) return resolved;
  const wallet = resolved.value.wallet;
  if (wallet === null || wallet.account === undefined) {
    return err(
      "ledger-read-only",
      "This machine has no signing key for the ledger.",
      "Set UNWRITTEN_PRIVATE_KEY in .env to publish; reading works without it.",
    );
  }
  try {
    const { request } = await resolved.value.public.simulateContract({
      address: resolved.value.address,
      abi: ABI,
      functionName,
      args,
      account: wallet.account,
    });
    const txHash = await wallet.writeContract(request);
    return ok({ txHash });
  } catch (error) {
    return err(
      "ledger-write-failed",
      toError(error, "ledger").message,
      "The chain refused the transaction; check the balance, the address, and whether this hash was already published.",
    );
  }
}

export function publishRevisionOnChain(
  input: PublishOnChainInput,
  clients?: LedgerClients,
): Promise<Result<{ txHash: string }>> {
  const hash = toBytes32(input.contentHash);
  if (hash === null) {
    return Promise.resolve(err("ledger-bad-hash", `${input.contentHash} is not a content hash.`));
  }
  const parent = input.parent === null ? ZERO_HASH : toBytes32(input.parent);
  if (parent === null) {
    return Promise.resolve(err("ledger-bad-hash", `${input.parent} is not a content hash.`));
  }
  const kind = LEDGER_KINDS.indexOf(input.kind);
  return write("publish", [hash, parent, kind, input.uri.slice(0, 400)], clients);
}

export function witnessOnChain(
  input: WitnessOnChainInput,
  clients?: LedgerClients,
): Promise<Result<{ txHash: string }>> {
  const hash = toBytes32(input.contentHash);
  if (hash === null) {
    return Promise.resolve(err("ledger-bad-hash", `${input.contentHash} is not a content hash.`));
  }
  return write("witness", [hash, input.note.slice(0, LEDGER_NOTE_MAX)], clients);
}
