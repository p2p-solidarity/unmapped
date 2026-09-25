// NPC encounters. `generateDialogue` is the pure generator; `startDialogue` is the flow the HUD
// calls when the player interacts with an NPC — it owns the session-store transitions so the card
// is always in exactly one of loading / error / ready (Rule 2).

import { dialoguePrompt, parseDialogue } from "@dsl";
import { useSessionStore } from "@renderer/state/sessionStore";
import { useWorldStore } from "@renderer/state/worldStore";
import { errored, type Result, ready } from "@shared/result";
import type {
  DialogueGraph,
  Genesis,
  Inventory,
  KarmaEntry,
  NpcSpec,
  SceneGraph,
} from "@shared/world";
import { generateProgram, type Program } from "./pipeline";
import { inventorySummary, karmaSummary } from "./summaries";

export const DIALOGUE_MAX_TOKENS = 900;
export const DIALOGUE_TEMPERATURE = 0.95;

export interface GenerateDialogueInput {
  npc: NpcSpec;
  scene: SceneGraph;
  genesis: Genesis;
  karma: KarmaEntry[];
  inventory: Inventory;
}

export function generateDialogue(
  input: GenerateDialogueInput,
  onDelta?: (text: string) => void,
): Promise<Result<Program<DialogueGraph>>> {
  const system = dialoguePrompt({
    genesis: input.genesis,
    npc: input.npc,
    scene: input.scene,
    karmaSummary: karmaSummary(input.karma),
    inventorySummary: inventorySummary(input.inventory),
  });

  const user = [
    `Write the Dialogue program for "${input.npc.name}" (id ${input.npc.id}).`,
    "Output the program only.",
  ].join("\n");

  return generateProgram<DialogueGraph>({
    system,
    user,
    purpose: "dialogue",
    language: input.genesis.language,
    parse: parseDialogue,
    maxTokens: DIALOGUE_MAX_TOKENS,
    temperature: DIALOGUE_TEMPERATURE,
    onDelta,
  });
}

/** Opens the dialogue card for an NPC in the loaded scene and drives it to ready or error. */
export async function startDialogue(
  npcId: string,
  onDelta?: (text: string) => void,
): Promise<void> {
  const session = useSessionStore.getState();
  const world = useWorldStore.getState();
  session.openDialogue(npcId);

  if (world.scene.status !== "ready") {
    session.setDialogue(
      errored({
        code: "no-scene",
        message: "There is no floor loaded to talk on.",
        hint: "generate or reload the floor first",
      }),
    );
    return;
  }
  const npc = world.scene.value.npcs.find((candidate) => candidate.id === npcId);
  if (npc === undefined) {
    session.setDialogue(
      errored({
        code: "npc-not-found",
        message: `No NPC with id "${npcId}" on this floor.`,
        hint: "the floor may have been rewritten — reload the world",
      }),
    );
    return;
  }
  if (world.genesis === null) {
    session.setDialogue(
      errored({ code: "no-genesis", message: "This world has no covenant loaded." }),
    );
    return;
  }

  const result = await generateDialogue(
    {
      npc,
      scene: world.scene.value,
      genesis: world.genesis,
      karma: useWorldStore.getState().karma,
      inventory: useWorldStore.getState().inventory,
    },
    onDelta,
  );

  // The player may have walked away while the model was writing.
  if (useSessionStore.getState().dialogueNpcId !== npcId) return;
  useSessionStore
    .getState()
    .setDialogue(result.ok ? ready(result.value.graph) : errored(result.error));
}
