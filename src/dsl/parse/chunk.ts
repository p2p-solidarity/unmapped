// Chunk program → a witnessed chunk: a Scene (in the chunk's local tiles, on a synthetic 32×32
// floor), one Dialogue per resident and the Lore it adds. Structural checks that a repair round can
// fix live here; the prose checks live in ../hygiene.ts.

import type { ElementNode, OpenUIError } from "@openuidev/lang-core";
import { CHUNK_SIZE, type ChunkCoord, type ChunkHole, chunkDistance } from "@shared/chunks";
import type { WitnessedErrands } from "@shared/land";
import { type LoreNode, loreId } from "@shared/lore";
import { ok, type Result } from "@shared/result";
import type {
  Biome,
  DialogueGraph,
  NpcSpec,
  PropSpec,
  SceneGraph,
  Tile,
  WallSpec,
} from "@shared/world";
import { hygieneIssues } from "../hygiene";
import { chunkLibrary } from "../libraries";
import { clampFloat, clampText, LIMITS, truncate } from "../limits";
import { CHUNK_PROPS } from "../schemas/chunk";
import type { DslError } from "../types";
import { readChoices } from "./dialogue";
import { readErrands } from "./errand";
import { slugId } from "./ids";
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
import { readNpc } from "./sceneEntities";
import { createSceneScope } from "./sceneScope";
import { readProp, readWall } from "./sceneTerrain";

const dialect = createDialect(chunkLibrary);
/** Choices are element nodes; they are read by `readChoices`, not by the Talk schema. */
const TALK_HEAD = CHUNK_PROPS.Talk.pick({ npcId: true, line: true });

export const CHUNK_LIMITS = { minNpcs: 1, maxNpcs: 4, maxProps: 24, maxWalls: 8, maxLore: 6 };
/** Talk answers a witnessed resident can offer: nothing that needs a model or an altar later. */
export const WITNESS_ACTIONS = ["talk", "trade", "leave"] as const;

export interface ChunkContext {
  coord: ChunkCoord;
  biome: Biome;
  /** The land's base ground; the stored Scene stands on a CHUNK_SIZE floor of it. */
  ground: Tile;
  /** Tiles already taken by the authored scene (origin chunk only). */
  hole: ChunkHole | null;
  /** The lore graph as it stands before this chunk. */
  lore: readonly LoreNode[];
  language: string;
  /**
   * Origin chunk only: residents of the authored scene. They are not declared again, but each
   * gets one Talk, so nobody in the world ever needs a model at the moment they are spoken to.
   */
  authored?: readonly NpcSpec[];
}

export interface WitnessedDraft extends WitnessedErrands {
  scene: SceneGraph;
  dialogues: DialogueGraph[];
  lore: LoreNode[];
}

const ERRAND_PARTS = new Set(["Find", "Deliver", "Guide", "Item"]);

const issue = (component: string, message: string, hint: string, id?: string): OpenUIError =>
  propError(component, message, hint, id);

const asElement = (child: ChildNode): ElementNode => ({ props: child.props }) as ElementNode;

function inHole(hole: ChunkHole | null, x: number, z: number): boolean {
  return hole !== null && x < hole.width && z < hole.depth;
}

function readLore(child: ChildNode, issues: OpenUIError[]) {
  const p = readProps(CHUNK_PROPS.Lore, child, issues);
  if (p === null) return null;
  return {
    slug: slugId(p.id, ""),
    kind: p.kind,
    label: clampText(p.label, LIMITS.text.name),
    text: clampText(p.text, LIMITS.text.line),
    links: p.links.map((link) => link.trim()).filter((link) => link.length > 0),
    tone: clampFloat(p.tone, { min: -1, max: 1 }),
    statementId: child.statementId,
  };
}

