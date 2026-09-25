import { kitFor, rulesFor } from "./forge";
import type { GameDefinition } from "./game-definition";
import type { GameplayRules } from "./gameplay";
import { err, ok, type Result } from "./result";
import type { SceneGraph } from "./world";

/** Selects the scene's frozen context. A legacy kit field cannot override a v2 profile. */
export function rulesForSceneContext(
  definition: GameDefinition,
  rules: GameplayRules,
  scene: SceneGraph,
): Result<GameplayRules> {
  const selected = definition.scenes.find((item) => item.sceneId === scene.contract?.sceneId);
  if (
    !selected ||
    scene.contract?.requiredProfileId !== definition.capabilityProfile.profileId ||
    scene.contract.requiredContextId !== selected.requiredContextId
  )
    return err(
      "scene-context-mismatch",
      "The scene does not match its frozen capability context.",
      "Re-publish the scene from its workspace.",
    );
  const context = definition.capabilityProfile.contexts.find(
    (item) => item.contextId === selected.requiredContextId,
  );
  if (!context)
    return err("scene-context-missing", `Context ${selected.requiredContextId} is missing.`);
  const kit = kitFor(context.profile);
  if (!rules.kits.some((item) => item.id === kit))
    return err(
      "scene-kit-missing",
      `Context requires ${kit}, but this cartridge does not configure it.`,
    );
  const compiled = rulesFor(context.profile);
  return ok({
    ...rules,
    defaultKit: kit,
    timing:
      compiled.timing === null
        ? null
        : rules.timing?.system === compiled.timing.system
          ? rules.timing
          : compiled.timing,
    party: compiled.party === null ? null : (rules.party ?? compiled.party),
    combat: compiled.combat === null ? null : (rules.combat ?? compiled.combat),
    weapons: compiled.combat === null ? [] : rules.weapons,
    generation: compiled.generation === null ? null : (rules.generation ?? compiled.generation),
    progression: compiled.progression,
  });
}
