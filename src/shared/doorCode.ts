// Door numbers (門牌) and continent join codes. Pure and dependency-free: the renderer opens and
// joins continents with them, and main writes a save's door onto its ENS name, so a friend can walk
// in by name (`description` = "UNMAPPED save · door ABC234"; LineageRegistry.describe).
//
// Alphabet [A-HJ-NP-Z2-9]: no I/O/0/1, so a code read aloud or copied off a screen survives.
// 32 symbols divides 256 evenly, so `byte % 32` is a uniform draw with no rejection loop.

export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;

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

/** The `description` a save's ENS name carries: readable in any ENS app, parsed back below. */
export function doorDescription(plate: string): string {
  return `UNMAPPED save · door ${plate}`;
}

/** The door number in a name's `description`, or null when it carries none. */
export function doorFromDescription(text: string | null | undefined): string | null {
  const match = /\bdoor ([A-HJ-NP-Z2-9]{6})\b/.exec(text ?? "");
  return match?.[1] ?? null;
}
