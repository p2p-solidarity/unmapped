// Reading a cartridge's ENS name: its three text records through the Universal Resolver on Sepolia,
// where ENSv2 lives. Public and read-only — any machine can follow a name, key or no key.

import { type CartridgePointer, ENS_CARTRIDGE_KEYS, pointerFromTexts } from "@shared/ensNames";
import { err, ok, type Result, toError } from "@shared/result";
import { normalize } from "viem/ens";
import { ensClient, looksLikeEnsName } from "./ens";

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
    const client = ensClient("sepolia");
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
