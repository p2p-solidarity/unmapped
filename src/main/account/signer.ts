// This device's key as the gateway sees it (rev 6 phase 4, D1): the same Ed25519 device key that
// signs world history, signing the gateway's own texts — sign-in, the pairing request and the add /
// remove statements. Identity signs them (`DeviceKey.account`, main/identity/deviceKey.ts), each
// under its own "unmapped-…:v1" line, so none verifies as a world event; the secret never leaves
// identity. The key comes from identity's one loader (`DeviceIdentity`), with its never-regenerate
// rules.

import type { KeyChange } from "@shared/account";
import type { Result } from "@shared/result";
import { DeviceIdentity, type KeyCipher } from "../identity/deviceKey";
import { electronCipher } from "../identity/safeStorage";

export interface AccountSigner {
  /** "k" + base32(public key): this device in every world and in its gateway account. */
  readonly key: string;
  signIn(nonce: string, gatewayKey: string): string;
  pairing(nonce: string, gatewayKey: string): string;
  keyChange(action: KeyChange, accountId: string, key: string): string;
}

/** One signer per process: identity keeps a loaded key and retries a failed load next time. */
export class DeviceSigner {
  private readonly identity: DeviceIdentity;

  constructor(userData: string, cipher: KeyCipher = electronCipher()) {
    this.identity = new DeviceIdentity(userData, cipher);
  }

  async get(): Promise<Result<AccountSigner>> {
    const device = await this.identity.get();
    if (!device.ok) return device;
    return { ok: true, value: { key: device.value.author, ...device.value.account } };
  }
}
