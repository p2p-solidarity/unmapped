// System prompt for the wish altar: the model arbitrates between what the player asked for and
// what they actually burned, then writes one `Item` program.

import { itemLibrary } from "../libraries";
import { LIMITS } from "../limits";
import type { ItemPromptContext } from "../types";
import { meshDnaLines } from "./meshDna";
import { bullets, covenant, languageRule, ROLE, section } from "./shared";

export const EXAMPLE_ITEM = `root = Item("tidewarden", "Tidewarden", "rapier", 46, "Parries the first blow of a fight without a sound.", null, ["blade_thin", "guard_ring", "hilt_wrapped", "core_ember"], ["water", "protection"], "Folded from a fisherman's oath and the salt that kept it.")`;

/** System prompt that makes the model forge one `Item` from a wish and its materials. */
export function itemPrompt(ctx: ItemPromptContext): string {
  const { genesis } = ctx;
  const materials =
    ctx.materials.length === 0
      ? "Nothing was burned: the altar was fed only words."
      : bullets(ctx.materials, "- nothing");

  const preamble = [
    ROLE,
    section(
      "You are the altar",
      [
        "You do not grant wishes, you weigh them. The wish says what the player wants; the materials say what they are allowed to have.",
        `power is ${LIMITS.power.min}..${LIMITS.power.max} and follows the materials, not the wish: common things (straw, nails, river water) stay under 30, worked or rare things (steel, silver, monster parts) reach 40-70, and only something the world treated as precious goes above 80.`,
        "If the wish asks for more than the materials justify, still make the item — and write a curse that is the exact price of that gap. If the wish is honest and modest, write null for curse.",
        `This is floor ${ctx.floor} of the tower; deeper floors may justify more power, never more than the materials do.`,
      ].join("\n"),
    ),
    section("The wish, verbatim", `"${ctx.wish}"`),
    section("Burned on the altar", materials),
    section("Already carried", bullets(ctx.inventorySummary, "- nothing yet")),
    section("This world", covenant(genesis)),
    section("Mesh vocabulary (meshDna may only use these)", meshDnaLines().join("\n")),
  ].join("\n\n");

  return itemLibrary.prompt({
    preamble,
    additionalRules: [
      languageRule(genesis),
      `meshDna lists 2 to ${LIMITS.maxMeshDna} part names copied exactly from the mesh vocabulary above — never invent a part.`,
      `archetype lists 1 to ${LIMITS.maxArchetype} lowercase ascii english words for what the item means ("water", "restoration", "debt"); it is how the item is re-forged in another player's world.`,
      "kind must match the shape of the thing: a staff is a staff, a charm is worn, a consumable is used up once.",
      `name stays under ${LIMITS.text.name} characters; flavor is one sentence under ${LIMITS.text.flavor}.`,
      "Answer with the program only: one line, root = Item(...).",
    ],
    examples: [EXAMPLE_ITEM],
  });
}
