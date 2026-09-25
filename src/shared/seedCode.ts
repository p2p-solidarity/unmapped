// World seeds: one game, many lands (plan.md §1). A seed is eight symbols a player can read aloud
// or type from a friend's screen; the same seed is the same land, tile for tile, on every machine.
//
// Alphabet [A-HJ-NP-Z2-9]: no I/O/0/1. 32 symbols divides 256 evenly, so `byte % 32` is uniform.

export const SEED_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const SEED_LENGTH = 8;
export const SEED_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;

export function randomSeedCode(): string {
  const bytes = new Uint8Array(SEED_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += SEED_ALPHABET.charAt(byte % SEED_ALPHABET.length);
  return out;
}

/** Uppercases and drops the separators people add when they retype a seed. */
export function normalizeSeedCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, "");
}

export function isSeedCode(code: string): boolean {
  return SEED_PATTERN.test(code);
}

/** `ABCD2345` → `ABCD-2345`, the way it is shown and shared. */
export function formatSeedCode(code: string): string {
  return code.length === SEED_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}
