// A cartridge's ENS name: `<cartridgeId>.<parent>` on Sepolia ENSv2. The name carries only what
// the app already knows about a published revision — its id, version and sha256 hash — never its
// content (Rule 13). Whoever reads the name still needs the `.cartridge` file; the hash is what
// proves the file they have is the one the name points at.

/** Frozen: on-chain text-record keys. Renaming one would orphan every name already written. */
export const ENS_CARTRIDGE_KEYS = {
  cartridge: "unwritten.cartridge",
  version: "unwritten.version",
  hash: "unwritten.hash",
} as const;

/** Frozen too: a save's name (`<save>.<cartridge>.<root>`, LineageRegistry.recordSave) adds these. */
export const ENS_SAVE_KEYS = {
  kind: "unwritten.kind",
  save: "unwritten.save",
  progress: "unwritten.progress",
} as const;

/** A name followed back: the revision it points at, plus the checkpoint when it names a save. */
export interface EnsLookup {
  pointer: CartridgePointer;
  save: { saveHash: string; progress: string } | null;
}

/** What the renderer may know about this machine's ENS setup: no key, no RPC URL, no addresses. */
export interface EnsNamesConfig {
  /** e.g. `unwritten.eth`; null when UNWRITTEN_ENS_* is not set. */
  parent: string | null;
  /** True when a signing key is also set, so this machine can write names. */
  writable: boolean;
}

export interface CartridgePointer {
  cartridgeId: string;
  version: string;
  contentHash: string;
}

export interface ClaimNameResult {
  name: string;
  txHashes: string[];
}

export const SEPOLIA_TX_URL = "https://sepolia.etherscan.io/tx/";

/** The label a cartridge id gets: lowercase a–z 0–9 and single hyphens, at most 63 characters. */
export function cartridgeLabel(cartridgeId: string): string | null {
  const label = cartridgeId
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 63)
    .replace(/^-+|-+$/g, "");
  return label.length >= 1 ? label : null;
}

export function cartridgeName(cartridgeId: string, parent: string): string | null {
  const label = cartridgeLabel(cartridgeId);
  return label === null ? null : `${label}.${parent}`;
}

/** The three records → a pointer, or null unless all three are present and the hash is well formed. */
export function pointerFromTexts(texts: {
  cartridge: string | null;
  version: string | null;
  hash: string | null;
}): CartridgePointer | null {
  const { cartridge, version, hash } = texts;
  if (!cartridge || !version || !hash || !/^sha256:[a-f0-9]{64}$/.test(hash)) return null;
  return { cartridgeId: cartridge, version, contentHash: hash };
}
