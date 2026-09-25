// Builds the one game every seed is a land of (plan.md §1) into src/main/game/aether-land.json,
// through the same Forge path a model-written world is published with. Run after changing any of
// the text below, then bump VERSION: an installed revision is never overwritten.
//
//   bun --tsconfig-override tsconfig.test.json scripts/build-base-game.mjs
//
// The bible is the game's design (plan.md §2), not sample content: it names no place, person or
// line. The origin is a bare plot of land — who lives around it is written by witnessing.

import { writeFileSync } from "node:fs";
import { openLandCartridge } from "../src/renderer/narrative/openLandCartridge.ts";

const VERSION = "1.0.0";
const OUT = "src/main/game/aether-land.json";

const CORE = `Premise: A land where the maps stopped being drawn. Past what is known the land is real, but it has no names, no people and no stories until someone walks there and sees it. The player is a witness, not a hero.
Tone: Shōwa-era countryside. Quiet, a little lonely, warm.
Rules:
- People live ordinary lives: fields, a small shop, the bus that comes twice a day, the bathhouse, mending the power line.
- Common sights: utility poles, a single-track railway, unmanned stations, a bathhouse chimney, a vending machine glowing in a field, breakwaters, windmills, terraced fields.
- Every place keeps one small custom of its own. Neighbouring places keep similar customs; the farther you walk, the stranger they become.
- People remember things differently and may contradict each other and older stories.
- Help is repaid with favours and small keepsakes, not money.
Never:
- Magic, monsters, swords, prophecies, heroes, the end of the world.
- Anyone speaking of maps being drawn by someone, of games, players, or of being written.`;

const STYLE = `Naming: Places are named after what stands there or what happens there, short and plain. People go by short first names or nicknames.
Voice: Short sentences, plain words. People mention the weather or the season before anything else. Every word the player reads is in the player's language.`;

const ORIGIN = `root = Scene("Home", "countryside", [ground, sky1, sun1])
ground = Floor(16, 16, "grass")
sky1 = Sky("#b9d3e3", "#dfe8ea", 0.02)
sun1 = Light("sun", "#fff3d6", 1.4)
`;

const built = await openLandCartridge({
  cartridgeId: "aether-land",
  version: VERSION,
  name: "未記之地",
  author: "Aether Spire",
  premise: "A land where the maps stopped being drawn.",
  originSource: ORIGIN,
  bible: { core: CORE, style: STYLE },
  createdAt: "2026-09-17T00:00:00.000Z",
});
if (!built.ok) {
  console.error(`✗ ${built.error.code}: ${built.error.message}`);
  process.exit(1);
}
writeFileSync(OUT, `${JSON.stringify(built.value, null, 2)}\n`);
console.log(`✓ ${OUT} (${built.value.manifest.cartridgeId}@${built.value.manifest.version})`);
