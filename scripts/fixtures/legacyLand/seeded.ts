// The values a phase-2 build draws at random — the land's seed code (`randomSeedCode`), note ids
// (`crypto.randomUUID`), draft, work and play ids (`randomBytes` in main/works), and the uint32
// seeds of places and chapters — drawn here from one seed text instead, so the same `--seed`
// always writes the same bytes. Each value is sha256("legacy-land|<seed>|<label>"), shaped exactly
// like the random one it stands for.

import { createHash } from "node:crypto";
import { SEED_ALPHABET, SEED_LENGTH } from "@shared/seedCode";

export interface Seeded {
  /** An 8-symbol land seed (`SEED_PATTERN`). */
  seedCode(): string;
  /** A version-4 UUID, as `crypto.randomUUID()` writes it. */
  uuid(label: string): string;
  /** `bytes` random bytes as lowercase hex, as `randomBytes(n).toString("hex")` writes them. */
  hex(label: string, bytes: number): string;
  /** A uint32, as `crypto.getRandomValues(new Uint32Array(1))[0]`. */
  uint32(label: string): number;
}

export function seeded(seed: string): Seeded {
  const bytes = (label: string): Buffer =>
    createHash("sha256").update(`legacy-land|${seed}|${label}`, "utf8").digest();
  return {
    seedCode() {
      const drawn = bytes("seed-code");
      let code = "";
      for (let i = 0; i < SEED_LENGTH; i += 1) {
        code += SEED_ALPHABET.charAt((drawn[i] ?? 0) % SEED_ALPHABET.length);
      }
      return code;
    },
    uuid(label) {
      const drawn = bytes(`uuid:${label}`).subarray(0, 16);
      drawn[6] = ((drawn[6] ?? 0) & 0x0f) | 0x40;
      drawn[8] = ((drawn[8] ?? 0) & 0x3f) | 0x80;
      const hex = drawn.toString("hex");
      return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20),
      ].join("-");
    },
    hex(label, count) {
      return bytes(`hex:${label}`).subarray(0, count).toString("hex");
    },
    uint32(label) {
      return bytes(`uint32:${label}`).readUInt32BE(0);
    },
  };
}
