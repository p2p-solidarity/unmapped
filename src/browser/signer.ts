// The browser proof's device key (rev 6 phase 4, D7; P3 D7, D9): one Ed25519 key per browser,
// made by WebCrypto as a NON-extractable key, so no page script — this one included — can ever
// read its secret. IndexedDB keeps the `CryptoKeyPair` itself (structured clone keeps it
// non-extractable). The public key is always exportable, and "k" + base32 of its 32 bytes is the
// author key, exactly as `authorKeyFor` spells a device key on the desktop.
//
// WebCrypto Ed25519 signs per RFC 8032 (deterministic, no RNG), so a signature made here is the
// same bytes `@noble/curves` would make with that secret, and `verifyText` (shared/history/sign.ts,
// strict decoding) accepts it. Every signed text comes from sign.ts's own builders
// (`eventSignedText`, `wsAuthText`, `blobAuthText`), so no prefix is spelled twice;
// tests/browser/signer.test.ts proves each signature against sign.ts's own verifiers.

import { authorKeyOf, base64Url, utf8 } from "@shared/history/ids";
import { blobAuthText, eventIdOf, eventSignedText, wsAuthText } from "@shared/history/sign";
import type { EventKind, HistoryEventOf, UnsignedEventOf } from "@shared/history/types";
import { err, ok, type Result } from "@shared/result";

const ED25519 = { name: "Ed25519" } as const;

/** Signs with a key whose secret this page cannot read. */
export interface BrowserSigner {
  /** "k" + base32(public key). */
  author: string;
  /** base64url(Ed25519 signature) over the UTF-8 of `text`. */
  sign(text: string): Promise<string>;
}

function subtle(): SubtleCrypto | null {
  return globalThis.crypto?.subtle ?? null;
}

const CRYPTO_HINT =
  "Open this page in a current Chrome, Safari or Firefox, over https or on localhost.";
const NO_CRYPTO = err(
  "browser-crypto-unavailable",
  "This browser cannot make an Ed25519 key.",
  CRYPTO_HINT,
);

/** A fresh device key pair; the private half can sign but never be exported. */
export async function newDeviceKeys(): Promise<Result<CryptoKeyPair>> {
  const crypto = subtle();
  if (crypto === null) return NO_CRYPTO;
  try {
    const pair = (await crypto.generateKey(ED25519, false, ["sign", "verify"])) as CryptoKeyPair;
    return pair.privateKey.extractable
      ? err("browser-key-extractable", "The browser made a device key that can be read out.")
      : ok(pair);
  } catch (error) {
    return err("browser-crypto-unavailable", (error as Error).message, CRYPTO_HINT);
  }
}

/** The signer for a stored (or fresh) pair; refuses a private key that can be read out. */
export async function signerOf(pair: CryptoKeyPair): Promise<Result<BrowserSigner>> {
  const crypto = subtle();
  if (crypto === null) return NO_CRYPTO;
  if (pair.privateKey.extractable) {
    return err("browser-key-extractable", "The stored device key can be read out; not using it.");
  }
  try {
    const raw = new Uint8Array(await crypto.exportKey("raw", pair.publicKey));
    if (raw.length !== 32) return err("browser-key-invalid", "The device key is not Ed25519.");
    const sign = async (text: string): Promise<string> =>
      base64Url(
        new Uint8Array(await crypto.sign(ED25519, pair.privateKey, new Uint8Array(utf8(text)))),
      );
    return ok({ author: authorKeyOf(raw), sign });
  } catch (error) {
    return err("browser-key-invalid", (error as Error).message);
  }
}

/** `signEvent` of shared/history/sign.ts, with the key held by WebCrypto. */
export async function signEventWith<K extends EventKind>(
  signer: BrowserSigner,
  unsigned: UnsignedEventOf<K>,
): Promise<HistoryEventOf<K>> {
  const id = eventIdOf(unsigned);
  const sig = await signer.sign(eventSignedText(id));
  return { ...unsigned, id, sig } as HistoryEventOf<K>;
}

/** The WebSocket `auth` signature over `wsAuthText` (nonce and service key). */
export function wsAuthWith(signer: BrowserSigner, nonce: string, serviceKey: string) {
  return signer.sign(wsAuthText(nonce, serviceKey));
}

/** `X-Unmapped-Auth: <key>.<ts>.<sig>` for a blob request (`blobAuthHeader`), `ts` in seconds. */
export async function blobAuthWith(
  signer: BrowserSigner,
  request: { method: string; path: string; ts: number; body: Uint8Array },
): Promise<string> {
  const { method, path, ts, body } = request;
  return `${signer.author}.${ts}.${await signer.sign(blobAuthText(method, path, ts, body))}`;
}
