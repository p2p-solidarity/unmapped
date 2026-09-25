// ENS: the name points at the seed. `aether.seed` is a text record holding an https URL to a
// `.seed.enc` blob; the address is what proves the name resolves at all. Read-only, mainnet,
// public RPC — no wallet, no signing, no key material anywhere near this file.

import { err, ok, type Result, toError } from "@shared/result";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import type { Bytes } from "./bytes";

export const ENS_SEED_KEY = "aether.seed";
export const MAX_SEED_BYTES = 20 * 1024 * 1024;
export const SEED_FETCH_TIMEOUT_MS = 10_000;

const OFFLINE_HINT =
  "Mainnet could not be reached. Check your network connection (or your RPC), then retry.";
const TOO_LARGE_HINT = `Seeds are capped at ${MAX_SEED_BYTES / (1024 * 1024)} MB.`;

export interface EnsSeed {
  address: string;
  /** The `aether.seed` text record, or null when the name has no such record. */
  seedUrl: string | null;
}

let client: ReturnType<typeof createClient> | null = null;

function createClient() {
  return createPublicClient({ chain: mainnet, transport: http() });
}

function publicClient(): ReturnType<typeof createClient> {
  if (client === null) client = createClient();
  return client;
}

export async function resolveEnsSeed(name: string): Promise<Result<EnsSeed>> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return err("ens-invalid-name", "No ENS name given.", "Type a name ending in .eth.");
  }
  let normalized: string;
  try {
    normalized = normalize(trimmed);
  } catch (cause) {
    return err(
      "ens-invalid-name",
      toError(cause, "ens-invalid-name").message,
      "ENS names must be UTS-46 normalisable.",
    );
  }

  try {
    const address = await publicClient().getEnsAddress({ name: normalized });
    if (address === null) {
      return err(
        "ens-not-found",
        `${normalized} does not resolve to an address.`,
        "Check the spelling, or set an address record on the name.",
      );
    }
    const seedUrl = await publicClient().getEnsText({ name: normalized, key: ENS_SEED_KEY });
    return ok({ address, seedUrl });
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
