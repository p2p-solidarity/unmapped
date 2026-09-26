// The game dialect of OpenUI Lang. Framework-agnostic: no React, no Electron — it runs in the
// main process, in the renderer and in vitest.
//
//   prompt  →  model  →  normalizeOutput  →  parse*  →  SceneGraph / DialogueGraph / ItemSpec
//                                    └─ on DslError → repairPrompt → model (at most twice)

export { DEFAULT_RULES_SOURCE } from "./defaultRules";
export { sceneGrammar } from "./grammar";
export { type MigrationPlan, planMigration } from "./history/migrate";
export {
  type Adjusted as MigrationAdjusted,
  type LegacySources,
  legacyOnlyChunks,
  type MigrationFiles,
  type Skipped as MigrationSkipped,
  type SourceDigest,
  sameSource,
  sourceDigest,
} from "./history/migrateSource";
// Rev 6 phase 3 (WP2): stored programs checked as history events, verdicts, migration planning
// and the Rumors dialect.
export {
  type EventBodyOf,
  validateEventBody,
  validateWitness,
  type WitnessPrograms,
  witnessIndexOf,
} from "./history/validate";
export { entryVerdict, pendingEvents, verdictEntries } from "./history/verdict";
export { hygieneIssues } from "./hygiene";
export {
  chapterLibrary,
  chunkLibrary,
  DIALOGUE_COMPONENT_NAMES,
  dialogueLibrary,
  dialogueSpecs,
  ITEM_COMPONENT_NAMES,
  itemLibrary,
  itemSpecs,
  placeLibrary,
  RULE_COMPONENT_NAMES,
  rulesLibrary,
  rulesSpecs,
  SCENE_COMPONENT_NAMES,
  sceneLibrary,
  scenePromptLibrary,
  sceneSpecs,
} from "./libraries";
export {
  clampCoord,
  clampFloat,
  clampInt,
  clampText,
  LIMITS,
  type Range,
  truncate,
} from "./limits";
export { normalizeOutput } from "./normalize";
export { parseBible } from "./parse/bible";
export {
  CHAPTER_PARTS,
  type ChapterContext,
  type ChapterDraft,
  parseChapter,
} from "./parse/chapter";
export {
  CHUNK_LIMITS,
  type ChunkContext,
  parseChunk,
  WITNESS_ACTIONS,
  type WitnessedDraft,
} from "./parse/chunk";
export { parseDialogue, toDialogue } from "./parse/dialogue";
export { type ErrandLand, parseErrands, readErrands } from "./parse/errand";
export { parseItem, toItem } from "./parse/item";
export { type PlaceContext, type PlaceDraft, parsePlace } from "./parse/place";
export { parseRules } from "./parse/rules";
export {
  normalRumorText,
  parseRumors,
  type RumorContext,
  type RumorDraft,
  serializeRumors,
} from "./parse/rumor";
export { parseScene, toSceneGraph } from "./parse/scene";
export { ARCHETYPE_GUIDE } from "./prompts/archetypes";
export { CHAPTER_EXAMPLE, type ChapterPromptContext, chapterPrompt } from "./prompts/chapter";
export {
  authoredSection,
  bibleSections,
  CHUNK_EXAMPLE,
  chunkOutputSection,
  chunkSpec,
  type NeighbourSummary,
  neighbourSection,
  terrainSection,
} from "./prompts/chunk";
export { dialoguePrompt } from "./prompts/dialogue";
export { itemPrompt } from "./prompts/item";
export { isMeshPart, MESH_DNA_GROUPS, MESH_DNA_PARTS } from "./prompts/meshDna";
export {
  BIBLE_EXAMPLE,
  biblePrompt,
  type NewWorldContext,
  ORIGIN_EXAMPLE,
  originIssues,
  originPrompt,
} from "./prompts/newWorld";
export { PLACE_EXAMPLE } from "./prompts/place";
export {
  RUMOR_EXAMPLE,
  type RumorFact,
  type RumorPromptContext,
  rumorFacts,
  rumorPrompt,
  SEASON_NAMES,
} from "./prompts/rumor";
export { SCENE_EXAMPLES, scenePrompt } from "./prompts/scene";
export { repairPrompt } from "./repair";
export { DIALOGUE_PROPS } from "./schemas/dialogue";
export { ITEM_PROPS } from "./schemas/item";
export { accentFor, ROLE_LOOK, type RoleLook } from "./schemas/looks";
export { RUMOR_PROPS, rumorLibrary } from "./schemas/rumor";
export { SCENE_PROPS, type SceneComponentName } from "./schemas/scene";
export { serializeScene } from "./serialize";
export { serializeDialogue } from "./serializeDialogue";
export { serializeErrands } from "./serializeErrands";
export { serializeItem } from "./serializeItem";
export { serializeRules } from "./serializeRules";
export type {
  ComponentSpec,
  DialoguePromptContext,
  DslError,
  ItemPromptContext,
  ScenePromptContext,
} from "./types";
