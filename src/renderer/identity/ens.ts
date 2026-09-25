// ENS: the name points at the seed. `aether.seed` is a text record holding an https URL to a
// `.seed.enc` blob. Read-only, public RPC — no wallet, no signing, no key material near this file.
//
// ENSv2: every lookup goes through the Universal Resolver (viem ships its address per chain; never
// hard-code it), which also drives CCIP-Read gateways. ENSv2 is live as a preview on Sepolia; mainnet
// still resolves ENSv1 through the same entry point, so the network is the only switch.

import { err, ok, type Result, toError } from "@shared/result";
import { createPublicClient, fallback, http } from "viem";
import { mainnet, sepolia } from "viem/chains";
import { normalize } from "viem/ens";
import type { Bytes } from "./bytes";

/** Frozen: an on-chain text-record key. Renaming it would ignore every record already set. */
export const ENS_SEED_KEY = "aether.seed";
export const MAX_SEED_BYTES = 20 * 1024 * 1024;
export const SEED_FETCH_TIMEOUT_MS = 10_000;

export const ENS_NETWORKS = ["sepolia", "mainnet"] as const;
export type EnsNetwork = (typeof ENS_NETWORKS)[number];
/** Where ENSv2 is deployed today. */
export const DEFAULT_ENS_NETWORK: EnsNetwork = "sepolia";

const CHAINS = { sepolia, mainnet } as const;
const RPC_URLS: Record<EnsNetwork, string> = {
  sepolia: "https://ethereum-sepolia-rpc.publicnode.com",
  mainnet: "https://ethereum-rpc.publicnode.com",
};

const OFFLINE_HINT = "Check your network connection (or your RPC), then try again.";
const TOO_LARGE_HINT = `Seeds are capped at ${MAX_SEED_BYTES / (1024 * 1024)} MB.`;

export interface EnsSeed {
  network: EnsNetwork;
  /** ETH address record; null when the name has none (registering a name sets no records). */
  address: string | null;
  /** The `aether.seed` text record, or null when the name has no such record. */
  seedUrl: string | null;
}

function createClient(network: EnsNetwork) {
  // The chain's own RPC is the fallback when the public node is down.
  return createPublicClient({
    chain: CHAINS[network],
    transport: fallback([http(RPC_URLS[network]), http()]),
  });
}

const clients = new Map<EnsNetwork, ReturnType<typeof createClient>>();

export function ensClient(network: EnsNetwork): ReturnType<typeof createClient> {
  let client = clients.get(network);
  if (client === undefined) {
    client = createClient(network);
    clients.set(network, client);
  }
  return client;
}

/** Any dot-separated name may be ENS: `.eth`, DNS names imported into ENS, subnames. */
export function looksLikeEnsName(name: string): boolean {
  return name.includes(".") && name.length > 2;
}

export async function resolveEnsSeed(
  name: string,
  network: EnsNetwork = DEFAULT_ENS_NETWORK,
): Promise<Result<EnsSeed>> {
  const trimmed = name.trim();
  if (!looksLikeEnsName(trimmed)) {
    return err(
      "ens-invalid-name",
      `${trimmed.length === 0 ? "No ENS name given" : `${trimmed} has no dot`}.`,
      "Type a full name such as a .eth name or a DNS name imported into ENS.",
    );
  }
  let normalized: string;
  try {
    normalized = normalize(trimmed);
  } catch (cause) {
    return err(
      "ens-invalid-name",
      toError(cause, "ens-invalid-name").message,
      "ENS names must normalise under ENSIP-15.",
    );
  }

  try {
    const client = ensClient(network);
    const [address, seedUrl] = await Promise.all([
      client.getEnsAddress({ name: normalized }),
      client.getEnsText({ name: normalized, key: ENS_SEED_KEY }),
    ]);
    if (address === null && seedUrl === null) {
      return err(
        "ens-not-found",
        `${normalized} has no address or ${ENS_SEED_KEY} record on ${network}.`,
        "Check the spelling and the network, and that records were set on the name.",
      );
    }
    return ok({ network, address, seedUrl });
  } catch (cause) {
    return err("ens-unreachable", toError(cause, "ens-unreachable").message, OFFLINE_HINT);
  }
}

async function readCapped(response: Response): Promise<Result<Bytes>> {
  const body = response.body;
  if (body === null) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.length > MAX_SEED_BYTES) {
      return err("seed-too-large", `${buffer.length} bytes.`, TOO_LARGE_HINT);
    }
    return ok(buffer);
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value === undefined) continue;
    total += value.length;
    if (total > MAX_SEED_BYTES) {
      await reader.cancel();
      return err("seed-too-large", `More than ${MAX_SEED_BYTES} bytes.`, TOO_LARGE_HINT);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return ok(out);
}

/** Fetches a remote `.seed.enc`: https only, 10 s budget, 20 MB ceiling. */
export async function fetchRemoteSeed(url: string): Promise<Result<Bytes>> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return err("seed-url-invalid", `${url} is not a URL.`, "The aether.seed record must be a URL.");
  }
  if (parsed.protocol !== "https:") {
    return err(
      "seed-url-insecure",
      `Refusing to fetch over ${parsed.protocol}`,
      "Only https seed URLs are fetched.",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEED_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: "follow",
    });
    if (!response.ok) {
      return err(
        "seed-fetch-failed",
        `${response.status} ${response.statusText}`,
        "The seed URL in the aether.seed record did not serve a file.",
      );
    }
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_SEED_BYTES) {
      return err("seed-too-large", `Server declared ${declared} bytes.`, TOO_LARGE_HINT);
    }
    return await readCapped(response);
  } catch (cause) {
    if (controller.signal.aborted) {
      return err(
        "seed-timeout",
        `No response within ${SEED_FETCH_TIMEOUT_MS} ms.`,
        "The host is slow or unreachable; retry later.",
      );
    }
    return err("seed-fetch-failed", toError(cause, "seed-fetch-failed").message, OFFLINE_HINT);
  } finally {
    clearTimeout(timer);
  }
}
