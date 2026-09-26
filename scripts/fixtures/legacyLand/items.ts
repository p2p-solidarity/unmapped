// The items the save carries (`inventory.items`, and `land.home.keepsakes` on the shelf at home).
// In phase 2 an item only ever enters a save as an errand's keepsake (`reportErrand` → `addItem`),
// so each one must be, field for field, the keepsake of that id in some chunk's `errands.oui`. It
// must also survive the Item dialect unchanged — `parseItem(serializeItem(item))` — which is what a
// `gift` event's validation asks of it (rev 6 phase 3, D5), so the gift flows can give it away.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseErrands, parseItem, serializeItem } from "@dsl/index";
import { canonicalJson } from "@shared/canonical";
import type { ItemSpec } from "@shared/world";

export interface CarriedItem {
  where: "inventory" | "home";
  /** The chunk whose errand handed it over, "cx,cz". */
  from: string;
  item: ItemSpec;
}

async function keepsakes(
  fixtureDir: string,
): Promise<Map<string, { from: string; item: ItemSpec }>> {
  const out = new Map<string, { from: string; item: ItemSpec }>();
  const chunks = join(fixtureDir, "save", "chunks");
  for (const dir of (await readdir(chunks)).sort()) {
    const source = await readFile(join(chunks, dir, "errands.oui"), "utf8").catch(() => null);
    if (source === null) continue;
    const read = parseErrands(source);
    if (!read.ok)
      throw new Error(`chunks/${dir}/errands.oui no longer parses: ${read.error.message}`);
    for (const item of read.value.keepsakes)
      out.set(item.id, { from: dir.replace("_", ","), item });
  }
  return out;
}

export async function carriedItems(
  fixtureDir: string,
  save: { inventory: { items: ItemSpec[] }; land: { home: { keepsakes: ItemSpec[] } } },
): Promise<CarriedItem[]> {
  const known = await keepsakes(fixtureDir);
  const carried = [
    ...save.inventory.items.map((item) => ({ where: "inventory" as const, item })),
    ...save.land.home.keepsakes.map((item) => ({ where: "home" as const, item })),
  ];
  return carried.map(({ where, item }) => {
    const source = known.get(item.id);
    if (source === undefined || canonicalJson(source.item) !== canonicalJson(item)) {
      throw new Error(
        `land.json: ${where} item ${item.id} is not a keepsake of any chunk's errands.`,
      );
    }
    const back = parseItem(serializeItem(item));
    if (!back.ok || canonicalJson(back.value) !== canonicalJson(item)) {
      throw new Error(`land.json: ${where} item ${item.id} does not survive the Item dialect.`);
    }
    return { where, from: source.from, item };
  });
}
