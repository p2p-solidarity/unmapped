// Turns the player's history into the short string lists the DSL prompts take. Deliberately
// lossy: the model gets the shape of what happened, not a transcript, so the context stays small.

import type { Inventory, KarmaEntry } from "@shared/world";

/** How much history the model sees. Older karma still lives in karma.jsonl. */
export const KARMA_WINDOW = 12;

export function karmaSummary(karma: KarmaEntry[], limit: number = KARMA_WINDOW): string[] {
  return karma.slice(-limit).map(oneLine);
}

function oneLine(entry: KarmaEntry): string {
  const who = entry.npcId === null ? "" : ` with ${entry.npcId}`;
  const effect = entry.effect.trim();
  const head = `floor ${entry.floor} · ${entry.action}${who}: ${entry.choice.trim()}`;
  return effect.length > 0 ? `${head} → ${effect}` : head;
}

export function inventorySummary(inventory: Inventory): string[] {
  const lines = inventory.items.map(itemLine);
  for (const [name, count] of countMaterials(inventory.materials)) {
    lines.push(count > 1 ? `material: ${name} x${count}` : `material: ${name}`);
  }
  return lines;
}

function itemLine(item: {
  name: string;
  kind: string;
  power: number;
  curse: string | null;
}): string {
  const cursed = item.curse === null ? "" : `, cursed: ${item.curse}`;
  return `${item.name} (${item.kind}, power ${item.power}${cursed})`;
}

function countMaterials(materials: string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const material of materials) counts.set(material, (counts.get(material) ?? 0) + 1);
  return [...counts.entries()];
}
