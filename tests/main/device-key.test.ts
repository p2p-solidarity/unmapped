// The device key (rev 6 phase 3, D7) — isolated because E2E cannot corrupt a keychain on purpose.
//
// Failure modes guarded here (each test names one):
// 1. A corrupt, undecryptable, empty or foreign `device.key` is replaced by a fresh key, orphaning
//    every world this device owns (the `vault/store.ts` `getOrCreateKey` behaviour).
// 2. With the keychain unavailable, a key file is created or rewritten anyway.
// 3. A path that exists but cannot be read (a directory) is treated as absent and overwritten.
// 4. Two first runs racing each other each create a key, and one silently wins on disk while the
//    other signs with a key nobody kept.
// 5. A failed load is cached, so unlocking the keychain later still leaves the device without a key.
// 6. The key file is readable by other users (not 0600).

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DeviceIdentity,
  deviceKeyPath,
  type KeyCipher,
  loadDeviceKey,
} from "@main/identity/deviceKey";
import { verifyEvent } from "@shared/history/sign";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const PREFIX = "fake-keychain:";

/** Reversible "encryption" that refuses anything it did not write, like safeStorage. */
function fakeCipher(available = true): KeyCipher & { available: () => boolean; on: boolean } {
  const cipher = {
    on: available,
    available: () => cipher.on,
    encrypt: (plain: string) => new TextEncoder().encode(`${PREFIX}${btoa(plain)}`),
    decrypt: (blob: Uint8Array) => {
      const text = new TextDecoder().decode(blob);
      if (!text.startsWith(PREFIX)) throw new Error("cannot decrypt");
      return atob(text.slice(PREFIX.length));
    },
  };
  return cipher;
}

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "unmapped-device-key-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function code(result: { ok: boolean; error?: { code: string } }): string {
  return result.ok ? "ok" : (result.error?.code ?? "?");
}

async function bytes(path: string): Promise<string> {
  return (await readFile(path)).toString("base64");
}

describe("device key", () => {
  it("creates a 0600 key once and reads the same key back (6)", async () => {
    const cipher = fakeCipher();
    const first = await loadDeviceKey(root, cipher);
    const again = await loadDeviceKey(root, cipher);
    if (!first.ok || !again.ok) throw new Error("expected keys");
    expect(again.value.author).toBe(first.value.author);
    expect((await stat(deviceKeyPath(root))).mode & 0o777).toBe(0o600);
    const event = first.value.signEvent({
      v: 1,
      world: "",
      kind: "profile",
      author: first.value.author,
      at: "2026-09-27T08:00:00.000Z",
      seen: 0,
      body: { name: "Ann" },
    });
    expect(verifyEvent(event).ok).toBe(true);
  });

  it("never replaces a file it cannot decrypt, decode, or that is empty (1)", async () => {
    const cipher = fakeCipher();
    const path = deviceKeyPath(root);
    await mkdir(join(root, "identity"), { recursive: true });
    const cases: Array<[string, Uint8Array]> = [
      ["undecryptable", new TextEncoder().encode("garbage that no keychain wrote")],
      ["not a key", cipher.encrypt(JSON.stringify({ v: 1, secret: "AAAA", author: "k" }))],
      [
        "foreign author",
        cipher.encrypt(JSON.stringify({ v: 1, secret: "A".repeat(43), author: "kaaaa" })),
      ],
      ["empty", new Uint8Array()],
    ];
    for (const [, content] of cases) {
      await writeFile(path, content);
      const before = await bytes(path);
      const loaded = await loadDeviceKey(root, cipher);
      expect(code(loaded)).toBe("identity-key-unreadable");
      expect(await bytes(path)).toBe(before);
    }
  });

  it("does not create or touch a key while the keychain is unavailable (2)", async () => {
    const locked = fakeCipher(false);
    expect(code(await loadDeviceKey(root, locked))).toBe("identity-keychain-unavailable");
    await expect(stat(deviceKeyPath(root))).rejects.toThrow();
    const made = await loadDeviceKey(root, fakeCipher());
    if (!made.ok) throw new Error("expected a key");
    const before = await bytes(deviceKeyPath(root));
    expect(code(await loadDeviceKey(root, locked))).toBe("identity-keychain-unavailable");
    expect(await bytes(deviceKeyPath(root))).toBe(before);
  });

  it("treats an unreadable path as an error, never as absent (3)", async () => {
    await mkdir(deviceKeyPath(root), { recursive: true });
    expect(code(await loadDeviceKey(root, fakeCipher()))).toBe("identity-key-unreadable");
    expect((await stat(deviceKeyPath(root))).isDirectory()).toBe(true);
  });

  it("gives racing first runs one key (4)", async () => {
    const cipher = fakeCipher();
    const loads = await Promise.all(Array.from({ length: 8 }, () => loadDeviceKey(root, cipher)));
    const authors = new Set(loads.map((one) => (one.ok ? one.value.author : one.error.code)));
    expect(authors.size).toBe(1);
    const onDisk = await loadDeviceKey(root, cipher);
    expect(onDisk.ok && authors.has(onDisk.value.author)).toBe(true);
  });

  it("retries after the keychain is unlocked, with the key already on disk (5)", async () => {
    const cipher = fakeCipher();
    const made = await loadDeviceKey(root, cipher);
    if (!made.ok) throw new Error("expected a key");
    cipher.on = false;
    const identity = new DeviceIdentity(root, cipher);
    expect(code(await identity.get())).toBe("identity-keychain-unavailable");
    cipher.on = true;
    const later = await identity.get();
    expect(later.ok && later.value.author).toBe(made.value.author);
  });
});
