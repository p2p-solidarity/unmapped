// The world service's chain settings (rev 6 phase 4, D6), read from its own environment:
//
//   SERVICE_CHAIN_RPC_URL        where to send transactions (Ethereum Sepolia in development)
//   SERVICE_CHAIN_KEY            the recorder: a funded EVM key that pays for and sends every record
//   SERVICE_PROVENANCE_ADDRESS   the WorldProvenance contract a person deployed
//   SERVICE_CHAIN_ID             optional; when set, the RPC must report this chain
//
// Off by default: with none of the three required values set, the service records nothing and
// says nothing. With some but not all, or a malformed value, it keeps running with recording off
// and logs why once (the key's value is never logged). Players never sign or pay; the key lives
// only in the service's environment.

import { EVM_ADDRESS, type Hex } from "@shared/provenance";
import { err, ok, type Result } from "@shared/result";

export interface ChainEnv {
  rpcUrl: string;
  /** From SERVICE_CHAIN_ID, or null to take the RPC's. */
  chainId: number | null;
  key: Hex;
  contract: Hex;
}

export const CHAIN_VARS = [
  "SERVICE_CHAIN_RPC_URL",
  "SERVICE_CHAIN_KEY",
  "SERVICE_PROVENANCE_ADDRESS",
] as const;

const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/;

/** The chain settings, null when recording is off, or why the settings cannot be used. */
export function chainEnv(
  env: Readonly<Record<string, string | undefined>>,
): Result<ChainEnv | null> {
  const set = CHAIN_VARS.filter((name) => (env[name] ?? "").trim() !== "");
  if (set.length === 0) return ok(null);
  const hint = `Set all of ${CHAIN_VARS.join(", ")} to record provenance, or none to keep it off.`;
  if (set.length < CHAIN_VARS.length) {
    const missing = CHAIN_VARS.filter((name) => !set.includes(name));
    return err(
      "service-chain-partial",
      `Provenance recording is off: ${missing.join(", ")} unset.`,
      hint,
    );
  }
  const rpcUrl = (env.SERVICE_CHAIN_RPC_URL ?? "").trim();
  const key = (env.SERVICE_CHAIN_KEY ?? "").trim();
  const contract = (env.SERVICE_PROVENANCE_ADDRESS ?? "").trim();
  const idText = (env.SERVICE_CHAIN_ID ?? "").trim();
  if (!/^https?:\/\/\S+$/.test(rpcUrl)) {
    return err("service-chain-invalid", "SERVICE_CHAIN_RPC_URL is not an http(s) URL.", hint);
  }
  if (!PRIVATE_KEY.test(key)) {
    return err("service-chain-invalid", "SERVICE_CHAIN_KEY is not a 32-byte hex key.", hint);
  }
  if (!EVM_ADDRESS.test(contract)) {
    return err("service-chain-invalid", "SERVICE_PROVENANCE_ADDRESS is not an address.", hint);
  }
  const chainId = idText === "" ? null : Number(idText);
  if (chainId !== null && (!Number.isSafeInteger(chainId) || chainId <= 0)) {
    return err("service-chain-invalid", "SERVICE_CHAIN_ID is not a chain id.", hint);
  }
  return ok({ rpcUrl, chainId, key: key as Hex, contract: contract.toLowerCase() as Hex });
}
