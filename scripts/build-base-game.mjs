// Builds the one game every seed is a land of (plan.md §1) into src/main/game/aether-land-<VERSION>.json,
// through the same Forge path a model-written world is published with. Run after changing any of
// the text below, then bump VERSION: an installed revision is never overwritten, and every earlier
// file stays shipped (src/main/game/base.ts) so a save pinned to it still opens on a new machine.
//
//   bun --tsconfig-override tsconfig.test.json scripts/build-base-game.mjs
//
// The bible is the game's design (plan.md §2), not sample content: it names no place, person or
// line. The origin is a bare plot of land — who lives around it is written by witnessing.
// Since 1.3.0 the game also carries a short, gentle story (below), so a new game has chapters
// from the first minute; each chapter's people and finds are still written at its gate.

import { writeFileSync } from "node:fs";
import { openLandCartridge } from "../src/renderer/narrative/openLandCartridge.ts";
import { episodePlaces, storyPlanSchema } from "../src/shared/story.ts";
import { checkPlayKinds } from "../src/shared/storyEdits.ts";

const VERSION = "1.3.0";
const OUT = `src/main/game/aether-land-${VERSION}.json`;

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

// Rev 6: the Shōwa countryside is this world's own look, not every world's. `Look:` and `Props:` are
// what prompts read (@shared/bible); the list is exactly what 1.0.0's prompts listed, so it feels
// the same.
const STYLE = `Naming: Places are named after what stands there or what happens there, short and plain. People go by short first names or nicknames.
Voice: Short sentences, plain words. People mention the weather or the season before anything else. Every word the player reads is in the player's language.
Look: Shōwa-era countryside: wooden houses with tin roofs, utility poles along farm roads, a single-track railway, a bathhouse chimney, a vending machine glowing in a field; dry grass, weathered wood and a pale warm sky.
Props: tree, rock, crate, well, statue, pillar, fence, flower, mushroom, signpost, utility_pole, vending_machine, bus_stop, rail_track, chimney, steel_tower, windmill, breakwater, house`;

const ORIGIN = `root = Scene("Home", "countryside", [ground, sky1, sun1])
ground = Floor(16, 16, "grass")
sky1 = Sky("#b9d3e3", "#dfe8ea", 0.02)
sun1 = Light("sun", "#fff3d6", 1.4)
`;

// Rev 6 D7, a cozy default world: three gentle chapters (meet / search / meet) in the bible's own
// language and voice — weather first, plain words, help repaid with keepsakes — and no fight,
// because this world has none. Titles, places and briefs only: who is there and what they say is
// written at each gate. The gates are the host's (`episodePlaces`, chunk centres on the fords),
// exactly as Create places a new world's chapters.
const LOGLINE =
  "Late summer, past the last road anyone knows. You come with nothing to do but look and listen, and by the first cold evening the people out here count you as one of their own.";

const CHAPTERS = [
  {
    title: "The Twice-a-Day Bus",
    place: "Last Stop",
    kind: "meet",
    brief:
      "Late summer, and the grass is up to the bench at the last bus stop. A few people wait there for the afternoon bus, late as always. Talk with each of them about the heat, their errands and the small custom they keep at the stop. When everyone has had their say, one of them gives you a keepsake for listening.",
  },
  {
    title: "What the Wind Took",
    place: "Windmill Terraces",
    kind: "search",
    brief:
      "A night of wind has scattered things over the terraced fields below the windmill: a straw hat, a seed tin, a child's kite, a letter not yet posted. Look along the field paths and the stone walls and find every one; the people who lost them are glad to see them back. The one who keeps the windmill repays you with a jar of pickled plums and a favour owed.",
  },
  {
    title: "First Fire at the Bathhouse",
    place: "Chimney Bathhouse",
    kind: "meet",
    brief:
      "The first cold evening comes, and smoke rises from the bathhouse chimney again. Neighbours come down the road one by one with towels and news of the day. Share a word with each of them before the water cools. The keeper gives you a wooden locker tag with your own name on it.",
  },
];

// The same checks a Create world passes before it is published: every chapter a kind this game
// can play without combat, and the plan valid for `bible/story.json`.
const kinds = checkPlayKinds(CHAPTERS, false);
if (!kinds.ok) {
  console.error(`✗ ${kinds.error.code}: ${kinds.error.message}`);
  process.exit(1);
}
const places = episodePlaces(kinds.value.length);
const story = storyPlanSchema.safeParse({
  formatVersion: 1,
  logline: LOGLINE,
  episodes: kinds.value.map((chapter, index) => ({
    id: `e${index + 1}`,
    ...chapter,
    ...places[index],
  })),
});
if (!story.success) {
  console.error(`✗ story-invalid: ${story.error.issues[0]?.message ?? "invalid"}`);
  process.exit(1);
}

const built = await openLandCartridge({
  cartridgeId: "aether-land",
  version: VERSION,
  name: "無界之地",
  author: "Aether Spire",
  premise: "A land where the maps stopped being drawn.",
  originSource: ORIGIN,
  bible: { core: CORE, style: STYLE },
  story: story.data,
  createdAt: "2026-09-26T12:00:00.000Z",
});
if (!built.ok) {
  console.error(`✗ ${built.error.code}: ${built.error.message}`);
  process.exit(1);
}
writeFileSync(OUT, `${JSON.stringify(built.value, null, 2)}\n`);
console.log(`✓ ${OUT} (${built.value.manifest.cartridgeId}@${built.value.manifest.version})`);
