import { sha256 } from "@main/cartridges/integrity";
import { builtinAssetPack, builtinAssetRef } from "@shared/assets";
import { BUILTIN_MODULES } from "@shared/capability-modules";
import type { PublishCartridgeInput } from "@shared/cartridge";
import { EMPTY_MOD_LOCK } from "@shared/mods";

const locked = (...ids: string[]) =>
  ids.map((id) => {
    const module = BUILTIN_MODULES.find((candidate) => candidate.moduleId === id);
    if (module === undefined) throw new Error(`Missing builtin module ${id}`);
    return structuredClone(module);
  });

export const V2_RULES = [
  'root = Rules("tps_exploration@1", "grounded", [tps, fps, forward, back, left, right, interact])',
  'tps = Kit("tps_exploration@1", 4, 7, 6.4, 15, 2, 55, 0.0022, 9)',
  'fps = Kit("fps_puzzle@1", 3.5, 5, 0, 15, 3, 70, 0.0022, 0)',
  'forward = Bind("move_forward", ["KeyW"])',
  'back = Bind("move_backward", ["KeyS"])',
  'left = Bind("move_left", ["KeyA"])',
  'right = Bind("move_right", ["KeyD"])',
  'interact = Bind("interact", ["KeyE"])',
].join("\n");

function scene(
  id: string,
  kit: "tps_exploration@1" | "fps_puzzle@1",
  contextId: string,
  modules: string[],
  target: string | null,
  withTree = false,
): string {
  const terminal = target === null;
  const children = withTree ? "[contract, ground, tree, exit]" : "[contract, ground, exit]";
  const exit = terminal
    ? 'exit = Exit(7, 7, "Finish")'
    : `exit = Exit(7, 7, "Continue", "${target}")`;
  const prop = withTree ? '\ntree = Prop("tree", 2, 2, 1, null, false, "builtin:tree")' : "";
  return [
    `root = Scene("${id}", "meadow", ${children})`,
    `contract = Contract("${id}", "${kit}", [], [], "carry", ["${id}_done"], ${terminal}, "profile-main", "${contextId}", ${JSON.stringify(modules)})`,
    'ground = Floor(8, 8, "grass")',
    `${exit}${prop}`,
    "",
  ].join("\n");
}

export function v2CartridgeInput(version = "2.0.0"): PublishCartridgeInput {
  const tpsModules = ["tps_camera", "grounded_physics", "offline_session"];
  const fpsModules = ["fps_camera", "grounded_physics", "offline_session"];
  const opening = scene("opening", "tps_exploration@1", "explore", tpsModules, "ending", true);
  const ending = scene("ending", "fps_puzzle@1", "puzzle", fpsModules, null);
  const moduleLock = { entries: locked(...new Set([...tpsModules, ...fpsModules])) };
  return {
    manifest: {
      formatVersion: 2,
      cartridgeId: "v2-world",
      version,
      name: "V2 World",
      description: "A two-context v2 cartridge.",
      author: "tests",
      createdAt: "2026-09-26T00:00:00.000Z",
      engineApiVersion: 1,
      saveSchemaVersion: 1,
      networkProtocolVersion: 1,
      definition: {
        formatVersion: 2,
        gameId: "v2-world",
        title: "V2 World",
        description: "A two-context v2 cartridge.",
        author: "tests",
        modeSelection: {
          genres: ["first_person_shooter", "adventure_rpg"],
          timings: ["realtime"],
          structures: [],
          settings: ["sci_fi"],
        },
        capabilityProfile: {
          profileId: "profile-main",
          defaultContextId: "explore",
          contexts: [
            {
              contextId: "explore",
              profile: {
                entries: [
                  { key: "camera", value: "third_person", moduleId: "tps_camera" },
                  { key: "physics", value: "grounded", moduleId: "grounded_physics" },
                  { key: "network", value: "offline", moduleId: "offline_session" },
                ],
              },
            },
            {
              contextId: "puzzle",
              profile: {
                entries: [
                  { key: "camera", value: "first_person", moduleId: "fps_camera" },
                  { key: "physics", value: "grounded", moduleId: "grounded_physics" },
                  { key: "network", value: "offline", moduleId: "offline_session" },
                ],
              },
            },
          ],
          transitions: [
            {
              fromContextId: "explore",
              toContextId: "puzzle",
              trigger: "scene_exit",
              triggerId: "opening",
            },
          ],
        },
        assetPacks: [builtinAssetPack(["tree"])],
        scenePlan: {
          orderedSceneIds: ["opening", "ending"],
          entrySceneId: "opening",
          endingSceneIds: ["ending"],
          transitions: [
            {
              fromSceneId: "opening",
              toSceneId: "ending",
              triggerId: "exit",
              requiresFlags: [],
            },
          ],
        },
        scenes: [
          {
            sceneId: "opening",
            slotId: "opening",
            candidateId: "opening-candidate",
            sourceHash: sha256(opening),
            requiredProfileId: "profile-main",
            requiredContextId: "explore",
            requiredModules: tpsModules,
            assets: [builtinAssetRef("tree")],
          },
          {
            sceneId: "ending",
            slotId: "ending",
            candidateId: "ending-candidate",
            sourceHash: sha256(ending),
            requiredProfileId: "profile-main",
            requiredContextId: "puzzle",
            requiredModules: fpsModules,
            assets: [],
          },
        ],
        narrative: {
          required: false,
          premise: "",
          finale: "",
          scenes: [
            { sceneId: "opening", title: "Opening", summary: "", objective: "" },
            { sceneId: "ending", title: "Ending", summary: "", objective: "" },
          ],
        },
        moduleLock,
        modLock: structuredClone(EMPTY_MOD_LOCK),
        provenance: { source: "new", parent: null, generation: [] },
      },
      lineage: { kind: "revision", parent: null },
    },
    rules: V2_RULES,
    scenes: { opening, ending },
  };
}

/** The opening scene with one resident, so baked dialogue has an NPC to belong to. */
const OPENING_WITH_NPC = [
  'root = Scene("opening", "meadow", [contract, ground, tree, keeper, exit])',
  'contract = Contract("opening", "tps_exploration@1", [], [], "carry", ["opening_done"], false, "profile-main", "explore", ["tps_camera","grounded_physics","offline_session"])',
  'ground = Floor(8, 8, "grass")',
  'tree = Prop("tree", 2, 2, 1, null, false, "builtin:tree")',
  'keeper = NPC("keeper", "Keeper", 3, 3, "elder", "calm", "#d8c9a3")',
  'exit = Exit(7, 7, "Continue", "ending")',
  "",
].join("\n");

export const KEEPER_DIALOGUE = [
  'root = Dialogue("keeper", "The gate sticks after rain. Push it with your shoulder.", [c1])',
  'c1 = Choice("Thank her", "leave", "The keeper goes back to the fence.", [])',
  "",
].join("\n");

/**
 * A v2 cartridge whose opening scene has an NPC and one baked conversation for them, so publish,
 * read, pack and unpack can all be checked against real dialogue content.
 */
export function v2CartridgeWithVoices(version = "2.0.0"): PublishCartridgeInput {
  const input = v2CartridgeInput(version);
  if (input.manifest.formatVersion !== 2) throw new Error("expected a v2 fixture");
  input.scenes = { ...input.scenes, opening: OPENING_WITH_NPC };
  input.manifest.definition.scenes = input.manifest.definition.scenes.map((scene) =>
    scene.sceneId === "opening" ? { ...scene, sourceHash: sha256(OPENING_WITH_NPC) } : scene,
  );
  input.dialogues = { "opening/keeper": KEEPER_DIALOGUE };
  return input;
}
