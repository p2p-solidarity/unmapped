// Baking the voices of a cartridge: one written Dialogue program per NPC of every selected scene,
// stored on the candidate and published with the cartridge.
//
// Why at author time rather than when the player presses E: a published cartridge is immutable and
// shareable, so whoever plays it should hear the same people the author heard, with no model
// running. A scene whose NPCs cannot be written is an error the Story step shows — the cartridge
// is simply not baked yet, and nothing is invented to fill the gap (Rule 2).

import { parseScene } from "@dsl";
import { err, ok, type Result } from "@shared/result";
import type { SceneGallerySlot } from "@shared/scene-gallery";
import type { NarrativeContext, SceneGraph } from "@shared/world";
import { generateDialogue } from "./dialogue";

export interface VoiceProgress {
  /** Scene title currently being written, and how far through the plan we are. */
  sceneTitle: string;
  npcName: string;
  done: number;
  total: number;
}

/** slotId → (npcId → Dialogue program source). */
export type BakedVoices = Record<string, Record<string, string>>;

function selected(slot: SceneGallerySlot) {
  return slot.candidates.find((candidate) => candidate.candidateId === slot.selectedCandidateId);
}

/**
 * Writes every missing NPC line of every selected scene. Voices already baked for an unchanged
 * scene are kept, so a retry after one failure does not re-ask the model for the whole cartridge.
 */
export async function bakeVoices(
  slots: readonly SceneGallerySlot[],
  genesis: NarrativeContext,
  onProgress?: (progress: VoiceProgress) => void,
): Promise<Result<BakedVoices>> {
  const work: { slot: SceneGallerySlot; scene: SceneGraph }[] = [];
  for (const slot of slots) {
    const candidate = selected(slot);
    if (candidate === undefined) {
      return err(
        "voices-scene-unselected",
        `"${slot.title}" has no selected scene.`,
        "Pick one candidate for every scene first.",
      );
    }
    const scene = parseScene(candidate.sceneSource);
    if (!scene.ok) {
      return err(
        "voices-scene-invalid",
        `"${slot.title}" no longer parses: ${scene.error.message}`,
      );
    }
    work.push({ slot, scene: scene.value });
  }

  const total = work.reduce((count, one) => count + one.scene.npcs.length, 0);
  if (total === 0) {
    return err(
      "voices-no-npcs",
      "No scene in this cartridge has anyone to talk to.",
      "Reroll a scene until it has NPCs, or add one in the visual editor.",
    );
  }

  const baked: BakedVoices = {};
  let done = 0;
  for (const { slot, scene } of work) {
    const candidate = selected(slot);
    const existing = candidate?.dialogues ?? {};
    const voices: Record<string, string> = {};
    for (const npc of scene.npcs) {
      const already = existing[npc.id];
      if (already !== undefined && already.trim().length > 0) {
        voices[npc.id] = already;
        done += 1;
        continue;
      }
      onProgress?.({ sceneTitle: slot.title, npcName: npc.name, done, total });
      const written = await generateDialogue({
        npc,
        scene,
        genesis,
        karma: [],
        inventory: { items: [], materials: [] },
      });
      if (!written.ok) {
        return err(
          written.error.code,
          `${npc.name} in "${slot.title}": ${written.error.message}`,
          written.error.hint,
        );
      }
      voices[npc.id] = written.value.source;
      done += 1;
    }
    baked[slot.slotId] = voices;
  }
  onProgress?.({ sceneTitle: "", npcName: "", done, total });
  return ok(baked);
}
