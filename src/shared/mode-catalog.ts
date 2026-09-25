// The mode catalog (plan.md §2.2): every game mode a player can pick, and the engine capabilities
// each one asks for. This is the *semantic* layer — a genre id is what the player means, never an
// implementation. `src/shared/capabilities.ts` decides whether anything can actually provide it.
//
// Four axes are kept separate in the data even though the UI draws one searchable matrix, because
// "回合制" (timing) composes with "第一人稱射擊" (genre) and "團隊" (player structure) rather than
// competing with them. Display text is Chinese; stored ids are stable ASCII.

import type { CapabilityKey, CapabilityRequirement, CapabilitySpec } from "./capabilities";

type Entry = readonly [
  id: string,
  label: string,
  requires: readonly CapabilitySpec[],
  aliases?: readonly string[],
];

export const MODE_CATEGORIES = [
  "rpg_narrative",
  "action",
  "simulation",
  "strategy",
  "sports",
  "structure",
  "setting",
] as const;
export type ModeCategory = (typeof MODE_CATEGORIES)[number];

// ── Genres ───────────────────────────────────────────────────────────────────────────────────

const RPG_NARRATIVE = [
  ["rpg", "RPG", ["progression:stat_growth", "content:narrative"]],
  ["card", "卡牌", ["ui:card_table", "timing:turn_based"]],
  ["tcg", "TCG", ["ui:card_table", "timing:turn_based", "progression:deck_build"]],
  [
    "action_rpg",
    "動作角色扮演",
    ["camera:third_person", "physics:grounded", "combat:melee", "progression:stat_growth"],
    ["ARPG"],
  ],
  [
    "adventure_rpg",
    "冒險角色扮演",
    ["camera:third_person", "physics:grounded", "content:narrative", "progression:stat_growth"],
  ],
  [
    "strategy_rpg",
    "策略和戰術角色扮演",
    ["camera:top_down", "timing:turn_based", "party:squad", "combat:grid_tactics"],
    ["SRPG", "戰棋"],
  ],
  ["jrpg", "日系角色扮演", ["timing:turn_based", "party:squad", "content:narrative"], ["JRPG"]],
  [
    "turn_based_rpg",
    "回合制角色扮演",
    ["timing:turn_based", "party:squad", "progression:stat_growth"],
  ],
  ["roguelike", "類 Rogue", ["content:procedural_runs", "progression:run_based"], ["Roguelike"]],
  [
    "roguelite",
    "輕度 Rogue",
    ["content:procedural_runs", "progression:meta_unlock"],
    ["Roguelite"],
  ],
  ["hack_and_slash", "砍殺", ["camera:third_person", "physics:grounded", "combat:melee"]],
  ["puzzle", "解謎", ["ui:proximity_prompt", "progression:flag_gate"]],
  [
    "visual_novel",
    "視覺小說",
    ["camera:fixed", "ui:dialogue_choices", "content:narrative"],
    ["AVG", "galgame"],
  ],
  ["story_rich", "劇情豐富", ["content:narrative"]],
] as const satisfies readonly Entry[];

