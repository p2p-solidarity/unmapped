// Capability layer (plan.md §2.3): the deterministic bridge between what the player *means*
// (genre tags) and what the engine can *do* (modules). No LLM, no React, no Electron — this file
// must run in vitest, in main and in the renderer.
//
// Two rules this file exists to enforce:
//
//  1. A genre the engine cannot implement resolves to `needs_plugin`, never to a silently degraded
//     scene. A data-only mod may configure a provider that already exists; it can never stand in
//     for missing timing, combat, physics or network code.
//  2. plan.md §0.9 — one cartridge may hold several **Capability Contexts**. Picking both a
//     first-person shooter and a 2.5D platformer is not a contradiction to be resolved; it is a
//     game with two play contexts that scenes switch between. Locking the whole cartridge to one
//     camera or one kit is explicitly forbidden, so disagreement on a splittable key *splits*
//     rather than errors.

export const CAPABILITY_KEYS = [
  "camera",
  "physics",
  "combat",
  "timing",
  "network",
  "party",
  "ui",
  "progression",
  "content",
] as const;
export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

/**
 * A `key:value` pair in one string, e.g. `"camera:first_person"`. Both requirements and module
 * capabilities use this spelling so matching is a plain string compare.
 */
export type CapabilitySpec = `${CapabilityKey}:${string}`;

export function specKey(spec: CapabilitySpec): CapabilityKey {
  return spec.slice(0, spec.indexOf(":")) as CapabilityKey;
}

export function specValue(spec: CapabilitySpec): string {
  return spec.slice(spec.indexOf(":") + 1);
}

export interface CapabilityRequirement {
  key: CapabilityKey;
  value: string;
  /** A required capability blocks Forge until satisfied; an optional one only shapes suggestions. */
  required: boolean;
  /** Which selected modes asked for this, so the UI can explain "because you picked X". */
  sourceModes: string[];
  reason: string;
}

export interface CapabilityModule {
  moduleId: string;
  version: string;
  source: "builtin" | "signed_engine_extension";
  /** The `key:value` capabilities this module actually implements. */
  provides: readonly CapabilitySpec[];
  /** moduleIds this one needs mounted alongside it. */
  requires: readonly string[];
  deterministic: boolean;
  /** Human-readable pointer to the implementation, shown in the compatibility report. */
  implementedBy: string;
}

/**
 * A supported capability that can stand in for a missing one (plan.md §2.3's third way out:
 * install an extension, wait for a builtin, *or pick a supported alternative*).
 *
 * The bar is deliberately high: a substitution is only listed when the resulting game is still
 * recognisably the thing the player asked for. Racing without vehicle physics is not racing — it
 * is a box sliding around, which is exactly the failure this engine is supposed to stop making.
 * So most missing capabilities have no substitute and keep blocking Forge, on purpose.
 */
export interface CapabilitySubstitution {
  missing: CapabilitySpec;
  use: CapabilitySpec;
  note: string;
}

export const SUBSTITUTIONS: readonly CapabilitySubstitution[] = [
  {
    missing: "network:session",
    use: "network:offline",
    note: "隊友與對手改由本地 NPC 擔任。玩法不變，只是沒有其他真人。",
  },
  {
    missing: "progression:meta_unlock",
    use: "progression:run_based",
    note: "每局仍然是一次完整的 run，只是不會跨局累積解鎖。",
  },
  {
    missing: "camera:chase",
    use: "camera:third_person",
    note: "追尾鏡頭本來就是第三人稱鏡頭的一種。",
  },
  {
    missing: "camera:cockpit",
    use: "camera:first_person",
    note: "座艙視角本來就是第一人稱鏡頭。",
  },
];

export function substitutionFor(spec: CapabilitySpec): CapabilitySubstitution | null {
  return SUBSTITUTIONS.find((one) => one.missing === spec) ?? null;
}

