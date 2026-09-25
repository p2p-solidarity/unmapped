// Item program → ItemSpec. The mesh DNA is filtered against the engine's part vocabulary, so a
// hallucinated "blade_of_infinite_sorrow" never reaches the mesh assembler.

import type { ElementNode } from "@openuidev/lang-core";
import { ok, type Result } from "@shared/result";
import type { ItemSpec } from "@shared/world";
import { itemLibrary } from "../libraries";
import { clampInt, clampText, LIMITS, truncate } from "../limits";
import { isMeshPart, MESH_DNA_PARTS } from "../prompts/meshDna";
import { ITEM_PROPS } from "../schemas/item";
import type { DslError } from "../types";
import { slugId } from "./ids";
import { createDialect, dslError, failWith, parseRoot } from "./program";

const dialect = createDialect(itemLibrary);

const asciiWord = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/** Walk a parsed `Item` root into the inventory's ItemSpec. */
export function toItem(root: ElementNode): Result<ItemSpec, DslError> {
  const parsed = ITEM_PROPS.Item.safeParse(root.props);
  if (!parsed.success) {
    return failWith(
      dslError({
        code: "dsl-invalid-props",
        message: `Item(...) has invalid arguments — ${parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("; ")}`,
        hint: 'Write root = Item("<id>", "<name>", "<kind>", <power>, "<perk>", <curse or null>, [mesh parts], [archetype], "<flavor>").',
      }),
    );
  }
  const p = parsed.data;
  const meshDna = truncate(
    p.meshDna
      .map(asciiWord)
      .filter((part, index, all) => isMeshPart(part) && all.indexOf(part) === index),
    LIMITS.maxMeshDna,
  );
  if (meshDna.length === 0) {
    return failWith(
      dslError({
        code: "dsl-invalid-mesh-dna",
        message: "None of the meshDna parts exist in the engine's vocabulary.",
        hint: `meshDna must list 2 to ${LIMITS.maxMeshDna} of: ${MESH_DNA_PARTS.join(", ")}.`,
      }),
    );
  }
  const curse =
    p.curse === null || p.curse === undefined ? null : clampText(p.curse, LIMITS.text.curse);
  return ok({
    id: slugId(p.id, "item"),
    name: clampText(p.name, LIMITS.text.name),
    kind: p.kind,
    power: clampInt(p.power, LIMITS.power),
    perk: clampText(p.perk, LIMITS.text.perk),
    curse: curse === "" ? null : curse,
    meshDna,
    archetype: truncate(
      p.archetype
        .map((word) => clampText(asciiWord(word), LIMITS.text.archetype))
        .filter((word, index, all) => word !== "" && all.indexOf(word) === index),
      LIMITS.maxArchetype,
    ),
    flavor: clampText(p.flavor, LIMITS.text.flavor),
  });
}

/** Parse one `Item` program. */
export function parseItem(source: string): Result<ItemSpec, DslError> {
  const root = parseRoot(dialect, source);
  return root.ok ? toItem(root.value) : root;
}
