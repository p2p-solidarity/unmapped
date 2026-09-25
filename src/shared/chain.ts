// What the app knows about the on-chain ledger (contracts/src/UnwrittenLedger.sol). The renderer
// only ever sees these values: no key, no RPC URL, no signing. Provenance is optional — a world is
// fully playable without a chain, and every screen says plainly when the ledger is not configured.

export const LEDGER_KINDS = ["cartridge", "world"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export interface LedgerConfig {
  /** True when a public RPC and a ledger address are set, so lookups can work. */
  readable: boolean;
  /** True when a signing key is also set, so this machine can publish. */
  writable: boolean;
  chainId: number | null;
  address: string | null;
  /** Explorer base for a transaction, when the chain is a known public one. */
  explorer: string | null;
}

export interface LedgerRevision {
  contentHash: string;
  author: string;
  parent: string | null;
  publishedAt: string;
  kind: LedgerKind;
  uri: string;
}

export interface PublishOnChainInput {
  contentHash: string;
  parent: string | null;
  kind: LedgerKind;
  /** Where the bytes can be fetched; empty when it is only an authorship claim. */
  uri: string;
}

export interface WitnessOnChainInput {
  contentHash: string;
  note: string;
}

/** The contract counts a note in UTF-8 bytes (`bytes(note).length`), not in characters. */
export const LEDGER_NOTE_MAX = 280;

/** The longest start of `text` that fits in `maxBytes` of UTF-8, never splitting a character. */
export function clipUtf8(text: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  let out = "";
  let used = 0;
  for (const char of text) {
    const size = encoder.encode(char).length;
    if (used + size > maxBytes) break;
    out += char;
    used += size;
  }
  return out;
}

export const ZERO_HASH = `0x${"00".repeat(32)}` as const;

/** `sha256:<hex>` (how the app names a revision) → the bytes32 the ledger stores. */
export function toBytes32(contentHash: string): `0x${string}` | null {
  const match = /^sha256:([a-f0-9]{64})$/.exec(contentHash);
  return match === null ? null : (`0x${match[1]}` as `0x${string}`);
}

export function fromBytes32(value: string): string | null {
  const match = /^0x([a-f0-9]{64})$/i.exec(value);
  if (match === null) return null;
  const hex = (match[1] ?? "").toLowerCase();
  return hex === "0".repeat(64) ? null : `sha256:${hex}`;
}