export interface CapabilityConflict {
  key: CapabilityKey;
  /** Mode ids that disagree. */
  modes: string[];
  message: string;
  /** Candidate values; picking one becomes a `set_capability` patch. */
  resolutionOptions: string[];
}

/** One coherent way to play: a camera, a pacing, a physics model and the systems around them. */
export interface CapabilityContext {
  /** Stable id built from the context's own splitting values, or "main" when nothing split. */
  contextId: string;
  /** Modes that put this context in the cartridge, so the UI can say where it came from. */
  sourceModes: string[];
  requirements: CapabilityRequirement[];
  selectedModules: CapabilityModule[];
  missingModules: CapabilityRequirement[];
  profile: CapabilityProfile | null;
  status: CapabilityStatus;
}

export interface CapabilityProfile {
  /** One resolved value per decided capability key, in `CAPABILITY_KEYS` order. */
  entries: { key: CapabilityKey; value: string; moduleId: string }[];
}

export interface ModuleLock {
  /** Mount order is part of the profile identity; never re-sort this. */
  entries: CapabilityModule[];
}

export type CapabilityStatus = "ready" | "needs_decision" | "needs_plugin" | "conflict";

export interface CapabilityResolution {
  /** The worst status across every context, plus any session-global disagreement. */
  status: CapabilityStatus;
  requirements: CapabilityRequirement[];
  /** One entry when the selection is coherent; several when the cartridge plays more than one way. */
  contexts: CapabilityContext[];
  /** Keys that split the cartridge into more than one context. */
  splitKeys: CapabilityKey[];
  /** Union across contexts: everything that has to be mounted. */
  selectedModules: CapabilityModule[];
  /** Union across contexts: required capabilities no installed module implements. */
  missingModules: CapabilityRequirement[];
  /** Ways out of the blocking ones, where an honest alternative exists. */
  substitutions: CapabilitySubstitution[];
  /** Only session-global keys can truly conflict; a split is not a conflict. */
  conflicts: CapabilityConflict[];
}

// ── The compiler ─────────────────────────────────────────────────────────────────────────────

export interface CompileInput {
  requirements: readonly CapabilityRequirement[];
  modules: readonly CapabilityModule[];
  /**
   * Player/AI decisions that pin a capability key to one value, from accepted `set_capability`
   * patches. An override wins over the modes' own requested values for that key.
   */
  overrides: Partial<Record<CapabilityKey, string>>;
  /**
   * Accepted substitutions, `missing spec -> supported spec`. Unlike an override these replace one
   * value rather than the whole key, so a genre's other systems survive.
   */
  accepted?: Partial<Record<CapabilitySpec, CapabilitySpec>>;
}

/**
 * Keys where one context can only hold a single value — you cannot be in first person and side-on
 * at the same *moment*. Disagreement here does not make the selection invalid: it splits the
 * cartridge into several Capability Contexts that scenes switch between (plan.md §0.9).
 *
 * Everything else is additive inside a context: a game may have both a season clock and a tech
 * tree, or both melee and shooter combat.
 */
const SPLITTABLE_KEYS: ReadonlySet<CapabilityKey> = new Set<CapabilityKey>([
  "camera",
  "physics",
  "timing",
  "party",
]);

/**
 * Keys that must hold one value for the whole cartridge, because the join handshake and the save
 * schema are per-session, not per-scene. These are the only keys that can genuinely conflict.
 */
const SESSION_GLOBAL_KEYS: ReadonlySet<CapabilityKey> = new Set<CapabilityKey>(["network"]);

function providerFor(
  modules: readonly CapabilityModule[],
  key: CapabilityKey,
  value: string,
): CapabilityModule | null {
  const wanted = `${key}:${value}`;
  return modules.find((module) => module.provides.some((spec) => spec === wanted)) ?? null;
}

function moduleKey(module: CapabilityModule): string {
  return `${module.moduleId}@${module.version}`;
}

