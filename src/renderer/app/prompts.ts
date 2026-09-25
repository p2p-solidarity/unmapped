// HUD interaction prompts. The engine publishes what is nearby; this maps it to the one line the
// player reads beside the interact key. Labels come from the model via the engine — never invented
// here; when a label is empty the prompt degrades to the verb alone. The key itself (E, or the pad's
// A after a pad input) is drawn by NearbyPrompt, so the line never names one.

import { type StringKey, translate } from "@renderer/i18n";
import { useWorldStore } from "@renderer/state";
import type { NearbyTarget } from "@shared/events";
import { PLACE_BACK, PLACE_GOAL } from "@shared/places";

/** The verb with the label when the model gave one, the bare verb when it did not. */
function named(label: string, withName: StringKey, bare: StringKey): string {
  return label.length > 0 ? translate(withName, { name: label }) : translate(bare);
}

export function nearbyPrompt(target: NearbyTarget | null): string | null {
  if (target === null) return null;
  const label = target.label.trim();
  switch (target.kind) {
    case "npc":
      return named(label, "hud.promptTalkTo", "hud.promptTalk");
    case "treasure":
      return translate("hud.promptOpen");
    case "exit":
      if (label === PLACE_BACK) return translate("hud.promptBackToLand");
      if (label === PLACE_GOAL) return translate("hud.promptFinish");
      return translate("hud.promptDescend");
    case "altar":
      // Only the legacy archive still wishes at altars; elsewhere an altar is scenery.
      return useWorldStore.getState().origin?.kind === "legacy"
        ? translate("hud.promptWish")
        : null;
    case "monster":
      return named(label, "hud.promptInspectName", "hud.promptInspect");
    case "trigger":
      return named(label, "hud.promptExamineName", "hud.promptExamine");
    case "search":
      return translate("hud.promptSearch");
    case "door":
      return translate("hud.promptDoor");
    case "episode":
    case "place":
      return named(label, "hud.promptEnterName", "hud.promptEnter");
  }
}
