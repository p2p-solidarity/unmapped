// The second half of an NPC encounter. The first turn writes the Dialogue program; when the player
// picks a choice, this turn lets the model actually enact it — with tools, which is the only path a
// model has to the world (Rule 11) — and answer with one in-world line.
//
// Tools are offered, not required. The prompt says to use them only if the world must change, so a
// choice that is pure conversation costs one completion and changes nothing.

import type { ToolExecutionResult } from "@harness";
import { useWorldStore } from "@renderer/state/worldStore";
import { languageName } from "@shared/language";
import { err, fail, ok, type Result } from "@shared/result";
import type { DialogueChoice, NpcSpec } from "@shared/world";
import { runNarrativeTurn } from "./turn";

export const RESOLVE_MAX_TOKENS = 700;
export const RESOLVE_TEMPERATURE = 0.85;
/** One round of tool calls, then the line. Enough to act; not enough to wander. */
export const RESOLVE_MAX_STEPS = 3;

export interface ChoiceResolution {
  /** The single in-world line the model answered with, in the player's language. */
  narration: string;
  toolResults: ToolExecutionResult[];
}

export async function resolveChoice(
  npc: NpcSpec,
  choice: DialogueChoice,
): Promise<Result<ChoiceResolution>> {
  const genesis = useWorldStore.getState().genesis;
  if (genesis === null) {
    return err(
      "no-genesis",
      "This world has no covenant loaded.",
      "reload the world so its genesis.json is read",
    );
  }

  const user = [
    `You are speaking as ${npc.name} (${npc.id}).`,
    `The player chose: ${choice.label}.`,
    `Intended effect: ${choice.effect}.`,
    `Enact it with tools only if the world must change; then answer with one in-world line in ${languageName(genesis.language)}.`,
  ].join(" ");

  const turn = await runNarrativeTurn({
    purpose: "resolve",
    language: genesis.language,
    messages: [{ role: "user", content: user }],
    useTools: true,
    maxSteps: RESOLVE_MAX_STEPS,
    maxTokens: RESOLVE_MAX_TOKENS,
    temperature: RESOLVE_TEMPERATURE,
  });
  if (!turn.ok) return fail(turn.error);

  const narration = turn.value.text.trim();
  if (narration.length === 0 && turn.value.toolResults.length === 0) {
    return err(
      "empty-resolution",
      `${npc.name} said nothing and did nothing.`,
      "try again, or switch to a larger model in Settings",
    );
  }
  return ok({ narration, toolResults: turn.value.toolResults });
}
