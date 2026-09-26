// Talking on open land reads words that were written when the place was witnessed. There is no
// model call here and never will be (plan.md §1.4): a resident whose words were never written says
// so honestly instead of improvising.
//
// A resident also passes on the news (rev 6 phase 3, D14): the live rumors a beat gave them to
// tell, read from the world's history as stored words — "They say…" under what they say, still
// with no model call (`rumorsHeardBy`, shown by RumorRow).

import { parseDialogue } from "@dsl";
import { type RumorView, rumorsFor } from "@renderer/history";
import {
  foreignAt,
  useContinentStore,
  useLandStore,
  useSessionStore,
  useWorldStore,
} from "@renderer/state";
import { dialogueKey } from "@shared/cartridge";
import { type ChunkCoord, chunkKey } from "@shared/chunks";
import type { WorldNow } from "@shared/history/types";
import { parseLandTarget } from "@shared/land";
import { errored, ready } from "@shared/result";

const UNWRITTEN_HINT =
  "Residents' words are written once, when their place is witnessed; talking never asks the model.";

/** Where a resident lives and who they are: a witnessed one's land target, else chunk (0, 0). */
function residentOf(npcId: string): { coord: ChunkCoord; id: string } {
  const target = parseLandTarget(npcId);
  return { coord: target?.coord ?? { cx: 0, cz: 0 }, id: target?.npcId ?? npcId };
}

/** How many rumors a resident passes on at once, newest first. */
export const RUMORS_TOLD = 3;

/**
 * What a resident has heard (D14): the live rumors whose slot names them as the listener, newest
 * beat first, from the stored words alone. A resident of another world's land (a continent) tells
 * none, and neither does one whose home was witnessed anew after the beat chose its listener:
 * someone else lives there now, whatever their id.
 */
export function rumorsHeardBy(
  npcId: string,
  rumors: readonly RumorView[],
  now: WorldNow | null,
): RumorView[] {
  if (now === null || rumors.length === 0) return [];
  const { coord, id } = residentOf(npcId);
  if (foreignAt(coord) !== null) return [];
  const home = now.chunks[chunkKey(coord)];
  if (home === undefined) return [];
  const upTo = new Map(now.beats.map((beat) => [beat.id, beat.body.upTo]));
  return rumorsFor(rumors, coord, id)
    .filter((rumor) => home.live.n <= (upTo.get(rumor.beat) ?? -1))
    .slice(0, RUMORS_TOLD);
}

/** Opens the stored dialogue of `npcId` (a witnessed resident or an authored one on open land). */
export function talkOnLand(npcId: string): void {
  const session = useSessionStore.getState();
  const target = parseLandTarget(npcId);
  const coord = residentOf(npcId).coord;
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
