// What an error says to the player, by its machine code (Rule 5). The source keeps its English
// message and hint — the model reads those in repair rounds and they land in logs — so this table
// only changes what the screen shows. A code missing here shows the original words.
//
// Each message holds for every place its code is raised. Left out on purpose: cancellations, the
// generic `unknown`, codes only the model reads (@@ reply format, SEARCH/REPLACE edits, skills, tool
// templates), Apple helper protocol codes (the scene router reports them as
// `provider-generation-failed`), and bug-only builder checks (`forge-*`, `base-game-invalid`).

import { ACCOUNT_ERRORS } from "./errors-account";
import { BROWSER_ERRORS } from "./errors-browser";
import { BUNDLE_ERRORS } from "./errors-bundle";
import { CARTRIDGE_ERRORS } from "./errors-cartridge";
import { FILE_ERRORS } from "./errors-files";
import { IDENTITY_ERRORS } from "./errors-identity";
import { IMAGES_ERRORS } from "./errors-images";
import { LAND_ERRORS } from "./errors-land";
import { LAND_HISTORY_ERRORS } from "./errors-landHistory";
import { MARKET_ERRORS } from "./errors-market";
import { MODEL_ERRORS } from "./errors-model";
import { NET_ERRORS } from "./errors-net";
import { SAVE_ERRORS } from "./errors-save";
import { WORKS_ERRORS } from "./errors-works";
import { WORLD_ERRORS } from "./errors-world";
import type { Phrase } from "./phrase";
import { RUMOR_ERRORS } from "./rumors";
import { TRACE_ERRORS } from "./traces";

export interface ErrorText {
  message: Phrase;
  hint?: Phrase;
}

export const ERRORS: Record<string, ErrorText> = {
  ...MODEL_ERRORS,
  ...LAND_ERRORS,
  ...CARTRIDGE_ERRORS,
  ...SAVE_ERRORS,
  ...FILE_ERRORS,
  ...IDENTITY_ERRORS,
  ...NET_ERRORS,
  ...WORKS_ERRORS,
  ...WORLD_ERRORS,
  ...LAND_HISTORY_ERRORS,
  ...ACCOUNT_ERRORS,
  ...RUMOR_ERRORS,
  ...IMAGES_ERRORS,
  ...BROWSER_ERRORS,
  ...TRACE_ERRORS,
  ...BUNDLE_ERRORS,
  ...MARKET_ERRORS,
};
