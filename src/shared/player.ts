/** A reusable player identity. Cartridge-specific stats and equipment live in PlayerState. */
export interface PlayerProfile {
  profileId: string;
  displayName: string;
  appearance: Record<string, string>;
  controlPreferences: Record<string, string | number | boolean>;
  updatedAt: string;
}

export interface PlayerProfileInput {
  /** Omit to create a new profile; provide it to update that exact profile. */
  profileId?: string;
  displayName: string;
  appearance: Record<string, string>;
  controlPreferences: Record<string, string | number | boolean>;
}

/** Cartridge-owned state validated by that cartridge's active modules. */
export interface PlayerState {
  profileId: string;
  loadout: Record<string, string>;
  progression: Record<string, string | number | boolean>;
}

export interface PartyMemberState {
  id: string;
  role: string;
  loadout: Record<string, string>;
  state: Record<string, string | number | boolean>;
}

/** Save-owned party state. A null PartyState means the game has no active party. */
export interface PartyState {
  members: PartyMemberState[];
}
