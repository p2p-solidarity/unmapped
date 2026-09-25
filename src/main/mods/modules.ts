// Adding a capability to a cartridge never fails because something it needs is missing: the host
// locks the module and everything it requires, turns on the rules it drives with the same fresh
// tuning a new game gets, selects its capability in every context, and says what it did. The only
// refusal left is a module this engine does not have at all — that is a fact, not a restriction.

import type { CapabilityKey, CapabilityModule } from "@shared/capabilities";
import { BUILTIN_MODULES } from "@shared/capability-modules";
import type { GameDefinition } from "@shared/game-definition";
import type { CombatRules, GameplayRules, PartyRules } from "@shared/gameplay";

/** Fresh tuning, the same a new armed game starts with (`shared/forge.ts`). */
export const FRESH_COMBAT: CombatRules = {
  playerHp: 100,
  monsterHpBase: 30,
  monsterHpPerLevel: 10,
};
export const FRESH_PARTY: PartyRules = { size: 2, memberHp: 60, memberSpeed: 8 };

/** The installed module by id — the exact version when asked for one that exists, else the only one. */
export function installedModule(moduleId: string, version?: string): CapabilityModule | null {
  const matches = BUILTIN_MODULES.filter((module) => module.moduleId === moduleId);
  return matches.find((module) => module.version === version) ?? matches[0] ?? null;
}

export function installedModuleList(): string {
  return BUILTIN_MODULES.map((module) => `${module.moduleId}@${module.version}`).join(", ");
}

/** Locks a module after everything it requires; returns the `id@version`s newly locked. */
export function lockModule(definition: GameDefinition, module: CapabilityModule): string[] {
  const added: string[] = [];
  const visit = (next: CapabilityModule): void => {
    if (definition.moduleLock.entries.some((entry) => entry.moduleId === next.moduleId)) return;
    for (const required of next.requires) {
      const [id, version] = required.split("@");
      const dependency = id === undefined ? null : installedModule(id, version);
      if (dependency !== null) visit(dependency);
    }
    // Mount order is part of the profile identity: append, never re-sort.
    definition.moduleLock.entries.push(structuredClone(next));
    added.push(`${next.moduleId}@${next.version}`);
  };
  visit(module);
  return added;
}

/** Selects `key:value` from `moduleId` in every context; one value per key. */
export function selectCapability(
  definition: GameDefinition,
  key: CapabilityKey,
  value: string,
  moduleId: string,
): void {
  for (const context of definition.capabilityProfile.contexts) {
    context.profile.entries = [
      ...context.profile.entries.filter((entry) => entry.key !== key),
      { key, value, moduleId },
    ];
  }
}

export interface Activation {
  rules: GameplayRules;
  /** Locked modules and rules switched on, as sentences for the proposal's reasons. */
  notes: string[];
  changed: boolean;
}

/**
 * Locks `moduleId` (with its requirements) and turns on the rules it drives. Modules whose effect
 * is chosen elsewhere (a camera by a scene's kit, pacing by a timing change) are only locked, and
 * the note says so rather than implying the game already uses them.
 */
export function activateModule(
  rules: GameplayRules,
  definition: GameDefinition,
  module: CapabilityModule,
): Activation {
  let next = rules;
  const notes: string[] = [];
  let changed = false;
  const locked = lockModule(definition, module);
  if (locked.length > 0) {
    notes.push(`Adds ${locked.join(", ")} to the cartridge.`);
    changed = true;
  }
  const wantsCombat = module.moduleId === "shooter_combat" || module.moduleId === "team_party";
  if (wantsCombat) selectCapability(definition, "combat", "shooter", "shooter_combat");
  if (wantsCombat && next.combat === null) {
    next = { ...next, combat: { ...FRESH_COMBAT } };
    notes.push(
      `Turns combat on (player ${FRESH_COMBAT.playerHp} HP, monsters ${FRESH_COMBAT.monsterHpBase} HP + ${FRESH_COMBAT.monsterHpPerLevel} per level).`,
    );
    changed = true;
  }
  if (module.moduleId === "team_party" && next.party === null) {
    next = { ...next, party: { ...FRESH_PARTY } };
    selectCapability(definition, "party", "squad", "team_party");
    notes.push(`Adds a squad of ${FRESH_PARTY.size} allies.`);
    changed = true;
  }
  if (!wantsCombat && locked.length > 0) {
    notes.push(
      `${module.moduleId} is available now; scenes use it when their kit or rules ask for it.`,
    );
  }
  if (locked.length === 0 && !changed)
    notes.push(`${module.moduleId} is already part of this cartridge.`);
  return { rules: next, notes, changed };
}
