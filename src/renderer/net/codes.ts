// Join codes. Pure and dependency-free so the generator and the validator are unit-testable
// without touching y-webrtc.
//
// Alphabet [A-HJ-NP-Z2-9]: no I/O/0/1, so a code read aloud or copied off a screen survives.
// 32 symbols divides 256 evenly, so `byte % 32` is a uniform draw with no rejection loop.

export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;
export const ROOM_NAME_PREFIX = "unwritten-land";

export function randomFromAlphabet(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += ROOM_CODE_ALPHABET.charAt(byte % ROOM_CODE_ALPHABET.length);
  return out;
}

export function generateRoomCode(): string {
  return randomFromAlphabet(ROOM_CODE_LENGTH);
}

/** Uppercases and drops the separators people add when they retype a code. */
export function normalizeRoomCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, "");
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  for (const character of code) {
    if (!ROOM_CODE_ALPHABET.includes(character)) return false;
  }
  return true;
}

export function roomName(code: string): string {
  return `${ROOM_NAME_PREFIX}:${code}`;
}

/**
 * A world's door number (門牌): a room code derived from its instance id, so it stays the same
 * every time that world opens its door and friends can keep it on a dial. Two FNV-1a passes give
 * 30 bits, six symbols of five bits each.
 */
export function plateOf(worldId: string): string {
  const hash = (salt: number): number => {
    let value = (0x811c9dc5 ^ salt) >>> 0;
    for (let index = 0; index < worldId.length; index += 1) {
      value ^= worldId.charCodeAt(index);
      value = Math.imul(value, 0x01000193) >>> 0;
    }
    return value;
  };
  const bits = [hash(0x9e37), hash(0x79b9)];
  let out = "";
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    const word = bits[index % 2] ?? 0;
    const symbol = (word >>> (5 * Math.floor(index / 2))) & 31;
    out += ROOM_CODE_ALPHABET.charAt(symbol);
  }
  return out;
}
