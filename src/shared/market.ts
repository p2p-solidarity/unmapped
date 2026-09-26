// The lineage market as the app sees it (contracts/src/lineage, deployed on Sepolia under
// `UNWRITTEN_LINEAGE_PARENT`). The player has no wallet: their passkey owns a PasskeyAccount, main
// builds each action's calls, the passkey signs the batch's digest, and the gas station
// (src/relay, a Cloudflare Worker at UNWRITTEN_LINEAGE_RELAY) carries it on chain and pays the gas.
// The app holds no key. The renderer never sees an RPC URL or a contract address it could misuse —
// only what to show and what to sign.

export interface MarketConfig {
  /** e.g. `unmapped.eth`; null when UNWRITTEN_LINEAGE_* is not set. */
  parent: string | null;
  /** True when a gas station is set up, so passkey-signed actions can be carried on chain. */
  relayer: boolean;
}

/** A passkey's P-256 public key; it names the player's account and is not a secret. */
export interface MarketKey {
  qx: `0x${string}`;
  qy: `0x${string}`;
}

export type MarketPhase = "soon" | "live" | "ended" | "pool";

/** Amounts are decimal strings in whole units (never floats), so nothing rounds on the way. */
export interface MarketWorld {
  token: string;
  name: string;
  /** The parent world's token; null for a first-generation world (priced in MockUSDC). */
  parent: string | null;
  symbol: string;
  currencySymbol: string;
  phase: MarketPhase;
  blocksLeft: number;
  clearing: string;
  floor: string;
  raised: string;
  bids: number;
  /** Currency per token in the v4 pool; null until the auction graduates. */
  poolPrice: string | null;
  /** The ENS name's holder — who revisions and royalties belong to. */
  owner: string;
  owedToken: string;
  owedCurrency: string;
}

export interface MarketBid {
  world: string;
  id: string;
  amount: string;
  state: "open" | "exited" | "claimed";
}

export interface MarketAccount {
  address: string;
  /** False until its first action deploys it (the address is known before). */
  deployed: boolean;
  usdc: string;
  holdings: { token: string; symbol: string; amount: string }[];
  bids: MarketBid[];
}

export interface MarketView {
  block: string;
  worlds: MarketWorld[];
  account: MarketAccount | null;
}

export type MarketAction =
  /** Bid `amount` of the world's currency in its auction (ceiling set by main, well above clearing). */
  | { kind: "bid"; world: string; amount: string }
  /** Spend `usdc` MockUSDC on the world, through its ancestors. */
  | { kind: "buy"; world: string; usdc: string }
  /** Name a local cartridge revision on ENS (or point the player's name at it). Main reads id,
   * version, hash and lineage from disk; the renderer only says which revision. */
  | { kind: "name-cartridge"; cartridgeId: string; version: string }
  /** Record (or move forward) the player's own save as `<label>.<cartridge>`; main hashes it. */
  | { kind: "name-save"; instanceId: string; label: string };

/**
 * An ENS name in the lineage tree as this player sees it. `free`: nobody holds it yet. `current`:
 * it points at exactly this revision (or this save, as it is now). `outdated`: it is the player's
 * but points at another version or an earlier checkpoint, so they can move it. `other-version`:
 * someone else's name for this same cartridge, pointing at another revision. `taken`: it names a
 * different cartridge (or, for a save, someone else holds it).
 */
export interface EnsNameStatus {
  name: string;
  state: "free" | "current" | "outdated" | "other-version" | "taken";
  holder: string | null;
  /** The holder is this passkey's account. */
  mine: boolean;
  /** What the name points at now; null when free. */
  version: string | null;
  /** Saves only: the recorded checkpoint's hash and progress line. */
  saveHash: string | null;
  progress: string | null;
}

/** A save and its name: the cartridge must be named first, since a save hangs under it. */
export interface SaveNameView {
  cartridge: EnsNameStatus;
  /** Null while the cartridge has no name. */
  save: EnsNameStatus | null;
  /** The save as it is on disk now, and the revision it is pinned to. */
  local: {
    label: string;
    saveHash: string;
    progress: string;
    cartridgeId: string;
    version: string;
  };
}

/** A batch main built and is holding; the renderer signs `challenge` with the passkey. */
export interface PreparedAction {
  id: string;
  /** 32-byte hex: the account's digest of exactly these calls. */
  challenge: `0x${string}`;
  account: string;
  calls: number;
}

export interface MarketReceipt {
  txHashes: string[];
}

/** OpenZeppelin's WebAuthnAuth with its two indices as numbers, so it crosses IPC as plain JSON. */
export interface WireAuth {
  r: `0x${string}`;
  s: `0x${string}`;
  challengeIndex: number;
  typeIndex: number;
  authenticatorData: `0x${string}`;
  clientDataJSON: string;
}

export interface SubmitActionInput {
  id: string;
  auth: WireAuth;
}

export const SEPOLIA_TX = "https://sepolia.etherscan.io/tx/";
