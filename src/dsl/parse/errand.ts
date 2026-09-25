// Errand statements → ErrandSpec + keepsake ItemSpec. Used twice: inside a Chunk program while it
// is being witnessed (with the land to check places and residents against), and to read a stored
// `errands.oui` back (which was checked when it was written).

import type { ElementNode, OpenUIError } from "@openuidev/lang-core";
import { CHUNK_SIZE, type ChunkCoord, type ChunkHole, chunkDistance } from "@shared/chunks";
import type { ErrandSpec, WitnessedErrands } from "@shared/land";
import type { LoreNode } from "@shared/lore";
import { ok, type Result } from "@shared/result";
import type { ItemSpec } from "@shared/world";
import { errandsLibrary } from "../libraries";
import { clampInt, clampText, LIMITS } from "../limits";
import { ERRAND_PROPS } from "../schemas/errand";
import type { DslError } from "../types";
import { slugId } from "./ids";
import { toItem } from "./item";
import {
  type ChildNode,
  childrenOf,
  createDialect,
  dslError,
  failWith,
  parseRoot,
  propError,
  readProps,
} from "./program";

const dialect = createDialect(errandsLibrary);
const KEEPSAKE_KINDS: readonly string[] = ["charm", "tool", "consumable"];

export interface ErrandLand {
  coord: ChunkCoord;
  hole: ChunkHole | null;
  lore: readonly LoreNode[];
  /** NPC ids that may ask. */
  speakers: readonly string[];
}

const asElement = (child: ChildNode): ElementNode => ({ props: child.props }) as ElementNode;

/** A known place on another chunk, by exact id or by bare slug (nearest wins). */
function knownPlace(land: ErrandLand, raw: string): string | null {
  const places = land.lore.filter(
    (node) => node.kind === "place" && chunkDistance(node.coord, land.coord) > 0,
  );
  const exact = places.find((node) => node.id === raw.trim());
  if (exact !== undefined) return exact.id;
  const slug = slugId(raw.split("@")[0] ?? "", "");
  const named = places
    .filter((node) => slug !== "" && node.id.startsWith(`${slug}@`))
    .sort((a, b) => chunkDistance(a.coord, land.coord) - chunkDistance(b.coord, land.coord));
  return named[0]?.id ?? null;
}

/** Reads every errand and keepsake among `children`; `land` null skips the cross-checks. */
export function readErrands(
  children: readonly ChildNode[],
  land: ErrandLand | null,
  issues: OpenUIError[],
): WitnessedErrands {
  const errands: ErrandSpec[] = [];
  const keepsakes: ItemSpec[] = [];
  for (const child of children) {
    if (child.typeName === "Item") {
      const item = toItem(asElement(child));
      if (!item.ok) {
        issues.push(
          propError("Item", item.error.message, item.error.hint ?? "", child.statementId),
        );
      } else if (!KEEPSAKE_KINDS.includes(item.value.kind)) {
        issues.push(
          propError(
            "Item",
            `Keepsake ${item.value.id} is a ${item.value.kind}.`,
            `A keepsake is an everyday thing: kind ${KEEPSAKE_KINDS.join(", ")}.`,
            child.statementId,
          ),
        );
      } else
        keepsakes.push({ ...item.value, power: clampInt(item.value.power, { min: 0, max: 10 }) });
      continue;
    }
    if (child.typeName !== "Find" && child.typeName !== "Deliver" && child.typeName !== "Guide") {
      continue;
    }
    const find = child.typeName === "Find" ? readProps(ERRAND_PROPS.Find, child, issues) : null;
    const toPlace =
      child.typeName === "Find" ? null : readProps(ERRAND_PROPS[child.typeName], child, issues);
    const p = find ?? toPlace;
    if (p === null) continue;
    const base = {
      id: slugId(p.id, "errand"),
      giver: slugId(p.giver, ""),
      ask: clampText(p.ask, LIMITS.text.line),
      thanks: clampText(p.thanks, LIMITS.text.line),
      reward: slugId(p.reward, ""),
    };
    if (find !== null) {
      const tile = {
        x: clampInt(find.x, { min: 0, max: CHUNK_SIZE - 1 }),
        z: clampInt(find.z, { min: 0, max: CHUNK_SIZE - 1 }),
      };
      if (land?.hole && tile.x < land.hole.width && tile.z < land.hole.depth) {
        issues.push(
          propError(
            "Find",
            `${base.id} hides its thing inside the authored village.`,
            "Pick a tile outside it.",
            child.statementId,
          ),
        );
      }
      errands.push({ ...base, kind: "find", tile, place: null });
      continue;
    }
    if (toPlace === null) continue;
    const place = land === null ? toPlace.place.trim() : knownPlace(land, toPlace.place);
    if (place === null) {
      const known =
        land?.lore.filter((n) => n.kind === "place" && chunkDistance(n.coord, land.coord) > 0) ??
        [];
      issues.push(
        propError(
          child.typeName,
          `${base.id} names "${toPlace.place}", which is not a known place on another chunk.`,
          known.length === 0
            ? "No other place is known yet: write a Find errand instead."
            : `Use one of: ${known
                .slice(0, 6)
                .map((n) => n.id)
                .join(", ")}.`,
          child.statementId,
        ),
      );
      continue;
    }
    errands.push({
      ...base,
      kind: child.typeName === "Deliver" ? "deliver" : "guide",
      tile: null,
      place,
    });
  }
  if (land !== null) {
    for (const errand of errands) {
      if (!land.speakers.includes(errand.giver)) {
        issues.push(
          propError(
            "Errand",
            `${errand.id} is asked by ${errand.giver || "nobody"}, who is not a resident here.`,
            "Use the id of an NPC who lives here.",
          ),
        );
      }
      if (!keepsakes.some((item) => item.id === errand.reward)) {
        issues.push(
          propError(
            "Errand",
            `${errand.id} rewards "${errand.reward}", which is not an Item here.`,
            "Write the keepsake as an Item and use its id.",
          ),
        );
      }
    }
    for (const item of keepsakes) {
      if (!errands.some((errand) => errand.reward === item.id)) {
        issues.push(
          propError(
            "Item",
            `Keepsake ${item.id} is not the reward of any errand.`,
            "Remove it, or make it an errand's reward.",
          ),
        );
      }
    }
    const ids = errands.map((errand) => errand.id);
    if (new Set(ids).size !== ids.length) {
      issues.push(propError("Errand", "Two errands share an id.", "Give every errand its own id."));
    }
  }
  return { errands, keepsakes };
}

/** Read a stored `errands.oui`. */
export function parseErrands(source: string): Result<WitnessedErrands, DslError> {
  const root = parseRoot(dialect, source);
  if (!root.ok) return root;
  const issues: OpenUIError[] = [];
  const read = readErrands(childrenOf(root.value), null, issues);
  if (issues.length > 0) {
    return failWith(
      dslError({
        code: "dsl-invalid-errands",
        message: `${issues.length} problem(s) with this Errands program.`,
        hint: "Restore this chunk's errands.oui from a backup.",
        errors: issues,
      }),
    );
  }
  return ok(read);
}
