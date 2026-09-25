// WitnessedErrands → an Errands program; `parseErrands(serializeErrands(e))` deep-equals `e`.

import type { WitnessedErrands } from "@shared/land";

const str = (value: string): string => JSON.stringify(value);
const list = (values: readonly string[]): string => `[${values.map(str).join(", ")}]`;

export function serializeErrands({ errands, keepsakes }: WitnessedErrands): string {
  const names = [...errands.map((_e, i) => `e${i + 1}`), ...keepsakes.map((_k, i) => `k${i + 1}`)];
  const lines = [`root = Errands([${names.join(", ")}])`];
  errands.forEach((errand, index) => {
    const head = `e${index + 1} = `;
    if (errand.kind === "find") {
      const tile = errand.tile ?? { x: 0, z: 0 };
      lines.push(
        `${head}Find(${str(errand.id)}, ${str(errand.giver)}, ${str(errand.ask)}, ${tile.x}, ${tile.z}, ${str(errand.reward)}, ${str(errand.thanks)})`,
      );
    } else {
      const name = errand.kind === "deliver" ? "Deliver" : "Guide";
      lines.push(
        `${head}${name}(${str(errand.id)}, ${str(errand.giver)}, ${str(errand.ask)}, ${str(errand.place ?? "")}, ${str(errand.reward)}, ${str(errand.thanks)})`,
      );
    }
  });
  keepsakes.forEach((item, index) => {
    lines.push(
      `k${index + 1} = Item(${str(item.id)}, ${str(item.name)}, ${str(item.kind)}, ${item.power}, ${str(item.perk)}, ${item.curse === null ? "null" : str(item.curse)}, ${list(item.meshDna)}, ${list(item.archetype)}, ${str(item.flavor)})`,
    );
  });
  return `${lines.join("\n")}\n`;
}
