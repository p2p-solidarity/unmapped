// DialogueGraph → a Dialogue program. A witnessed resident's words are stored as an ordinary
// Dialogue program so reading them back is `parseDialogue`, exactly like any other dialogue.
// `parseDialogue(serializeDialogue(g))` deep-equals `g` for graphs without a mutation.

import type { DialogueGraph } from "@shared/world";

const str = (value: string): string => JSON.stringify(value);

export function serializeDialogue(graph: DialogueGraph): string {
  const names = graph.choices.map((_choice, index) => `c${index + 1}`);
  const lines = [
    `root = Dialogue(${str(graph.npcId)}, ${str(graph.line)}, [${names.join(", ")}])`,
    ...graph.choices.map(
      (choice, index) =>
        `${names[index]} = Choice(${str(choice.label)}, ${str(choice.action)}, ${str(choice.effect)}, [${choice.gives.map(str).join(", ")}])`,
    ),
  ];
  return `${lines.join("\n")}\n`;
}
