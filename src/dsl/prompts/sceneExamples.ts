// One worked floor per archetype, shown to the model as the only example in the scene prompt.
// These are syntax demonstrations (Rule 2: prompt scaffolding, never world data) — nothing here
// is ever rendered, saved or offered to the player. Each one is parsed by the DSL tests, so a
// change that breaks the dialect fails the build instead of the game.

import type { Archetype } from "@shared/world";

const FARM = `root = Scene("Square of Wet Barley", "meadow", [ground, sky1, sun1, road, field, house_a, house_b, well1, fence1, bloom1, mira, toma, kiku, boar, seeds, chore, stair])
ground = Floor(16, 16, "grass")
sky1 = Sky("#9fc7ff", "#cfe3ff", 0.03)
sun1 = Light("sun", "#fff3d0", 1.5)
road = Patch(8, 8, 2, 8, "sand")
field = Patch(2, 3, 5, 4, "water")
house_a = Wall(3, 10, 4, 2, "wood")
house_b = Wall(11, 3, 3, 2, "wood")
well1 = Prop("well", 9, 7, 1.4, "#8fa3b0")
fence1 = Prop("fence", 2, 8)
bloom1 = Prop("flower", 12, 6, 0.8)
mira = NPC("mira_elder", "Mira", 7, 6, "elder", "calm", "#d8c9a3")
toma = NPC("toma_farmer", "Toma", 4, 9, "farmer", "joyful", "#c9b28a")
kiku = NPC("kiku_child", "Kiku", 11, 9, "child", "manic", "#f0c6d0", "child", "straw", "basket")
boar = Monster("field_boar", "slime", 13, 13, 2, "ringing bells", 1.4, "#7a8f5a")
seeds = Treasure("seed_chest", 6, 13, ["barley seed", "copper nail"])
chore = Quest("mend_the_fence", "Mend the fence Toma broke before the goats notice.")
stair = Exit(9, 15, "Stair of Wet Stone")`;

const DELVE = `root = Scene("Cracked Foundry", "lava_forge", [ground, sky1, amber, pool, ledge_a, ledge_b, ledge_c, wall_a, pillar1, torch1, rubble1, ash, wisp1, golem1, hoard, shaft])
ground = Floor(14, 14, "stone")
sky1 = Sky("#1b1014", "#3a1d18", 0.09)
amber = Light("point", "#ff9a52", 2.2, 4, 10)
pool = Patch(2, 9, 6, 4, "lava")
ledge_a = Platform(4, 8, 3, 2, 1, 0.4, "stone")
ledge_b = Platform(3, 11, 3, 2, 2.5, 0.4, "stone", true)
ledge_c = Platform(8, 11, 2, 2, 4, 0.4, "wood")
wall_a = Wall(0, 0, 14, 3, "stone")
pillar1 = Prop("pillar", 11, 8, 1.6)
torch1 = Prop("torch", 12, 2)
rubble1 = Prop("rock", 9, 3, 1.2)
ash = NPC("ash_smith", "Ash", 2, 2, "smith", "wary", "#8c7a6b")
wisp1 = Monster("ember_wisp", "wisp", 11, 3, 7, "cold water", 0.8, "#ffb46b")
golem1 = Monster("slag_golem", "golem", 12, 12, 12, "its own name", 2.2)
hoard = Treasure("slag_hoard", 8, 11, ["iron shard", "ember glass"])
shaft = Exit(13, 13, "Shaft of Falling Ash")`;

const QUEST = `root = Scene("Statue of the Vow", "sky_isle", [ground, sky1, sun1, road, lane, statue, bench, tree1, ren, koto, sora, shade1, case1, thread, bridge])
ground = Floor(20, 16, "stone")
sky1 = Sky("#b9d6ff", "#e6f0ff", 0.02)
sun1 = Light("sun", "#fff6e0", 1.4)
road = Patch(9, 2, 2, 12, "sand")
lane = Patch(11, 13, 8, 2, "sand")
statue = Prop("statue", 12, 8, 1.8, "#cdd6e0")
bench = Prop("signpost", 9, 10)
tree1 = Prop("tree", 3, 8, 1.3)
ren = NPC("ren_elder", "Ren", 10, 4, "elder", "mournful", "#cfc2a8")
koto = NPC("koto_bard", "Koto", 5, 11, "bard", "cryptic", "#b8a0d8", "slim", "ribbon", "lute")
sora = NPC("sora_guard", "Sora", 15, 12, "guard", "wary", "#93a7bd")
shade1 = Monster("thread_shade", "shade", 17, 3, 9, "a spoken name", 1.6, "#4a4368")
case1 = Treasure("vow_case", 4, 4, ["torn letter", "silver pin"])
thread = Quest("find_ayaka", "Ren says Ayaka climbed past the statue: find her before the next floor does.")
bridge = Exit(19, 15, "Bridge of Thin Air")`;

/** The example program shown for each archetype — short enough for a 4B model to copy. */
export const SCENE_EXAMPLES: Record<Archetype, string> = {
  farm: FARM,
  delve: DELVE,
  quest: QUEST,
};
