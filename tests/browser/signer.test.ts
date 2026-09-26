// The browser proof's WebCrypto device key (rev 6 phase 4, D7) against shared/history/sign.ts.
// Isolated because no E2E can see signature bytes: a service that refuses them only says "auth
// invalid", and a mis-spelled key would silently become a second member.
//
// Ways it could fail, each guarded below:
//   1. a WebCrypto Ed25519 signature that sign.ts's strict `verifyText` refuses (padding, encoding);
//   2. signature bytes that differ from @noble/curves' for the same secret (RFC 8032 is
//      deterministic, so any difference means the signed text or the encoding drifted);
//   3. the author key spelled other than `authorKeyFor` spells the same key;
//   4. an event signed here whose id differs from `signEvent`'s, or that `verifyEvent` refuses
//      (the "unmapped-event:v1" prefix drifted);
//   5. a WebSocket auth `verifyWsAuth` refuses, or a blob header `readBlobAuth` refuses;
//   6. a device key whose private half can be exported by a page script.

import {
  authorKeyFor,
  readBlobAuth,
  signEvent,
  signText,
  verifyEvent,
  verifyText,
  verifyWsAuth,
} from "@shared/history/sign";
import type { UnsignedEventOf } from "@shared/history/types";
import { describe, expect, it } from "vitest";
import {
  blobAuthWith,
  newDeviceKeys,
  signEventWith,
  signerOf,
  wsAuthWith,
} from "../../src/browser/signer";

const SECRET = Uint8Array.from({ length: 32 }, (_, i) => (i * 37 + 11) & 255);
/** PKCS#8 wrapping of a raw Ed25519 secret (RFC 8410): a fixed 16-byte prefix. */
const PKCS8_PREFIX = Uint8Array.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);

async function importedPair(): Promise<CryptoKeyPair> {
  const pkcs8 = new Uint8Array([...PKCS8_PREFIX, ...SECRET]);
  const privateKey = await crypto.subtle.importKey("pkcs8", pkcs8, "Ed25519", false, ["sign"]);
  const jwk = await crypto.subtle
    .importKey("pkcs8", pkcs8, "Ed25519", true, ["sign"])
    .then((key) => crypto.subtle.exportKey("jwk", key));
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    { kty: "OKP", crv: "Ed25519", x: jwk.x },
    "Ed25519",
    true,
    ["verify"],
  );
  return { privateKey, publicKey };
}

async function signer(pair: CryptoKeyPair) {
  const made = await signerOf(pair);
  if (!made.ok) throw new Error(made.error.message);
  return made.value;
}

const TEXTS = ["", "unmapped-event:v1\nh", "名前 · ノート ✚", "x".repeat(4096)];

const unsigned = (author: string): UnsignedEventOf<"note"> => ({
  v: 1,
  world: `h${"a".repeat(52)}`,
  kind: "note",
  author,
  at: "2026-09-26T10:00:00.000Z",
  seen: 7,
  body: {
    coord: { cx: 1, cz: -2, x: 3, z: 4 },
    anchors: [],
    text: "left from a phone",
    contests: null,
    name: "Rin",
  },
});

describe("WebCrypto Ed25519 device key", () => {
  it("signs the same bytes as @noble/curves and verifies under sign.ts (1, 2, 3)", async () => {
    const pair = await importedPair();
    const browser = await signer(pair);
    expect(browser.author).toBe(authorKeyFor(SECRET));
    for (const text of TEXTS) {
      const sig = await browser.sign(text);
      expect(sig).toBe(signText(SECRET, text));
      expect(verifyText(browser.author, text, sig)).toBe(true);
      expect(verifyText(browser.author, `${text}.`, sig)).toBe(false);
    }
  });

  it("signs events, WebSocket auth and blob requests sign.ts accepts (4, 5)", async () => {
    const browser = await signer(await importedPair());
    const event = await signEventWith(browser, unsigned(browser.author));
    expect(event).toEqual(signEvent(unsigned(browser.author), SECRET));
    expect(verifyEvent(event).ok).toBe(true);
    expect(verifyEvent({ ...event, seen: 8 }).ok).toBe(false);

    const service = authorKeyFor(Uint8Array.from({ length: 32 }, (_, i) => i));
    const nonce = "abcdefghijklmnopqrst";
    expect(
      verifyWsAuth(browser.author, await wsAuthWith(browser, nonce, service), nonce, service),
    ).toBe(true);

    const body = new TextEncoder().encode("pack bytes");
    const path = `/v1/worlds/h${"b".repeat(52)}/blobs/${"c".repeat(64)}`;
    const header = await blobAuthWith(browser, { method: "get", path, ts: 1_790_000_000, body });
    const read = readBlobAuth(header, { method: "GET", path, body, nowS: 1_790_000_100 });
    expect(read).toEqual({ ok: true, value: browser.author });
  });

  it("makes device keys whose secret no script can export, and still verify (6)", async () => {
    const made = await newDeviceKeys();
    if (!made.ok) throw new Error(made.error.message);
    const pair = made.value;
    expect(pair.privateKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("pkcs8", pair.privateKey)).rejects.toThrow();
    const browser = await signer(pair);
    const sig = await browser.sign("unmapped-ws:v1\nnonce");
    expect(verifyText(browser.author, "unmapped-ws:v1\nnonce", sig)).toBe(true);

    const leaky = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
    const refused = await signerOf(leaky as CryptoKeyPair);
    expect(refused.ok ? null : refused.error.code).toBe("browser-key-extractable");
    // Unpadded base64url: exactly the 86 characters `SIGNATURE` allows.
    expect(sig).toMatch(/^[A-Za-z0-9_-]{86}$/);
  });
});
