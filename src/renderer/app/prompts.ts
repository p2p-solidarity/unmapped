// HUD interaction prompts. The engine publishes what is nearby; this maps it to the one line the
// player reads above the interact key. Labels come from the model via the engine — never invented
// here; when a label is empty the prompt degrades to the verb alone.

import type { NearbyTarget } from "@shared/events";

export const INTERACT_KEY = "E";

const PREFIX = `${INTERACT_KEY} · `;

export function nearbyPrompt(target: NearbyTarget | null): string | null {
  if (target === null) return null;
  const label = target.label.trim();
  switch (target.kind) {
    case "npc":
      return `${PREFIX}${label.length > 0 ? `Talk to ${label}` : "Talk"}`;
    case "treasure":
      return `${PREFIX}Open`;
    case "exit":
      return `${PREFIX}Descend`;
    case "altar":
      return `${PREFIX}Make a wish`;
    case "monster":
      return `${PREFIX}${label.length > 0 ? `Inspect ${label}` : "Inspect"}`;
    case "trigger":
      return `${PREFIX}${label.length > 0 ? `Examine ${label}` : "Examine"}`;
    case "search":
      return `${PREFIX}Search here`;
    case "door":
      return `${PREFIX}Open the door`;
    case "episode":
      return `${PREFIX}${label.length > 0 ? `Enter · ${label}` : "Enter"}`;
  }
}
