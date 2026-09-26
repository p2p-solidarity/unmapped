// This device's Ed25519 key (rev 6 phase 3, D7): `<userData>/identity/device.key`, the secret kept
// encrypted by the OS keychain (Electron safeStorage, behind `KeyCipher` so this file never imports
// electron and runs in vitest). The secret never leaves this module: callers get a `DeviceKey`
// whose methods sign, never the bytes.
//
// Key errors never regenerate. That is the opposite of `vault/store.ts` `getOrCreateKey`, which
// makes a new key when its stored one does not decode — right for a wrapping key that can be
// re-enrolled, wrong here: a new device key would orphan every world this device owns. So:
//   - no keychain                          → `identity-keychain-unavailable`, the file untouched;
//   - the file exists but cannot be read,
//     decrypted or decoded, or is empty    → `identity-key-unreadable`, the file untouched;
//   - only a file that does not exist (ENOENT) is created, and creation never replaces a file:
//     the key is written to a temp file and hard-linked into place (`link` fails on EEXIST), so
//     two first runs racing each other end up reading the same key.

import { randomBytes } from "node:crypto";
import { chmod, link, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type KeyChange, signKeyChange, signPairing, signSignIn } from "@shared/account";
import { base64Url, fromBase64Url } from "@shared/history/ids";
import {
  authorKeyFor,
  blobAuthHeader,
  newSecretKey,
  signEvent,
  signInvite,
  signWsAuth,
} from "@shared/history/sign";
import type {
  EventKind,
  HistoryEventOf,
  Invite,
  UnsignedEventOf,
  UnsignedInvite,
} from "@shared/history/types";
import { err, fail, ok, type Result, toError } from "@shared/result";

export const IDENTITY_DIR = "identity";
export const DEVICE_KEY_FILE = "device.key";

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;
const FORMAT = 1;

/** The OS keychain's string encryption (Electron `safeStorage`), injectable for tests. */
export interface KeyCipher {
  available(): boolean;
  encrypt(plain: string): Uint8Array;
  decrypt(blob: Uint8Array): string;
}

/** Signs as this device. The secret stays inside the closure. */
export interface DeviceKey {
  /** "k" + base32(public key): this device's author key in every world. */
  readonly author: string;
  signEvent<K extends EventKind>(unsigned: UnsignedEventOf<K>): HistoryEventOf<K>;
  signInvite(unsigned: UnsignedInvite): Invite;
  signWsAuth(nonce: string, serviceKey: string): string;
  blobAuth(request: { method: string; path: string; ts: number; body: Uint8Array }): string;
  /**
   * The gateway's own texts (phase 4, D1; @shared/account), each under its own "unmapped-…:v1"
   * line, so none verifies as a world event and no event signature verifies at the gateway.
   */
  readonly account: {
    signIn(nonce: string, gatewayKey: string): string;
    pairing(nonce: string, gatewayKey: string): string;
    keyChange(action: KeyChange, accountId: string, key: string): string;
  };
}

const KEYCHAIN_HINT =
  "Unlock your OS keychain (macOS Keychain / gnome-keyring / Windows DPAPI) and restart UNMAPPED. Shared worlds read without it; writing, sharing and migrating wait.";
const UNREADABLE_HINT =
  "This device's world key is damaged or was made under another OS account. It was left untouched: restore identity/device.key from a backup of this user folder. Shared worlds still read; writing waits.";

export function deviceKeyPath(userData: string): string {
  return join(userData, IDENTITY_DIR, DEVICE_KEY_FILE);
}

function wrap(secret: Uint8Array): DeviceKey {
  const author = authorKeyFor(secret);
  return {
    author,
    signEvent: (unsigned) => signEvent(unsigned, secret),
    signInvite: (unsigned) => signInvite(unsigned, secret),
    signWsAuth: (nonce, serviceKey) => signWsAuth(secret, nonce, serviceKey),
    blobAuth: (request) => blobAuthHeader(secret, request),
    account: {
      signIn: (nonce, gatewayKey) => signSignIn(secret, nonce, gatewayKey),
      pairing: (nonce, gatewayKey) => signPairing(secret, nonce, gatewayKey),
      keyChange: (action, accountId, key) => signKeyChange(secret, action, accountId, key),
    },
  };
}