/** Walk a parsed `Chunk` root; every problem a repair round could fix becomes an issue. */
export function toWitnessedChunk(
  root: ElementNode,
  ctx: ChunkContext,
): Result<WitnessedDraft, DslError> {
  const issues: OpenUIError[] = [];
  const head = CHUNK_PROPS.Chunk.pick({ name: true }).safeParse(root.props);
  const name = head.success ? clampText(head.data.name, LIMITS.text.name) : "";
  if (name === "") {
    issues.push(
      issue("Chunk", "The place has no name.", 'Write root = Chunk("<place name>", [...]).'),
    );
  }
  const floor = { width: CHUNK_SIZE, depth: CHUNK_SIZE, tile: ctx.ground };
  const scope = createSceneScope(floor, issues);
  const props: PropSpec[] = [];
  const walls: WallSpec[] = [];
  const npcs: NpcSpec[] = [];
  const talks: { npcId: string; line: string; node: ChildNode }[] = [];
  const lore: NonNullable<ReturnType<typeof readLore>>[] = [];
  const children = childrenOf(root);

  for (const child of children) {
    if (child.typeName === "Prop") {
      const prop = readProp(child, scope);
      if (prop !== null) props.push({ ...prop, dynamic: false });
    } else if (child.typeName === "Wall") {
      const wall = readWall(child, scope);
      if (wall !== null) walls.push(wall);
    } else if (child.typeName === "NPC") {
      const npc = readNpc(child, scope);
      if (npc !== null) npcs.push(npc);
    } else if (child.typeName === "Talk") {
      const p = readProps(TALK_HEAD, child, issues);
      if (p !== null) talks.push({ npcId: slugId(p.npcId, ""), line: p.line, node: child });
    } else if (child.typeName === "Lore") {
      const node = readLore(child, issues);
      if (node !== null) lore.push(node);
    }
  }

  const where = [...props, ...walls, ...npcs].filter((thing) => inHole(ctx.hole, thing.x, thing.z));
  if (where.length > 0 && ctx.hole !== null) {
    issues.push(
      issue(
        "Chunk",
        `${where.length} statement(s) stand inside the authored village (x < ${ctx.hole.width} and z < ${ctx.hole.depth}).`,
        "Move every Prop, Wall and NPC outside that rectangle.",
      ),
    );
  }
  const authored = ctx.authored ?? [];
  const clash = npcs.filter((npc) => authored.some((one) => one.id === npc.id));
  if (clash.length > 0) {
    issues.push(
      issue(
        "NPC",
        `${clash.map((npc) => npc.id).join(", ")} already live in the authored village.`,
        "Do not declare them again; give them a Talk only, and new residents new ids.",
      ),
    );
  }
  const speakers = [...npcs, ...authored];
  if (speakers.length < CHUNK_LIMITS.minNpcs || npcs.length > CHUNK_LIMITS.maxNpcs) {
    issues.push(
      issue(
        "NPC",
        `The place has ${npcs.length} residents.`,
        `Write ${CHUNK_LIMITS.minNpcs} to ${CHUNK_LIMITS.maxNpcs} NPC statements.`,
      ),
    );
  }

  const dialogues: DialogueGraph[] = [];
  for (const npc of speakers) {
    const own = talks.filter((talk) => talk.npcId === npc.id);
    if (own.length !== 1) {
      issues.push(
        issue(
          "Talk",
          `NPC ${npc.id} has ${own.length} Talk statements.`,
          `Write exactly one Talk("${npc.id}", "<line>", [...]) for every NPC.`,
        ),
      );
      continue;
    }
    const talk = own[0];
    if (talk === undefined) continue;
    const choices = readChoices(asElement(talk.node), issues);
    const banned = choices.filter(
      (choice) => !(WITNESS_ACTIONS as readonly string[]).includes(choice.action),
    );
    if (choices.length === 0 || banned.length > 0) {
      issues.push(
        issue(
          "Choice",
          `Talk for ${npc.id} needs 1 to ${LIMITS.maxChoices} answers using only ${WITNESS_ACTIONS.join(", ")}.`,
          "Rewrite its Choice statements with those actions.",
          talk.node.statementId,
        ),
      );
      continue;
    }
    dialogues.push({
      npcId: npc.id,
      line: clampText(talk.line, LIMITS.text.line),
      choices,
      mutation: null,
    });
  }
  const orphanTalks = talks.filter((talk) => !speakers.some((npc) => npc.id === talk.npcId));
  for (const talk of orphanTalks) {
    issues.push(
      issue(
        "Talk",
        `Talk names ${talk.npcId || "(no id)"}, which is not an NPC here.`,
        "Use the id of an NPC in this program.",
        talk.node.statementId,
      ),
    );
  }

  const nodes = resolveLore(lore, ctx, name, issues);
  const origin = ctx.coord.cx === 0 && ctx.coord.cz === 0;
  const { errands, keepsakes } = readErrands(
    children.filter((child) => ERRAND_PARTS.has(child.typeName)),
    { coord: ctx.coord, hole: ctx.hole, lore: ctx.lore, speakers: speakers.map((npc) => npc.id) },
    issues,
  );
  if (errands.length > 1 || (!origin && errands.length === 0)) {
    issues.push(
      issue(
        "Errand",
        `The place has ${errands.length} errands.`,
        "Give exactly one resident one small errand (Find, Deliver or Guide) with an Item keepsake.",
      ),
    );
  }
  if (issues.length === 0)
    issues.push(...hygieneIssues({ name, npcs, dialogues, lore: nodes }, ctx));
  if (issues.length > 0) {
    return failWith(
      dslError({
        code: "dsl-invalid-chunk",
        message: `${issues.length} problem(s) with this Chunk program.`,
        hint: "Resend the whole Chunk program with every listed problem fixed.",
        errors: issues,
      }),
    );
  }
  return ok({
    scene: {
      name,
      biome: ctx.biome,
      contract: null,
      floor,
      patches: [],
      platforms: [],
      walls: truncate(walls, CHUNK_LIMITS.maxWalls),
      props: truncate(props, CHUNK_LIMITS.maxProps),
      npcs,
      monsters: [],
      treasures: [],
      exits: [],
      lights: [],
      sky: null,
      triggers: [],
      quests: [],
    },
    dialogues,
    lore: nodes,
    errands,
    keepsakes,
  });
}

