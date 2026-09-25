// The game dialect of OpenUI Lang. Framework-agnostic: no React, no Electron — it runs in the
// main process, in the renderer and in vitest.
//
//   prompt  →  model  →  normalizeOutput  →  parse*  →  SceneGraph / DialogueGraph / ItemSpec
//                                    └─ on DslError → repairPrompt → model (at most twice)

export { DEFAULT_RULES_SOURCE } from "./defaultRules";
export { sceneGrammar } from "./grammar";
export { hygieneIssues } from "./hygiene";
export {
  chunkLibrary,
  DIALOGUE_COMPONENT_NAMES,
  dialogueLibrary,
  dialogueSpecs,
  ITEM_COMPONENT_NAMES,
  itemLibrary,
  itemSpecs,
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
  CHUNK_LIMITS,
  type ChunkContext,
  parseChunk,
  WITNESS_ACTIONS,
  type WitnessedDraft,
} from "./parse/chunk";
export { parseDialogue, toDialogue } from "./parse/dialogue";
export { type ErrandLand, parseErrands, readErrands } from "./parse/errand";
export { parseItem, toItem } from "./parse/item";
export { parseRules } from "./parse/rules";
export { parseScene, toSceneGraph } from "./parse/scene";
export { ARCHETYPE_GUIDE } from "./prompts/archetypes";
export {
  type CandidateSceneContext,
  candidateIssues,
  candidateScenePrompt,
} from "./prompts/candidate";
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
  originIssues,
  originPrompt,
} from "./prompts/newWorld";
export { SCENE_EXAMPLES, scenePrompt } from "./prompts/scene";
export { repairPrompt } from "./repair";
export { DIALOGUE_PROPS } from "./schemas/dialogue";
export { ITEM_PROPS } from "./schemas/item";
export { accentFor, ROLE_LOOK, type RoleLook } from "./schemas/looks";
export { SCENE_PROPS, type SceneComponentName } from "./schemas/scene";
export { serializeScene } from "./serialize";
export { serializeDialogue } from "./serializeDialogue";
export { serializeErrands } from "./serializeErrands";
export { serializeRules } from "./serializeRules";
export type {
  ComponentSpec,
  DialoguePromptContext,
  DslError,
  ItemPromptContext,
  ScenePromptContext,
} from "./types";
