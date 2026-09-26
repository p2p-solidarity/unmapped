// Signs a batch of calls with a (software) passkey and carries it to the PasskeyAccountFactory the
// way the app's relayer does: the challenge is the account's digest of exactly these calls, the
// assertion becomes OpenZeppelin's WebAuthnAuth, and whoever sends it only pays the gas.

import { type Address, decodeFunctionResult, encodeFunctionData, hexToBytes, type Log } from "viem";
import {
  type AccountCall,
  passkeyAccount,
  passkeyAccountFactory,
  passkeyDigest,
} from "../../src/main/chain/lineageCalls";
import { toWebAuthnAuth, type WebAuthnAuth } from "../../src/shared/passkeyAuth";
import { type Call, type Exec, read } from "./chainExec";
import type { SoftPasskey } from "./softPasskey";

export const SEPOLIA_CHAIN_ID = 11155111n;

export interface SignedBatch {
  account: Address;
  calls: AccountCall[];
  deadline: bigint;
  auth: WebAuthnAuth;
  /** The factory call that carries the batch on chain. */
  request: Call;
}

export async function accountOf(exec: Exec, factory: Address, key: SoftPasskey): Promise<Address> {
  return (await read(exec, factory, passkeyAccountFactory.abi, "accountOf", [
    key.publicKey.qx,
    key.publicKey.qy,
  ])) as Address;
}

/** 0 until the account exists: calling an address without code returns nothing to decode. */
export async function accountNonce(exec: Exec, account: Address): Promise<bigint> {
  try {
    const data = await exec.read({
      to: account,
      data: encodeFunctionData({ abi: passkeyAccount.abi, functionName: "nonce" }),
    });
    return decodeFunctionResult({ abi: passkeyAccount.abi, functionName: "nonce", data }) as bigint;
  } catch {
    return 0n;
  }
}

export async function signBatch(
  exec: Exec,
  factory: Address,
  key: SoftPasskey,
  calls: AccountCall[],
): Promise<SignedBatch> {
  const account = await accountOf(exec, factory, key);
  const nonce = await accountNonce(exec, account);
  const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
  const challenge = hexToBytes(
    passkeyDigest({ chainId: SEPOLIA_CHAIN_ID, account, nonce, deadline, calls }),
  );
  const auth = toWebAuthnAuth(key.sign(challenge), challenge);
  if (!auth.ok) throw new Error(auth.error.message);
  return {
    account,
    calls,
    deadline,
    auth: auth.value,
    request: {
      to: factory,
      data: encodeFunctionData({
        abi: passkeyAccountFactory.abi,
        functionName: "execute",
        args: [key.publicKey.qx, key.publicKey.qy, calls, deadline, auth.value],
      }),
    },
  };
}

export async function passkeyExecute(
  exec: Exec,
  factory: Address,
  key: SoftPasskey,
  calls: AccountCall[],
  what: string,
): Promise<SignedBatch & { logs: Log[] }> {
  const batch = await signBatch(exec, factory, key, calls);
  const logs = await exec.send(batch.request, what);
  return { ...batch, logs };
}