const ACTION = [
  [
    "first_person_shooter",
    "第一人稱射擊",
    ["camera:first_person", "physics:grounded", "combat:shooter"],
    ["FPS"],
  ],
  [
    "third_person_shooter",
    "第三人稱射擊",
    ["camera:third_person", "physics:grounded", "combat:shooter"],
    ["TPS"],
  ],
  ["arcade", "街機", ["progression:score_run"]],
  ["rhythm", "節奏", ["timing:rhythm", "ui:beat_track"], ["音遊"]],
  [
    "platformer",
    "平台和快跑",
    ["camera:side", "physics:grounded", "content:platform_layout"],
    ["跑酷", "2.5D"],
  ],
  ["shoot_em_up", "清版射擊", ["camera:top_down", "combat:bullet_pattern"], ["STG", "彈幕"]],
  ["fighting", "格鬥和武術", ["camera:side", "physics:grounded", "combat:melee"], ["格鬥遊戲"]],
  ["hidden_object", "隱藏物件", ["camera:fixed", "ui:inspect_hotspot"]],
  ["casual", "休閒", []],
  // The combination that had no way to be expressed: a side-on platformer that also shoots.
  // Picking "platformer + third person shooter" split into two contexts — a platformer with no
  // gun and a shooter that is not 2D — so the thing people actually mean needed its own mode.
  [
    "run_and_gun",
    "橫向射擊（拿槍跑跳）",
    ["camera:side", "physics:grounded", "combat:shooter", "content:platform_layout"],
    ["run and gun", "魂斗羅", "Contra", "瑪利歐拿槍", "2D 射擊", "橫向捲軸射擊"],
  ],
  [
    "beat_em_up",
    "橫向清版格鬥",
    ["camera:side", "physics:grounded", "combat:melee"],
    ["beat em up", "清版", "快打旋風", "橫向動作"],
  ],
  [
    "twin_stick",
    "俯視雙軸射擊",
    ["camera:top_down", "physics:grounded", "combat:shooter"],
    ["twin stick", "雙搖桿", "俯視射擊"],
  ],
  [
    "survival_horror",
    "生存恐怖",
    ["camera:first_person", "physics:grounded", "combat:shooter", "progression:flag_gate"],
    ["survival horror", "恐怖生存", "惡靈古堡"],
  ],
  [
    "dungeon_brawler",
    "地城砍殺",
    ["camera:top_down", "physics:grounded", "combat:melee", "content:procedural_runs"],
    ["地城", "俯視砍殺", "Hades"],
  ],
  [
    "dungeon_crawler",
    "迷宮探索（第一人稱走格子）",
    ["camera:first_person", "physics:grid_step", "content:maze"],
    ["迷宮", "Wizardry", "Persona", "DRPG", "地城"],
  ],
  [
    "metroidvania",
    "類銀河戰士惡魔城",
    ["camera:side", "physics:grounded", "progression:ability_gate"],
    ["銀河城"],
  ],
] as const satisfies readonly Entry[];

const SIMULATION = [
  ["farming", "種田", ["content:crop_cycle", "progression:season_clock"], ["農場"]],
  [
    "automation",
    "建造和自動化遊戲",
    ["content:factory_graph", "progression:tech_tree"],
    ["自動化"],
  ],
  ["job_sim", "嗜好與工作模擬", ["content:task_sim"]],
  ["dating_sim", "戀愛模擬", ["ui:dialogue_choices", "progression:affinity"]],
  ["farm_craft_sim", "農場和工藝模擬", ["content:crop_cycle", "progression:crafting"]],
  ["space_flight_sim", "太空和飛行模擬", ["physics:flight", "camera:cockpit"]],
  ["life_sim", "生活和沉浸模擬", ["content:needs_sim"]],
  ["sandbox_physics", "沙盒和物理模擬", ["physics:rigid_body"], ["沙盒"]],
  [
    "city_builder",
    "城市和居住地建造",
    ["camera:top_down", "content:settlement_graph", "ui:build_placement"],
  ],
] as const satisfies readonly Entry[];

const STRATEGY = [
  [
    "turn_based_strategy",
    "回合制策略",
    ["camera:top_down", "timing:turn_based", "content:unit_board"],
    ["TBS"],
  ],
  [
    "real_time_strategy",
    "即時策略",
    ["camera:top_down", "ui:unit_command", "content:unit_board"],
    ["RTS"],
  ],
  ["tower_defense", "塔防", ["camera:top_down", "content:wave_spawner", "ui:build_placement"]],
  ["card_board", "卡牌和棋盤", ["ui:card_table", "timing:turn_based"], ["桌遊"]],
  ["grand_strategy", "大戰略", ["camera:top_down", "timing:tick", "content:territory_map"]],
  ["4x", "4X", ["camera:top_down", "timing:turn_based", "content:territory_map"]],
  ["military_strategy", "軍事策略", ["camera:top_down", "content:unit_board"]],
] as const satisfies readonly Entry[];

const SPORTS = [
  ["sports_sim", "運動模擬", ["physics:rigid_body", "content:sport_rules"]],
  ["sports_management", "運動管理", ["ui:roster_table", "timing:tick"]],
  ["racing", "競速", ["physics:vehicle", "camera:chase", "content:track_layout"]],
  ["racing_sim", "競速模擬", ["physics:vehicle_sim", "camera:cockpit", "content:track_layout"]],
  ["team_sports", "團隊運動", ["physics:rigid_body", "party:squad", "content:sport_rules"]],
  ["individual_sports", "個人運動", ["physics:rigid_body", "content:sport_rules"]],
  ["sports", "運動", ["content:sport_rules"]],
] as const satisfies readonly Entry[];

export const GENRES = [...RPG_NARRATIVE, ...ACTION, ...SIMULATION, ...STRATEGY, ...SPORTS] as const;
export type GenreId =
  | (typeof RPG_NARRATIVE)[number][0]
  | (typeof ACTION)[number][0]
  | (typeof SIMULATION)[number][0]
  | (typeof STRATEGY)[number][0]
  | (typeof SPORTS)[number][0];

