// Byte <-> base64 helpers shared by the passkey layer (base64url credential ids) and the seed
// layer (base64 payloads crossing the preload bridge). Kept tiny and dependency-free so both the
// renderer and vitest can use them.

/**
 * lib.dom's `BufferSource` only accepts ArrayBuffer-backed views, so every byte buffer that ends
 * up in WebCrypto or WebAuthn is typed this way rather than as a bare `Uint8Array`.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

const CHUNK = 0x8000;

function toBinary(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return binary;
}

export function toBase64(bytes: Uint8Array): string {
  return btoa(toBinary(bytes));
}

export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** Accepts both standard base64 (vault keys, saveFile payloads) and base64url (credential ids). */
export function fromBase64(value: string): Bytes {
  const standard = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Normalises the `BufferSource` shapes WebCrypto and WebAuthn hand back into a plain view. */
export function toBytes(source: BufferSource): Bytes {
  if (ArrayBuffer.isView(source)) {
    return Uint8Array.from(new Uint8Array(source.buffer, source.byteOffset, source.byteLength));
  }
  return new Uint8Array(source);
}

export function randomBytes(length: number): Bytes {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}
