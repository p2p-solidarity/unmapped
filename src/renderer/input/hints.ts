// The HUD's control row, as it reads after a pad input: each keyboard line has a pad line.

import type { StringKey } from "@renderer/i18n";

const PAD_LINE: Partial<Record<StringKey, StringKey>> = {
  "hud.controlsLandArmed": "input.padLandArmed",
  "hud.controlsLand": "input.padLand",
  "hud.controlsLand3d": "input.padLand3d",
  "hud.controlsFpsArmed": "input.padFpsArmed",
  "hud.controlsFps": "input.padFps",
  "hud.controlsSide": "input.padSide",
  "hud.controlsTopdown": "input.padTopdown",
  "hud.controlsTps": "input.padTps",
  "placeView.hintSide": "input.padPlaceSide",
  "placeView.hintSideArmed": "input.padPlaceSideArmed",
  "placeView.hintDungeonArmed": "input.padPlaceDungeonArmed",
};

/** The pad's version of a HUD control line (the line itself when the pad has none). */
export function padControlsHint(key: StringKey): StringKey {
  return PAD_LINE[key] ?? key;
}
