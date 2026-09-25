// Baked NPC conversations inside an immutable revision: `dialogue/<sceneId>/<npcId>.oui`.
//
// Publish-time validation lives here rather than in validate-revision.ts because it is one job:
// every key names a declared scene and an NPC that scene actually contains, and every program
// parses as a Dialogue whose npcId matches. Anything else is refused — a cartridge never ships a
// conversation nobody can reach.

import { parseDialogue } from "@dsl/index";
import type { CartridgeFileIntegrity } from "@shared/cartridge";
import { dialogueFile } from "@shared/cartridge";
import { err, ok, type Result } from "@shared/result";
import type { SceneGraph } from "@shared/world";
import { fileIntegrity } from "./integrity";
import { normaliseSource } from "./validate-revision";

const KEY = /^([a-z0-9][a-z0-9_-]{0,79})\/([a-z0-9][a-z0-9_-]{0,79})$/;

export interface PreparedDialogues {
  dialogues: Record<string, string>;
  files: CartridgeFileIntegrity[];
}

/**
 * Normalises and checks every baked conversation against the scenes being published.
 * `scenes` is the already-parsed scene set, keyed by scene id.
 */
export function prepareDialogues(
  input: Record<string, string> | undefined,
  scenes: ReadonlyMap<string, SceneGraph>,
): Result<PreparedDialogues> {
  const dialogues: Record<string, string> = {};
  const files: CartridgeFileIntegrity[] = [];
  for (const key of Object.keys(input ?? {}).sort()) {
    const match = KEY.exec(key);
    if (match === null) {
      return err(
        "cartridge-dialogue-invalid",
        `Unsafe dialogue key: ${key}`,
        "A baked conversation is keyed <sceneId>/<npcId>.",
      );
    }
    const [, sceneId = "", npcId = ""] = match;
    const scene = scenes.get(sceneId);
    if (scene === undefined) {
      return err(
        "cartridge-dialogue-invalid",
        `Dialogue ${key} names undeclared scene ${sceneId}.`,
      );
    }
    if (!scene.npcs.some((npc) => npc.id === npcId)) {
      return err(
        "cartridge-dialogue-invalid",
        `Dialogue ${key} names an NPC that ${sceneId}.oui does not contain.`,
        "Bake the voices again after editing the scene.",
      );
    }
    const source = normaliseSource(input?.[key] ?? "");
    const parsed = parseDialogue(source);
    if (!parsed.ok) {
      return err(
        "cartridge-dialogue-invalid",
        `${dialogueFile(key)} could not be parsed: ${parsed.error.message}`,
        parsed.error.hint,
      );
    }
    if (parsed.value.npcId !== npcId) {
      return err(
        "cartridge-dialogue-invalid",
        `${dialogueFile(key)} speaks as "${parsed.value.npcId}" but is filed under ${npcId}.`,
      );
    }
    dialogues[key] = source;
    files.push(fileIntegrity(dialogueFile(key), source));
  }
  return ok({ dialogues, files });
}