/** Resolves one coherent set of requirements against the installed modules. */
function resolveContext(
  contextId: string,
  sourceModes: string[],
  requirements: CapabilityRequirement[],
  modules: readonly CapabilityModule[],
): CapabilityContext {
  const selected = new Map<string, CapabilityModule>();
  const missingModules: CapabilityRequirement[] = [];
  const entries: CapabilityProfile["entries"] = [];

  for (const key of CAPABILITY_KEYS) {
    for (const value of new Set(
      requirements.filter((one) => one.key === key).map((one) => one.value),
    )) {
      const module = providerFor(modules, key, value);
      if (module === null) {
        const asked = requirements.find((one) => one.key === key && one.value === value);
        if (asked !== undefined) missingModules.push(asked);
        continue;
      }
      selected.set(moduleKey(module), module);
      entries.push({ key, value, moduleId: moduleKey(module) });
    }
  }

  // A module may declare peers it needs mounted with it; pull those in before reporting.
  for (const module of [...selected.values()]) {
    for (const peerId of module.requires) {
      const peer = modules.find((candidate) => moduleKey(candidate) === peerId);
      if (peer !== undefined) selected.set(peerId, peer);
    }
  }

  const blocking = missingModules.filter((one) => one.required);
  const status: CapabilityStatus =
    blocking.length > 0 ? "needs_plugin" : missingModules.length > 0 ? "needs_decision" : "ready";

  return {
    contextId,
    sourceModes,
    requirements,
    selectedModules: [...selected.values()],
    missingModules,
    // A profile exists whenever nothing *blocking* is missing. `needs_decision` means an optional
    // capability went unmet — a setting tag's hint, say — and by definition that never blocks, so
    // refusing a profile there would stop a perfectly forgeable cartridge.
    profile: status === "needs_plugin" ? null : { entries },
    status,
  };
}

/** Which splitting values each mode declared, in the order the modes first appear. */
function declarationsByMode(
  requirements: readonly CapabilityRequirement[],
  splitKeys: readonly CapabilityKey[],
): Map<string, Map<CapabilityKey, string>> {
  const byMode = new Map<string, Map<CapabilityKey, string>>();
  for (const requirement of requirements) {
    if (!splitKeys.includes(requirement.key)) continue;
    for (const mode of requirement.sourceModes) {
      const declared = byMode.get(mode) ?? new Map<CapabilityKey, string>();
      declared.set(requirement.key, requirement.value);
      byMode.set(mode, declared);
    }
  }
  return byMode;
}

interface ContextGroup {
  modes: string[];
  values: Map<CapabilityKey, string>;
}

/**
 * Greedily merges modes whose splitting values agree, so `FPS + 回合制` stays one context while
 * `FPS + 2.5D` becomes two. Iteration order is the requirement order, which `requirementsFor`
 * derives from the catalog, so the grouping is deterministic.
 */
function groupContexts(byMode: Map<string, Map<CapabilityKey, string>>): ContextGroup[] {
  const groups: ContextGroup[] = [];
  for (const [mode, declared] of byMode) {
    const fits = groups.find((group) =>
      [...declared].every(([key, value]) => (group.values.get(key) ?? value) === value),
    );
    if (fits === undefined) {
      groups.push({ modes: [mode], values: new Map(declared) });
      continue;
    }
    fits.modes.push(mode);
    for (const [key, value] of declared) fits.values.set(key, value);
  }
  return groups;
}

