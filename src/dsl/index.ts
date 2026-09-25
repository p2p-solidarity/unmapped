// The game dialect of OpenUI Lang. Framework-agnostic: no React, no Electron — it runs in the
// main process, in the renderer and in vitest.
//
//   prompt  →  model  →  normalizeOutput  →  parse*  →  SceneGraph / DialogueGraph / ItemSpec
//                                    └─ on DslError → repairPrompt → model (at most twice)

export { DEFAULT_RULES_SOURCE } from "./defaultRules";
export { sceneGrammar } from "./grammar";
export {
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
export { parseDialogue, toDialogue } from "./parse/dialogue";
export { parseItem, toItem } from "./parse/item";
export { parseRules } from "./parse/rules";
export { parseScene, toSceneGraph } from "./parse/scene";
export { ARCHETYPE_GUIDE } from "./prompts/archetypes";
export { dialoguePrompt } from "./prompts/dialogue";
export { itemPrompt } from "./prompts/item";
export { isMeshPart, MESH_DNA_GROUPS, MESH_DNA_PARTS } from "./prompts/meshDna";
export { SCENE_EXAMPLES, scenePrompt } from "./prompts/scene";
export { repairPrompt } from "./repair";
export { DIALOGUE_PROPS } from "./schemas/dialogue";
export { ITEM_PROPS } from "./schemas/item";
export { accentFor, ROLE_LOOK, type RoleLook } from "./schemas/looks";
export { SCENE_PROPS, type SceneComponentName } from "./schemas/scene";
export { serializeScene } from "./serialize";
export { serializeRules } from "./serializeRules";
export type {
  ComponentSpec,
  DialoguePromptContext,
  DslError,
  ItemPromptContext,
  ScenePromptContext,
} from "./types";