// ── Timing ───────────────────────────────────────────────────────────────────────────────────
// Its own axis on purpose: pacing reshapes an FPS instead of replacing it. The values match the
// `TimingSystemId` set a Seed Mod can switch between (plan.md §4), so "把 turn bar 改成左輪制度"
// is a `change_timing` operation over this same vocabulary rather than a new genre.

const TIMINGS = [
  ["realtime", "即時", ["timing:realtime"], ["real time", "即時制"]],
  ["turn_based", "回合制", ["timing:turn_based"], ["回合", "turn"]],
  ["turn_bar", "行動槽", ["timing:turn_bar"], ["ATB", "行動條", "atb"]],
  ["initiative", "先攻序", ["timing:initiative"], ["先攻", "initiative"]],
  ["phase_based", "階段制", ["timing:phase_based"], ["planning", "戰術階段"]],
  ["revolver", "左輪輪替", ["timing:revolver"], ["左輪", "逐格輪替"]],
  ["real_time_with_pause", "即時暫停", ["timing:real_time_with_pause"], ["RTwP", "可暫停即時"]],
  ["rhythm_timing", "拍點", ["timing:rhythm"], ["節拍", "beat"]],
  ["tick", "滴答回合", ["timing:tick"], ["tick", "週期"]],
  // Deliberately requires nothing: it leaves the pacing open so the AI design interview asks,
  // instead of the engine's realtime default being taken as a decision the player made.
  ["timing_any", "隨便（交給 AI 建議）", [], ["random", "隨便", "都可以", "surprise"]],
] as const satisfies readonly Entry[];
export type TimingId = (typeof TIMINGS)[number][0];

/** True when the player explicitly deferred pacing; M3's interview must then ask about it. */
export function defersTiming(selection: ModeSelection): boolean {
  return selection.timings.includes("timing_any");
}

// ── Player structure ─────────────────────────────────────────────────────────────────────────
// `team` deliberately asks for both a party and a session. plan.md §2.2 requires the AI interview
// to settle whether the squad is other players or NPCs before the network requirement is real;
// answering "NPC squad" lands as a `set_capability network=offline` override.

const STRUCTURES = [
  ["team", "團隊", ["party:squad", "network:session"], ["小隊", "team"]],
  ["co_op", "合作", ["network:session"], ["co-op", "連線合作"]],
  ["competitive", "競技", ["network:session"], ["PvP", "對戰"]],
] as const satisfies readonly Entry[];
export type PlayerStructureId = (typeof STRUCTURES)[number][0];

// ── Setting tags ─────────────────────────────────────────────────────────────────────────────
// Subject matter and tone. These steer the scene and story prompts; they must not gate the engine,
// so they carry no required capabilities. Two of them imply systems, declared optional below.

const SETTINGS = [
  ["horror", "恐怖", []],
  ["sci_fi", "科幻", []],
  ["cyberpunk", "電馭叛客", [], ["賽博龐克"]],
  ["space", "太空", []],
  ["open_world", "開放世界", []],
  ["anime", "日本動畫", [], ["動漫"]],
  ["survival", "生存", []],
  ["mystery", "懸疑", []],
  ["detective", "推理", []],
] as const satisfies readonly Entry[];
export type SettingTagId = (typeof SETTINGS)[number][0];

/** Optional (non-blocking) capabilities a setting tag hints at, for AI suggestions only. */
const SETTING_HINTS: Partial<Record<SettingTagId, readonly CapabilitySpec[]>> = {
  survival: ["progression:survival_needs"],
  open_world: ["content:open_world"],
  detective: ["content:investigation"],
};

// ── Lookup ───────────────────────────────────────────────────────────────────────────────────

export type ModeAxis = "genre" | "timing" | "structure" | "setting";
export type GameModeId = GenreId | TimingId | PlayerStructureId | SettingTagId;

export interface ModeDescriptor {
  id: GameModeId;
  label: string;
  axis: ModeAxis;
  category: ModeCategory;
  requires: readonly CapabilitySpec[];
  aliases: readonly string[];
}

function descriptors(
  entries: readonly Entry[],
  axis: ModeAxis,
  category: ModeCategory,
): ModeDescriptor[] {
  return entries.map(([id, label, requires, aliases]) => ({
    id: id as GameModeId,
    label,
    axis,
    category,
    requires,
    aliases: aliases ?? [],
  }));
}

