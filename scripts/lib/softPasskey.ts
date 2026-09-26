// A software stand-in for a passkey, for scripts only: a P-256 key in memory that answers a
// WebAuthn `get` the way a platform authenticator does (authenticator data for rp "localhost" with
// the user-present and user-verified flags, Chrome's client-data JSON, a DER signature). The app
// never uses this — it asks the player's real passkey — but the contract cannot tell them apart,
// so the dry run and seed bidders exercise exactly the path a real passkey takes.

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type JsonWebKey,
  sign,
} from "node:crypto";
import type { PasskeyAssertion, PasskeyPublicKey } from "../../src/shared/passkeyAuth";

export interface SoftPasskey {
  publicKey: PasskeyPublicKey;
  /** The private key as a JWK, so a seed bidder can come back to its account later. */
  privateJwk: JsonWebKey;
  sign(challenge: Uint8Array): PasskeyAssertion;
}

const hex = (buffer: Buffer): `0x${string}` => `0x${buffer.toString("hex")}`;

/** A new key, or the one saved as `privateJwk` by an earlier run. */
export function softPasskey(saved?: JsonWebKey, origin = "http://localhost"): SoftPasskey {
  const privateKey =
    saved === undefined
      ? generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey
      : createPrivateKey({ key: saved, format: "jwk" });
  const jwk = createPublicKey(privateKey).export({ format: "jwk" });
  const rpIdHash = createHash("sha256").update(new URL(origin).hostname).digest();
  let counter = 0;
  return {
    privateJwk: privateKey.export({ format: "jwk" }),
    publicKey: {
      qx: hex(Buffer.from(jwk.x ?? "", "base64url")),
      qy: hex(Buffer.from(jwk.y ?? "", "base64url")),
    },
    sign(challenge) {
      counter += 1;
      const flags = Buffer.from([0x05]); // user present + user verified
      const count = Buffer.alloc(4);
      count.writeUInt32BE(counter);
      const authenticatorData = Buffer.concat([rpIdHash, flags, count]);
      const clientDataJSON = Buffer.from(
        JSON.stringify({
          type: "webauthn.get",
          challenge: Buffer.from(challenge).toString("base64url"),
          origin,
          crossOrigin: false,
        }),
      );
      const clientHash = createHash("sha256").update(clientDataJSON).digest();
      const signature = sign("sha256", Buffer.concat([authenticatorData, clientHash]), privateKey);
      return {
        authenticatorData: new Uint8Array(authenticatorData),
        clientDataJSON: new Uint8Array(clientDataJSON),
        signature: new Uint8Array(signature),
      };
    },
  };
}
