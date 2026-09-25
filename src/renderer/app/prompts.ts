// HUD interaction prompts. The engine publishes what is nearby; this maps it to the one line the
// player reads above the interact key. Labels come from the model via the engine — never invented
// here; when a label is empty the prompt degrades to the verb alone.

import { type StringKey, translate } from "@renderer/i18n";
import type { NearbyTarget } from "@shared/events";
import { PLACE_BACK, PLACE_GOAL } from "@shared/places";

export const INTERACT_KEY = "E";

const PREFIX = `${INTERACT_KEY} · `;

/** The verb with the label when the model gave one, the bare verb when it did not. */
function named(label: string, withName: StringKey, bare: StringKey): string {
  return label.length > 0 ? translate(withName, { name: label }) : translate(bare);
}

export function nearbyPrompt(target: NearbyTarget | null): string | null {
  if (target === null) return null;
  const label = target.label.trim();
  switch (target.kind) {
    case "npc":
      return `${PREFIX}${named(label, "hud.promptTalkTo", "hud.promptTalk")}`;
    case "treasure":
      return `${PREFIX}${translate("hud.promptOpen")}`;
    case "exit":
      if (label === PLACE_BACK) return `${PREFIX}${translate("hud.promptBackToLand")}`;
      if (label === PLACE_GOAL) return `${PREFIX}${translate("hud.promptFinish")}`;
      return `${PREFIX}${translate("hud.promptDescend")}`;
    case "altar":
      return `${PREFIX}${translate("hud.promptWish")}`;
    case "monster":
      return `${PREFIX}${named(label, "hud.promptInspectName", "hud.promptInspect")}`;
    case "trigger":
      return `${PREFIX}${named(label, "hud.promptExamineName", "hud.promptExamine")}`;
    case "search":
      return `${PREFIX}${translate("hud.promptSearch")}`;
    case "door":
      return `${PREFIX}${translate("hud.promptDoor")}`;
    case "episode":
    case "place":
      return `${PREFIX}${named(label, "hud.promptEnterName", "hud.promptEnter")}`;
  }
}
