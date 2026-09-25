// Design guidance per covenant archetype: the tone of the tower (ARCHETYPE_GUIDE) and the
// composition recipe that turns that tone into a floor plan (SCENE_RECIPE). This is prompt
// scaffolding — it shapes how the model fills a floor, it is never rendered and it never invents
// world data.

import type { Archetype } from "@shared/world";

export const ARCHETYPE_GUIDE: Record<Archetype, string> = {
  farm: "This tower is lived in, not conquered: every floor is a town that keeps working whether or not the player helps. People outnumber danger, quests are chores and favours, and treasure is produce and tools rather than relics.",
  delve:
    "This tower is a wound in the world and the player is going down into it, even when the stairs go up. Danger leads, the few people left are survivors, and anything worth carrying is behind a climb or a fight.",
  quest:
    "This tower is a story with a rope through it: someone is missing, and every floor is one knot closer to them. Each floor answers one question about that person and opens the next; its treasure is proof, not riches.",
};

/** How to lay the floor out — one composition recipe per archetype, read top to bottom. */
export const SCENE_RECIPE: Record<Archetype, string[]> = {
  farm: [
    'Floor 14-20 tiles across, tile "grass" or "wood"; biome meadow, onsen_town or snowfield.',
    "A village square at the centre, where the player wakes: a well, altar or statue Prop with two or three NPCs working around it.",
    'A Patch road ("sand" or "stone") 2 tiles wide from the square to the Exit, and two or three Patch fields to one side.',
    "Houses are Wall clusters: two or three Walls 2-3 tiles high meeting at a corner, opening onto the square.",
    "Three to five NPCs, each a different role with its own body, hat and held item; at most two nuisance Monsters, both far from the square.",
  ],
  delve: [
    'Floor 12-16 tiles across, tile "stone" or "void"; biome ruined_castle, abyss, cyber_workshop or lava_forge.',
    "Build upward: three to six Platforms form one climbable route, y rising about 1 → 2.5 → 4, each within 3 tiles of the one below so the jump lands.",
    'Hazards under the jumps are Patches of "lava" or "water"; torches and pillars instead of flowers.',
    "The Treasure stands on the highest Platform, reachable only by jumping; three or four Monsters of rising level wait along the route, met one at a time.",
    "At most two NPCs, strange survivors. Walls cut corridors, but nothing blocks the Exit.",
  ],
  quest: [
    "Floor 16-22 tiles across, wide and legible; biome meadow, sky_isle, ruined_castle or snowfield.",
    "One landmark the player can name: a statue, altar or well Prop at scale 1.5-2, two tiles off the centre.",
    'A Patch road ("stone") links three places: the landmark, the person who knows something, and the Exit.',
    "One elder or stranger says the missing-person thread out loud; one Quest names that person and the next step.",
    "Three to five NPCs in all, one or two Monsters guarding what they know, and an Exit at the far edge — half the floor away from the centre.",
  ],
};
