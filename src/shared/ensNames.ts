// ENS names in the lineage market's tree on Sepolia ENSv2 (src/main/chain/names.ts): a revision is
// `<cartridge>.<root>` (a remix hangs under its parent's name once that has one), and a save is
// `<save>.<cartridge>.<root>`. A name carries only what the app already knows about a published
// revision — its id, version and sha256 hash (plus a save's fingerprint and progress line) — never
// its content (Rule 13). Whoever reads the name still needs the `.cartridge` file; the hash is what
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
  /** Saves only: the door number (門牌) in the name's `description` (@shared/doorCode), if any. */
  door: string | null;
}

export interface CartridgePointer {
  cartridgeId: string;
  version: string;
  contentHash: string;
}

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
