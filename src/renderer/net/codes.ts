// Join codes. Pure and dependency-free so the generator and the validator are unit-testable
// without touching y-webrtc. The code alphabet, validation and door numbers live in
// @shared/doorCode, since main also writes a save's door onto its ENS name.

import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@shared/doorCode";

export {
  isValidRoomCode,
  normalizeRoomCode,
  plateOf,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from "@shared/doorCode";
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

export function roomName(code: string): string {
  return `${ROOM_NAME_PREFIX}:${code}`;
}
