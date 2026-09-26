// The gateway's operator commands (rev 6 phase 4, D1): `grant`, `token`, `revoke` and `set-key`.
// Allowance and .env tokens come only from here (or a verifier), never from an HTTP answer to the
// app. When a gateway is running on the data dir, the command is handed to it on loopback with the
// admin secret (so there is still one writer); otherwise the command takes the lock and writes the
// files itself. A token is printed once, as the line to paste into .env.

import { mkdirSync } from "node:fs";
import { err, ok, type Result } from "@shared/result";
import { SystemClock } from "./clock";
import type { Command } from "./config";
import { openStores } from "./gateway";
import { loadAdminSecret } from "./keyFile";
import { isAlive, readLock } from "./lock";
import { isLoopbackHost, writeSavedKey } from "./secrets";

type Operator = Extract<Command, { command: "grant" | "token" | "revoke" }>;

function adminBody(command: Operator): { path: string; body: unknown } {
  if (command.command === "grant") {
    return {
      path: "/v1/admin/grant",
      body: { account: command.account, credits: command.credits, period: command.period },
    };
  }
  if (command.command === "token") {
    return { path: "/v1/admin/token", body: { account: command.account, label: command.label } };
  }
  return { path: "/v1/admin/revoke", body: { tokenId: command.tokenId } };
}

async function viaRunning(command: Operator, host: string, port: number): Promise<Result<unknown>> {
  const secret = loadAdminSecret(command.data, false);
  if (!secret.ok) return secret;
  if (secret.value === null) {
    return err("gateway-cli", "The running gateway has no admin-secret file in its data dir.");
  }
  const target = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
  if (!isLoopbackHost(target)) {
    return err(
      "gateway-cli",
      `The running gateway listens on ${host}, not on this machine's loopback.`,
      "Stop it and run the command again, or restart it with --host 127.0.0.1 behind a proxy.",
    );
  }
  const { path, body } = adminBody(command);
  const url = `http://${target.includes(":") ? `[${target}]` : target}:${port}${path}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-unmapped-admin": secret.value.value },
      body: JSON.stringify(body),
    });
    const answer = (await response.json()) as { error?: { code: string; message: string } };
    if (!response.ok) {
      return err(
        answer.error?.code ?? "gateway-cli",
        answer.error?.message ?? `HTTP ${response.status}`,
      );
    }
    return ok(answer);
  } catch (error) {
    return err("gateway-cli", `Could not reach the running gateway at ${url}: ${String(error)}`);
  }
}

function direct(command: Operator): Result<unknown> {
  const stores = openStores(command.data, new SystemClock());
  if (!stores.ok) return stores;
  try {
    const { accounts, ledger } = stores.value;
    if (command.command === "grant") {
      if (!accounts.has(command.account)) {
        return err("account-unknown", `No account ${command.account} on this gateway.`);
      }
      return ledger.grant(command.account, command.credits, command.period);
    }
    if (command.command === "token") return accounts.issueCliToken(command.account, command.label);
    const revoked = accounts.revoke(command.tokenId, "operator");
    return revoked.ok ? ok({ revoked: command.tokenId }) : revoked;
  } finally {
    stores.value.release();
  }
}

/** Runs one operator command; prints its result. Returns the exit code. */
export async function runOperator(command: Operator): Promise<number> {
  const lock = readLock(command.data);
  const running =
    lock !== null && lock.pid !== process.pid && isAlive(lock.pid) && lock.host !== "cli";
  const result = running ? await viaRunning(command, lock.host, lock.port) : direct(command);
  if (!result.ok) {
    console.error(`gateway: ${result.error.message}`);
    if (result.error.hint !== undefined) console.error(`  ${result.error.hint}`);
    return 1;
  }
  if (command.command === "token") {
    const { token, tokenId } = result.value as { token: string; tokenId: string };
    console.error(`gateway: token ${tokenId} for ${command.account}; paste this line into .env:`);
    console.log(`UNMAPPED_GATEWAY_KEY=${token}`);
    return 0;
  }
  console.log(JSON.stringify(result.value));
  return 0;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString("utf8").trim();
}

/** `set-key <name>`: the value comes from stdin, never argv (other users can read argv). */
export async function runSetKey(data: string, name: string, remove: boolean): Promise<number> {
  const value = remove ? null : await readStdin();
  if (value === "") {
    console.error("gateway: no key on stdin (to delete a saved key, pass --remove).");
    return 1;
  }
  try {
    mkdirSync(data, { recursive: true, mode: 0o700 });
  } catch {}
  const written = writeSavedKey(data, name, value);
  if (!written.ok) {
    console.error(`gateway: ${written.error.message}`);
    return 1;
  }
  console.error(
    `gateway: ${value === null ? "removed" : "saved"} key "${name}"; ` +
      "a running gateway reads keys at start, so restart it.",
  );
  return 0;
}
