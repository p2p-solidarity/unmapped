// Reading a cartridge's (or a save's) ENS name: its text records through the Universal Resolver on
// Sepolia, where ENSv2 lives. Public and read-only — any machine can follow a name, key or no key.
// viem ships the Universal Resolver's address per chain (never hard-code it), and the resolver also
// drives CCIP-Read gateways.

import { doorFromDescription } from "@shared/doorCode";
import {
  type CartridgePointer,
  ENS_CARTRIDGE_KEYS,
  ENS_SAVE_KEYS,
  type EnsLookup,
  pointerFromTexts,
} from "@shared/ensNames";
import { err, ok, type Result, toError } from "@shared/result";
import { createPublicClient, fallback, http } from "viem";
import { sepolia } from "viem/chains";
import { normalize } from "viem/ens";

const SEPOLIA_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

function createClient() {
  // The chain's own RPC is the fallback when the public node is down.
  return createPublicClient({
    chain: sepolia,
    transport: fallback([http(SEPOLIA_RPC_URL), http()]),
  });
}

let cached: ReturnType<typeof createClient> | null = null;

function ensClient(): ReturnType<typeof createClient> {
  cached ??= createClient();
  return cached;
}

/**
 * Any dot-separated name with letters may be ENS: `.eth`, DNS names imported into ENS, subnames.
 * A door number (門牌) never has a dot, so a field can take either and tell them apart.
 */
export function looksLikeEnsName(name: string): boolean {
  return name.includes(".") && name.length > 2 && /\p{L}/u.test(name);
}

/** The cartridge a name points at; null when the name carries no (complete) cartridge records. */
export async function lookupCartridgeName(name: string): Promise<Result<CartridgePointer | null>> {
  const trimmed = name.trim();
  if (!looksLikeEnsName(trimmed)) {
    return err(
      "ens-invalid-name",
      `${trimmed.length === 0 ? "No ENS name given" : `${trimmed} has no dot`}.`,
      "Type the cartridge's full name, such as its id followed by the parent .eth name.",
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
    const client = ensClient();
    const [cartridge, version, hash] = await Promise.all(
      [ENS_CARTRIDGE_KEYS.cartridge, ENS_CARTRIDGE_KEYS.version, ENS_CARTRIDGE_KEYS.hash].map(
        (key) => client.getEnsText({ name: normalized, key }),
      ),
    );
    return ok(
      pointerFromTexts({
        cartridge: cartridge ?? null,
        version: version ?? null,
        hash: hash ?? null,
      }),
    );
  } catch (cause) {
    return err(
      "ens-unreachable",
      toError(cause, "ens-unreachable").message,
      "Check your network connection (or your RPC), then try again.",
    );
  }
}

/**
 * A name → its revision, and its checkpoint when it names a save (`unwritten.kind` = "save"), with
 * the door number a save's `description` carries so a friend can walk in by name.
 */
export async function lookupEnsName(name: string): Promise<Result<EnsLookup | null>> {
  const pointer = await lookupCartridgeName(name);
  if (!pointer.ok || pointer.value === null) return pointer as Result<null>;
  try {
    const client = ensClient();
    const trimmed = normalize(name.trim());
    const [kind, saveHash, progress, description] = await Promise.all(
      [ENS_SAVE_KEYS.kind, ENS_SAVE_KEYS.save, ENS_SAVE_KEYS.progress, "description"].map((key) =>
        client.getEnsText({ name: trimmed, key }),
      ),
    );
    const save = kind === "save" && saveHash ? { saveHash, progress: progress ?? "" } : null;
    const door = kind === "save" ? doorFromDescription(description) : null;
    return ok({ pointer: pointer.value, save, door });
  } catch (cause) {
    return err(
      "ens-unreachable",
      toError(cause, "ens-unreachable").message,
      "Check your network connection (or your RPC), then try again.",
    );
  }
}