function contextIdFor(values: Map<CapabilityKey, string>): string {
  return (
    [...values]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}:${value}`)
      .join("+") || "main"
  );
}

/**
 * Deterministic: the same selection plus the same installed modules always produces the same
 * resolution. Never consults the model, never invents a provider.
 */
export function compileCapabilities(input: CompileInput): CapabilityResolution {
  const accepted = input.accepted ?? {};
  const substituted = input.requirements.map((requirement) => {
    const swap = accepted[`${requirement.key}:${requirement.value}` as CapabilitySpec];
    if (swap === undefined) return requirement;
    return {
      ...requirement,
      value: specValue(swap),
      reason: `${requirement.reason}（已接受替代方案 ${swap}）`,
    };
  });

  // An override pins a key to one value, which also stops it from splitting the cartridge.
  const requirements = substituted.flatMap((requirement) => {
    const override = input.overrides[requirement.key];
    if (override === undefined) return [requirement];
    return override === requirement.value ? [requirement] : [];
  });
  for (const [key, value] of Object.entries(input.overrides)) {
    const typedKey = key as CapabilityKey;
    if (value === undefined) continue;
    if (requirements.some((one) => one.key === typedKey && one.value === value)) continue;
    requirements.push({
      key: typedKey,
      value,
      required: true,
      sourceModes: [],
      reason: `已決定 ${key} = ${value}。`,
    });
  }

  const conflicts: CapabilityConflict[] = [];
  for (const key of SESSION_GLOBAL_KEYS) {
    const forKey = requirements.filter((one) => one.key === key);
    const values = [...new Set(forKey.map((one) => one.value))];
    if (values.length <= 1) continue;
    conflicts.push({
      key,
      modes: [...new Set(forKey.flatMap((one) => one.sourceModes))],
      message: `${key} 必須整張卡帶只有一個值，但這組選擇要求了 ${values.join("、")}。`,
      resolutionOptions: values,
    });
  }

  const splitKeys = [...SPLITTABLE_KEYS].filter(
    (key) =>
      new Set(requirements.filter((one) => one.key === key).map((one) => one.value)).size > 1,
  );

  const byMode =
    splitKeys.length === 0
      ? new Map<string, Map<CapabilityKey, string>>()
      : declarationsByMode(requirements, splitKeys);
  const groups = groupContexts(byMode);

  // A requirement follows the modes that asked for it. Only two kinds are shared by every context:
  // engine defaults and accepted overrides (no source mode at all), and modes that never pinned a
  // splitting value — "回合制" or "科幻" colour the whole cartridge, while "即時策略" describes only
  // its own context and must not leak its unit board into the shooter one.
  const belongsTo = (requirement: CapabilityRequirement, group: ContextGroup): boolean => {
    if (requirement.sourceModes.length === 0) return true;
    if (requirement.sourceModes.some((mode) => !byMode.has(mode))) return true;
    return requirement.sourceModes.some((mode) => group.modes.includes(mode));
  };

  const contexts: CapabilityContext[] =
    groups.length === 0
      ? [resolveContext("main", [], requirements, input.modules)]
      : groups.map((group) =>
          resolveContext(
            contextIdFor(group.values),
            group.modes,
            requirements.filter((one) => belongsTo(one, group)),
            input.modules,
          ),
        );

  const selected = new Map<string, CapabilityModule>();
  const missingModules: CapabilityRequirement[] = [];
  for (const context of contexts) {
    for (const module of context.selectedModules) selected.set(moduleKey(module), module);
    for (const missing of context.missingModules) {
      if (missingModules.some((one) => one.key === missing.key && one.value === missing.value)) {
        continue;
      }
      missingModules.push(missing);
    }
  }

  const blocking = missingModules.filter((one) => one.required);
  const substitutions = [
    ...new Map(
      missingModules
        .map((one) => substitutionFor(`${one.key}:${one.value}` as CapabilitySpec))
        .filter((one): one is CapabilitySubstitution => one !== null)
        .map((one) => [one.missing, one] as const),
    ).values(),
  ];
  const status: CapabilityStatus =
    conflicts.length > 0
      ? "conflict"
      : blocking.length > 0
        ? "needs_plugin"
        : missingModules.length > 0
          ? "needs_decision"
          : "ready";

  return {
    status,
    requirements,
    contexts,
    splitKeys,
    selectedModules: [...selected.values()],
    missingModules,
    substitutions,
    conflicts,
  };
}