function resolveLore(
  drafts: NonNullable<ReturnType<typeof readLore>>[],
  ctx: ChunkContext,
  name: string,
  issues: OpenUIError[],
): LoreNode[] {
  const existing = new Set(ctx.lore.map((node) => node.id));
  const local = new Map<string, string>();
  for (const draft of truncate(drafts, CHUNK_LIMITS.maxLore)) {
    const id = loreId(draft.slug, ctx.coord);
    if (draft.slug === "" || local.has(draft.slug) || existing.has(id)) {
      issues.push(
        issue(
          "Lore",
          `Lore id "${draft.slug}" is empty, repeated or already taken here.`,
          "Give every Lore its own new ascii snake_case id.",
          draft.statementId,
        ),
      );
    }
    local.set(draft.slug, id);
  }
  const nodes: LoreNode[] = [];
  for (const draft of truncate(drafts, CHUNK_LIMITS.maxLore)) {
    const links: string[] = [];
    for (const link of draft.links) {
      const resolved = existing.has(link)
        ? link
        : (local.get(slugId(link, "")) ?? nearestBySlug(ctx, slugId(link.split("@")[0] ?? "", "")));
      if (resolved === undefined) {
        issues.push(
          issue(
            "Lore",
            `Lore ${draft.slug} links to "${link}", which is neither known lore nor Lore in this program.`,
            "Link only to ids from the lore list you were given, or to Lore ids you wrote here.",
            draft.statementId,
          ),
        );
      } else if (!links.includes(resolved)) links.push(resolved);
    }
    nodes.push({
      id: loreId(draft.slug, ctx.coord),
      kind: draft.kind,
      label: draft.label,
      text: draft.text,
      coord: ctx.coord,
      links,
      tone: draft.tone,
    });
  }
  if (!nodes.some((node) => node.kind === "place")) {
    issues.push(
      issue("Lore", "No Lore describes this place.", `Add Lore(<id>, "place", "${name}", ...).`),
    );
  }
  const customs = nodes.filter((node) => node.kind === "custom");
  if (customs.length === 0) {
    issues.push(
      issue(
        "Lore",
        "No Lore records a local custom.",
        'Add Lore(<id>, "custom", ...) — a rule the people here keep.',
      ),
    );
  }
  // Culture drifts across the map instead of jumping: a custom next to a known custom grows out of
  // it (a variation, or a quarrel with it) and says so with a link.
  const nearby = ctx.lore.filter(
    (node) => node.kind === "custom" && chunkDistance(node.coord, ctx.coord) === 1,
  );
  const rooted = customs.some((custom) =>
    custom.links.some((link) => nearby.some((n) => n.id === link)),
  );
  if (customs.length > 0 && nearby.length > 0 && !rooted) {
    issues.push(
      issue(
        "Lore",
        "This place's custom does not link to any neighbouring custom.",
        `Make the custom a variation of (or a disagreement with) one of: ${nearby.map((n) => `${n.id} "${n.label}"`).join(", ")} — and put that id in its links.`,
      ),
    );
  }
  return nodes;
}

/**
 * A link written as a bare slug ("well_rule") means the known node of that slug; when several
 * places share it, the nearest one is meant.
 */
function nearestBySlug(ctx: ChunkContext, slug: string): string | undefined {
  if (slug === "") return undefined;
  return ctx.lore
    .filter((node) => node.id.startsWith(`${slug}@`))
    .sort((a, b) => chunkDistance(a.coord, ctx.coord) - chunkDistance(b.coord, ctx.coord))[0]?.id;
}

/** Parse and check one Chunk program against the land it is being written onto. */
export function parseChunk(source: string, ctx: ChunkContext): Result<WitnessedDraft, DslError> {
  const root = parseRoot(dialect, source);
  return root.ok ? toWitnessedChunk(root.value, ctx) : root;
}
