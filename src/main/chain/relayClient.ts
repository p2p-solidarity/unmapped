// Main's side of the gas station (src/relay, @shared/relay). The app holds no key that pays gas:
// it asks the station at UNWRITTEN_LINEAGE_RELAY for one transaction at a time, then waits for the
// receipt itself on its own RPC. Every answer is untrusted input and parsed with zod.

import {
  type RelayRequest,
  type RelayStatus,
  relayAnswerSchema,
  relayStatusSchema,
} from "@shared/relay";
import { err, ok, type Result } from "@shared/result";
import type { PublicClient } from "viem";

const ASK_MS = 45_000;

/** A station URL from the environment, or null when none (or not http/https) is set. */
export function relayUrl(env: NodeJS.ProcessEnv): string | null {
  const raw = env.UNWRITTEN_LINEAGE_RELAY?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

const unreachable = (base: string) =>
  err(
    "market-relay-unreachable",
    `The gas station at ${base} did not answer.`,
    "Check the connection, or UNWRITTEN_LINEAGE_RELAY in .env.",
  );

/** Asks the station to send one transaction; resolves with its hash once the station sent it. */
export async function askRelay(
  base: string,
  request: RelayRequest,
): Promise<Result<`0x${string}`>> {
  let body: unknown;
  try {
    const response = await fetch(`${base}/relay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(ASK_MS),
    });
    body = await response.json();
  } catch {
    return unreachable(base);
  }
  const answer = relayAnswerSchema.safeParse(body);
  if (!answer.success) {
    return err(
      "market-relay-invalid",
      "The gas station answered something unexpected.",
      "Check UNWRITTEN_LINEAGE_RELAY in .env.",
    );
  }
  if (!answer.data.ok) {
    return err(answer.data.code, answer.data.message, answer.data.hint ?? "Refresh and try again.");
  }
  return ok(answer.data.txHash);
}

/** Asks, then waits for the receipt on main's own RPC; a revert is an error. */
export async function relayed(
  base: string,
  client: PublicClient,
  request: RelayRequest,
): Promise<Result<`0x${string}`>> {
  const sent = await askRelay(base, request);
  if (!sent.ok) return sent;
  try {
    const receipt = await client.waitForTransactionReceipt({ hash: sent.value, timeout: 120_000 });
    return receipt.status === "success"
      ? ok(sent.value)
      : err("market-reverted", `Transaction ${sent.value} reverted.`, "Refresh and try again.");
  } catch {
    return err(
      "market-unconfirmed",
      `Transaction ${sent.value} was sent but not seen on Sepolia yet.`,
      "Check it on Etherscan, then refresh.",
    );
  }
}

/** The station's public facts: its address and how much Sepolia ETH it has left. */
export async function relayStatus(base: string): Promise<Result<RelayStatus>> {
  try {
    const response = await fetch(`${base}/status`, { signal: AbortSignal.timeout(10_000) });
    const parsed = relayStatusSchema.safeParse(await response.json());
    return parsed.success ? ok(parsed.data) : unreachable(base);
  } catch {
    return unreachable(base);
  }
}
