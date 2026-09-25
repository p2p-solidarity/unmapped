// A passkey assertion (what WebAuthn `navigator.credentials.get` returns) in the shape the lineage
// market's PasskeyAccount verifies on chain — OpenZeppelin's `WebAuthn.WebAuthnAuth`. Pure: the
// renderer feeds it a real passkey's assertion, scripts feed it a software key's, and both produce
// the same bytes. Also recovers a passkey's P-256 public key from two assertions, because the app's
// existing passkeys were enrolled without keeping it (only the credential id was stored).

import { p256 } from "@noble/curves/nist.js";
import { err, ok, type Result } from "./result";

export interface PasskeyAssertion {
  authenticatorData: Uint8Array;
  clientDataJSON: Uint8Array;
  /** ASN.1 DER, as WebAuthn returns it. */
  signature: Uint8Array;
}

/** OpenZeppelin `WebAuthn.WebAuthnAuth`, field for field (hex for bytes, bigint for uint256). */
export interface WebAuthnAuth {
  r: `0x${string}`;
  s: `0x${string}`;
  challengeIndex: bigint;
  typeIndex: bigint;
  authenticatorData: `0x${string}`;
  clientDataJSON: string;
}

export interface PasskeyPublicKey {
  qx: `0x${string}`;
  qy: `0x${string}`;
}

const N = p256.Point.CURVE().n;
const hex32 = (value: bigint): `0x${string}` => `0x${value.toString(16).padStart(64, "0")}`;
const toHex = (bytes: Uint8Array): `0x${string}` =>
  `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}

/** What the authenticator signed: sha256(authenticatorData ‖ sha256(clientDataJSON)). */
export async function assertionHash(assertion: PasskeyAssertion): Promise<Uint8Array> {
  const clientHash = await sha256(assertion.clientDataJSON);
  const message = new Uint8Array(assertion.authenticatorData.length + clientHash.length);
  message.set(assertion.authenticatorData);
  message.set(clientHash, assertion.authenticatorData.length);
  return sha256(message);
}

/**
 * The on-chain form of an assertion over `challenge`. Refuses one whose client data did not carry
 * exactly that challenge (the contract would refuse it too, after the relayer paid for trying).
 */
export function toWebAuthnAuth(
  assertion: PasskeyAssertion,
  challenge: Uint8Array,
): Result<WebAuthnAuth> {
  const json = new TextDecoder().decode(assertion.clientDataJSON);
  const typeIndex = json.indexOf('"type":"webauthn.get"');
  const challengeIndex = json.indexOf(`"challenge":"${base64Url(challenge)}"`);
  if (typeIndex < 0 || challengeIndex < 0) {
    return err(
      "passkey-assertion-mismatch",
      "The passkey signed something other than this market action.",
      "Try the action again and approve the passkey prompt it opens.",
    );
  }
  let signature: { r: bigint; s: bigint };
  try {
    signature = p256.Signature.fromBytes(assertion.signature, "der");
  } catch {
    return err(
      "passkey-assertion-mismatch",
      "The passkey returned a signature that is not P-256 (ES256).",
      "Use a passkey made for this app; only ES256 passkeys can sign market actions.",
    );
  }
  // P256.verify only accepts the low-s form; (r, n − s) is the same signature.
  const s = signature.s > N / 2n ? N - signature.s : signature.s;
  return ok({
    r: hex32(signature.r),
    s: hex32(s),
    challengeIndex: BigInt(challengeIndex),
    typeIndex: BigInt(typeIndex),
    authenticatorData: toHex(assertion.authenticatorData),
    clientDataJSON: json,
  });
}

async function candidates(assertion: PasskeyAssertion): Promise<string[]> {
  const hash = await assertionHash(assertion);
  const signature = p256.Signature.fromBytes(assertion.signature, "der");
  const keys: string[] = [];
  for (const bit of [0, 1]) {
    try {
      const point = signature.addRecoveryBit(bit).recoverPublicKey(hash).toAffine();
      keys.push(`${hex32(point.x)}:${hex32(point.y)}`);
    } catch {
      // This recovery bit names no point on the curve.
    }
  }
  return keys;
}

/** One ECDSA signature fits two public keys; two signatures by the same passkey fit exactly one. */
export async function recoverPasskeyKey(
  first: PasskeyAssertion,
  second: PasskeyAssertion,
): Promise<Result<PasskeyPublicKey>> {
  let shared: string[];
  try {
    const [a, b] = await Promise.all([candidates(first), candidates(second)]);
    shared = a.filter((key) => b.includes(key));
  } catch {
    shared = [];
  }
  const [key] = shared;
  if (shared.length !== 1 || key === undefined) {
    return err(
      "passkey-key-unrecoverable",
      "The two passkey signatures do not share one P-256 public key.",
      "Approve both prompts with the same passkey; only ES256 passkeys can sign market actions.",
    );
  }
  const [qx, qy] = key.split(":") as [`0x${string}`, `0x${string}`];
  return ok({ qx, qy });
}