function encode(secret: Uint8Array): string {
  return JSON.stringify({ v: FORMAT, secret: base64Url(secret), author: authorKeyFor(secret) });
}

/** The secret a decrypted file spells, or null when it is not exactly what `encode` writes. */
function decode(text: string): Uint8Array | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (record.v !== FORMAT || typeof record.secret !== "string") return null;
  const secret = fromBase64Url(record.secret);
  if (secret === null || secret.length !== 32) return null;
  return record.author === authorKeyFor(secret) ? secret : null;
}

function unreadable(why: string): Result<never> {
  return err(
    "identity-key-unreadable",
    `This device's world key cannot be used: ${why}.`,
    UNREADABLE_HINT,
  );
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

async function readExisting(path: string, cipher: KeyCipher): Promise<Result<DeviceKey> | null> {
  let blob: Uint8Array;
  try {
    blob = new Uint8Array(await readFile(path));
  } catch (error) {
    if (isMissing(error)) return null;
    return unreadable(`the file cannot be read (${toError(error).message})`);
  }
  if (blob.length === 0) return unreadable("the file is empty");
  let text: string;
  try {
    text = cipher.decrypt(blob);
  } catch {
    return unreadable("the OS keychain cannot decrypt it");
  }
  const secret = decode(text);
  return secret === null ? unreadable("its contents are not a device key") : ok(wrap(secret));
}

/** Writes a fresh key only where no file exists; an existing file (even a racing one) wins. */
async function create(path: string, cipher: KeyCipher): Promise<Result<DeviceKey> | null> {
  const staged = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(staged, cipher.encrypt(encode(newSecretKey())), { mode: FILE_MODE });
    await chmod(staged, FILE_MODE);
    await link(staged, path);
    return null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === "EEXIST") return null;
    return fail(toError(error, "identity-key-write-failed"));
  } finally {
    await rm(staged, { force: true }).catch(() => undefined);
  }
}

/**
 * The device key, created on first use. Every failure is an error with a hint and leaves any
 * existing file exactly as it was.
 */
export async function loadDeviceKey(
  userData: string,
  cipher: KeyCipher,
): Promise<Result<DeviceKey>> {
  if (!cipher.available()) {
    return err(
      "identity-keychain-unavailable",
      "The OS keychain is not available, so this device's world key cannot be opened.",
      KEYCHAIN_HINT,
    );
  }
  const path = deviceKeyPath(userData);
  const existing = await readExisting(path, cipher);
  if (existing !== null) return existing;
  try {
    await mkdir(join(userData, IDENTITY_DIR), { recursive: true, mode: DIR_MODE });
  } catch (error) {
    return fail(toError(error, "identity-key-write-failed"));
  }
  const created = await create(path, cipher);
  if (created !== null) return created;
  // Read back what is on disk now: ours, or the one a racing first run linked first.
  return (await readExisting(path, cipher)) ?? unreadable("it vanished while being created");
}

/**
 * One device key per process: a success is kept, a failure is not (the keychain may be unlocked
 * later), and concurrent callers share one load so two first runs cannot both create.
 */
export class DeviceIdentity {
  private key: DeviceKey | null = null;
  private loading: Promise<Result<DeviceKey>> | null = null;

  constructor(
    private readonly userData: string,
    private readonly cipher: KeyCipher,
  ) {}

  get(): Promise<Result<DeviceKey>> {
    if (this.key !== null) return Promise.resolve(ok(this.key));
    this.loading ??= loadDeviceKey(this.userData, this.cipher)
      .then((result) => {
        if (result.ok) this.key = result.value;
        return result;
      })
      .finally(() => {
        this.loading = null;
      });
    return this.loading;
  }
}
