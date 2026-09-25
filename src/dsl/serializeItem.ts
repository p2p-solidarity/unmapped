// ItemSpec → an Item program. A gift carries another player's item in the shared history (rev 6
// phase 3, D5): `validateEventBody` sends it through `parseItem(serializeItem(item))`, clamps and
// all, and keeps it only when it comes back unchanged — so a gifted item is always one the Item
// dialect could have produced. `parseItem(serializeItem(i))` deep-equals `i` for every `i` that
// `parseItem` returned.

import type { ItemSpec } from "@shared/world";

const str = (value: string): string => JSON.stringify(value);
const list = (values: readonly string[]): string => `[${values.map(str).join(", ")}]`;

export function serializeItem(item: ItemSpec): string {
  const curse = item.curse === null ? "null" : str(item.curse);
  return `root = Item(${str(item.id)}, ${str(item.name)}, ${str(item.kind)}, ${String(item.power)}, ${str(item.perk)}, ${curse}, ${list(item.meshDna)}, ${list(item.archetype)}, ${str(item.flavor)})\n`;
}
