// Talking on open land reads words that were written when the place was witnessed. There is no
// model call here and never will be (plan.md §1.4): a resident whose words were never written says
// so honestly instead of improvising.

import { parseDialogue } from "@dsl";
import {
  foreignAt,
  useContinentStore,
  useLandStore,
  useSessionStore,
  useWorldStore,
} from "@renderer/state";
import { dialogueKey } from "@shared/cartridge";
import { chunkKey } from "@shared/chunks";
import { parseLandTarget } from "@shared/land";
import { errored, ready } from "@shared/result";

const UNWRITTEN_HINT =
  "Residents' words are written once, when their place is witnessed; talking never asks the model.";

/** Opens the stored dialogue of `npcId` (a witnessed resident or an authored one on open land). */
export function talkOnLand(npcId: string): void {
  const session = useSessionStore.getState();
  const target = parseLandTarget(npcId);
  const coord = target?.coord ?? { cx: 0, cz: 0 };
  const key = chunkKey(coord);
  // On a continent, a resident of another world's land speaks the words its owner's world wrote.
  const foreign = foreignAt(coord) !== null;
  const chunk = (foreign ? useContinentStore.getState().chunks : useLandStore.getState().chunks)[
    key
  ];
  const id = target?.npcId ?? npcId;
  const scene = useWorldStore.getState().scene;
  const speaker =
    (chunk?.status === "written"
      ? chunk.scene.npcs.find((npc) => npc.id === id)?.name
      : undefined) ??
    (scene.status === "ready" ? scene.value.npcs.find((npc) => npc.id === id)?.name : undefined) ??
    id;
  // An authored scene brings its own people, and a forged cartridge carries their words with it.
  // Those come first: a resident of chunk (0, 0) is the author's, not the land's.
  const active = useSessionStore.getState().activeInstance;
  const baked =
    active === null || foreign
      ? undefined
      : active.cartridge.dialogues[dialogueKey(active.instance.save.currentSceneId, id)];
  const source = baked ?? (chunk?.status === "written" ? chunk.dialogues[id] : undefined);
  if (source === undefined) {
    session.showWitnessedDialogue(
      npcId,
      speaker,
      errored({
        code: "dialogue-unwritten",
        message: `What ${speaker} says has not been written yet.`,
        hint: UNWRITTEN_HINT,
      }),
    );
    return;
  }
  const dialogue = parseDialogue(source);
  session.showWitnessedDialogue(
    npcId,
    speaker,
    dialogue.ok
      ? ready(dialogue.value)
      : errored({
          code: "dialogue-invalid",
          message: `The stored words of ${speaker} no longer parse: ${dialogue.error.message}`,
          hint: "Restore this save's chunks folder from a backup.",
        }),
  );
}