export const MODE_CATALOG: readonly ModeDescriptor[] = [
  ...descriptors(RPG_NARRATIVE, "genre", "rpg_narrative"),
  ...descriptors(ACTION, "genre", "action"),
  ...descriptors(SIMULATION, "genre", "simulation"),
  ...descriptors(STRATEGY, "genre", "strategy"),
  ...descriptors(SPORTS, "genre", "sports"),
  ...descriptors(TIMINGS, "timing", "structure"),
  ...descriptors(STRUCTURES, "structure", "structure"),
  ...descriptors(SETTINGS, "setting", "setting"),
];

const BY_ID = new Map(MODE_CATALOG.map((mode) => [mode.id, mode]));

export function findMode(id: string): ModeDescriptor | null {
  return BY_ID.get(id as GameModeId) ?? null;
}

/** Case-insensitive match over id, Chinese label and aliases. An empty query returns everything. */
export function searchModes(query: string): readonly ModeDescriptor[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return MODE_CATALOG;
  return MODE_CATALOG.filter(
    (mode) =>
      mode.id.includes(needle) ||
      mode.label.toLowerCase().includes(needle) ||
      mode.aliases.some((alias) => alias.toLowerCase().includes(needle)),
  );
}

// ── Selection → requirements ─────────────────────────────────────────────────────────────────

export interface ModeSelection {
  genres: GenreId[];
  timings: TimingId[];
  structures: PlayerStructureId[];
  settings: SettingTagId[];
}

/** Compatibility alias for callers that need a validation bound, not a product selection limit. */
/** A cartridge loads at most six modes: a revolver's cylinder, and a readable combination. */
export const MAX_SELECTED_MODES = 6;

export const EMPTY_MODE_SELECTION: ModeSelection = {
  genres: Object.freeze([]) as unknown as GenreId[],
  timings: Object.freeze([]) as unknown as TimingId[],
  structures: Object.freeze([]) as unknown as PlayerStructureId[],
  settings: Object.freeze([]) as unknown as SettingTagId[],
};

export function selectedModeIds(selection: ModeSelection): GameModeId[] {
  return [
    ...selection.genres,
    ...selection.timings,
    ...selection.structures,
    ...selection.settings,
  ];
}

/**
 * Capabilities assumed when nothing in the selection asks for that axis. These are what the engine
 * already does by default, so a selection like `puzzle` alone stays playable.
 */
const DEFAULTS: { key: CapabilityKey; value: string; reason: string }[] = [
  { key: "camera", value: "third_person", reason: "No selected mode fixes a camera." },
  { key: "physics", value: "grounded", reason: "No selected mode fixes a physics model." },
  { key: "timing", value: "realtime", reason: "No selected mode changes the pacing." },
  { key: "network", value: "offline", reason: "No selected mode asks for other players." },
];

/**
 * Deterministic: maps a mode selection onto the capability requirements the compiler consumes.
 * Requirements from setting tags are optional, so subject matter can never block Forge.
 */
export function requirementsFor(selection: ModeSelection): CapabilityRequirement[] {
  const byKeyValue = new Map<string, CapabilityRequirement>();

  const add = (spec: CapabilitySpec, mode: ModeDescriptor, required: boolean): void => {
    const colon = spec.indexOf(":");
    const key = spec.slice(0, colon) as CapabilityKey;
    const value = spec.slice(colon + 1);
    const existing = byKeyValue.get(spec);
    if (existing !== undefined) {
      existing.sourceModes.push(mode.id);
      existing.required = existing.required || required;
      return;
    }
    byKeyValue.set(spec, {
      key,
      value,
      required,
      sourceModes: [mode.id],
      reason: `「${mode.label}」需要 ${key} = ${value}。`,
    });
  };

  for (const id of selectedModeIds(selection)) {
    const mode = findMode(id);
    if (mode === null) continue;
    for (const spec of mode.requires) add(spec, mode, mode.axis !== "setting");
    if (mode.axis === "setting") {
      for (const spec of SETTING_HINTS[mode.id as SettingTagId] ?? []) add(spec, mode, false);
    }
  }

  const requirements = [...byKeyValue.values()];
  for (const fallback of DEFAULTS) {
    if (requirements.some((requirement) => requirement.key === fallback.key)) continue;
    requirements.push({
      key: fallback.key,
      value: fallback.value,
      required: true,
      sourceModes: [],
      reason: fallback.reason,
    });
  }
  return requirements;
}
