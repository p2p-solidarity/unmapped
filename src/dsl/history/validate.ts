// The DSL checks on stored programs (rev 6 phase 3, D5 step 4). Two callers:
//
// - `validateWitness` — the legacy land's rule for one witnessed chunk against the lore graph it
//   joins (`main/instances/land.ts` writes and `backupLand.ts` replays with it). Moved here from
//   `land.ts` unchanged in behaviour.
// - `validateEventBody` — the part of a history event the fold cannot check without the DSL: every
//   stored program parses, each resident has exactly its own words, a witness's `index` equals
//   what its programs say, a gifted item round-trips through the Item dialect, and a rumor's text
//   is in the one form the Rumors dialect writes. Main and the service run it in every verdict
//   (./verdict); lore links, errand places and every other rule that needs the history are
//   `admit`'s (@shared/history/admit).
//
// Pure and deterministic: no clock, no IO, and nothing here depends on the host's locale.

import { canonicalJson } from "@shared/canonical";
import type {
  ChapterBody,
  EventBodies,
  EventKind,
  GiftBody,
  PlaceBody,
  RumorBody,
  WitnessBody,
  WitnessIndex,
} from "@shared/history/types";
import type { WitnessChunkInput, WitnessedChunk, WitnessedErrands } from "@shared/land";
import type { LoreNode } from "@shared/lore";
import { err, ok, type Result } from "@shared/result";
import type { SceneGraph } from "@shared/world";
import { parseChapter } from "../parse/chapter";
import { parseDialogue } from "../parse/dialogue";
import { parseErrands } from "../parse/errand";
import { parseItem } from "../parse/item";
import { parseRumors, serializeRumors } from "../parse/rumor";
import { parseScene } from "../parse/scene";
import { serializeItem } from "../serializeItem";

const AGAIN = "Witness the chunk again.";

/** The programs a witnessed chunk is made of (a legacy chunk or a `witness` body). */
export type WitnessPrograms = Pick<WitnessedChunk, "cx" | "cz" | "scene" | "dialogues" | "errands">;

interface Residents {
  scene: SceneGraph;
  npcIds: string[];
  keys: string[];
  /** The origin chunk may also carry the words of the authored village's residents. */
  origin: boolean;
}

/** The chunk's Scene parses and every resident has exactly its own parsing dialogue. */
function readResidents(input: WitnessPrograms): Result<Residents> {
  const scene = parseScene(input.scene);
  if (!scene.ok) return err("witness-scene-invalid", scene.error.message, AGAIN);
  // The origin chunk may also carry the words of the authored village's residents, who live in
  // the cartridge scene rather than in this chunk's own Scene program.
  const origin = input.cx === 0 && input.cz === 0;
  const npcIds = scene.value.npcs.map((npc) => npc.id);
  const keys = Object.keys(input.dialogues);
  const missing = npcIds.some((id) => !keys.includes(id));
  const extra = keys.some((key) => !npcIds.includes(key));
  if (missing || (extra && !origin)) {
    return err(
      "witness-dialogue-mismatch",
      "Every resident needs exactly its own dialogue.",
      AGAIN,
    );
  }
  for (const [npcId, source] of Object.entries(input.dialogues)) {
    const dialogue = parseDialogue(source);
    if (!dialogue.ok || dialogue.value.npcId !== npcId) {
      return err(
        "witness-dialogue-invalid",
        `The dialogue for ${npcId} does not parse as its own.`,
        AGAIN,
      );
    }
  }
  return ok({ scene: scene.value, npcIds, keys, origin });
}

/** The chunk's errands parse; each is asked by someone here, placed, and rewards a keepsake. */
function readChunkErrands(
  input: WitnessPrograms,
  residents: Residents,
  placed: (place: string) => boolean,
): Result<WitnessedErrands | null> {
  if (input.errands === undefined) return ok(null);
  const errands = parseErrands(input.errands);
  if (!errands.ok) return err("witness-errands-invalid", errands.error.message, AGAIN);
  const { npcIds, keys, origin } = residents;
  for (const errand of errands.value.errands) {
    const asker = npcIds.includes(errand.giver) || (origin && keys.includes(errand.giver));
    const where = errand.place === null || placed(errand.place);
    const rewarded = errands.value.keepsakes.some((item) => item.id === errand.reward);
    if (!asker || !where || !rewarded) {
      return err(
        "witness-errands-invalid",
        `Errand ${errand.id} names someone, somewhere or a keepsake that does not exist.`,
        AGAIN,
      );
    }
  }
  return ok(errands.value);
}

/** Every rule a stored chunk obeys, checked against the graph it is joining. */
export function validateWitness(
  input: WitnessChunkInput,
  graph: readonly LoreNode[],
): Result<void> {
  const residents = readResidents(input);
  if (!residents.ok) return residents;
  const known = new Set(graph.map((node) => node.id));
  for (const node of input.lore) {
    if (node.coord.cx !== input.cx || node.coord.cz !== input.cz || known.has(node.id)) {
      return err("witness-lore-invalid", `Lore ${node.id} is misplaced or already exists.`, AGAIN);
    }
    known.add(node.id);
  }
  const errands = readChunkErrands(input, residents.value, (place) => known.has(place));
  if (!errands.ok) return errands;
  for (const node of input.lore) {
    const dangling = node.links.find((link) => !known.has(link));
    if (dangling !== undefined) {
      return err("witness-lore-invalid", `Lore ${node.id} links to unknown ${dangling}.`, AGAIN);
    }
  }
  return ok(undefined);
}

function indexOf(scene: SceneGraph, errands: WitnessedErrands | null): WitnessIndex {
  return {
    name: scene.name,
    npcs: scene.npcs.map((npc) => ({ id: npc.id, name: npc.name, role: npc.role })),
    errands: (errands?.errands ?? []).map((errand) => ({
      id: errand.id,
      giver: errand.giver,
      place: errand.place,
      reward: errand.reward,
    })),
    keepsakes: (errands?.keepsakes ?? []).map((item) => ({ id: item.id, name: item.name })),
  };
}

/**
 * What a witness's `index` must be (D3): the Scene's name and residents, the errands' givers,
 * places and rewards, and the keepsakes' names, in program order. The writer builds its body with
 * this; `validateEventBody` requires the stored index to equal it. Errand places are not checked
 * against lore here (that is `admit`'s).
 */
export function witnessIndexOf(programs: WitnessPrograms): Result<WitnessIndex> {
  const residents = readResidents(programs);
  if (!residents.ok) return residents;
  const errands = readChunkErrands(programs, residents.value, () => true);
  return errands.ok ? ok(indexOf(residents.value.scene, errands.value)) : errands;
}

function validateWitnessBody(body: WitnessBody): Result<void> {
  const own = new Set<string>();
  for (const node of body.lore) {
    const onChunk =
      node.coord.cx === body.cx &&
      node.coord.cz === body.cz &&
      node.id.endsWith(`@${body.cx},${body.cz}`);
    if (!onChunk || own.has(node.id)) {
      return err("witness-lore-invalid", `Lore ${node.id} is misplaced or written twice.`, AGAIN);
    }
    own.add(node.id);
  }
  const index = witnessIndexOf(body);
  if (!index.ok) return index;
  if (canonicalJson(index.value) !== canonicalJson(body.index)) {
    return err(
      "witness-index-mismatch",
      "The witness's index does not say what its programs say.",
      "Build the index from the programs (witnessIndexOf).",
    );
  }
  return ok(undefined);
}

/**
 * Stored words of a course, dungeon or place chapter: absent (written before words were kept), or
 * exactly one parsing Dialogue per resident of `scene`.
 */
function residentWords(
  scene: SceneGraph,
  dialogues: Readonly<Record<string, string>> | undefined,
  prefix: "place" | "chapter",
): Result<void> {
  if (dialogues === undefined) return ok(undefined);
  const npcIds = scene.npcs.map((npc) => npc.id);
  const keys = Object.keys(dialogues);
  if (keys.length !== npcIds.length || npcIds.some((id) => !keys.includes(id))) {
    return err(
      `${prefix}-dialogue-mismatch`,
      "Every resident needs exactly its own words.",
      "Write the place again.",
    );
  }
  for (const [npcId, source] of Object.entries(dialogues)) {
    const dialogue = parseDialogue(source);
    if (!dialogue.ok || dialogue.value.npcId !== npcId) {
      return err(
        `${prefix}-dialogue-invalid`,
        `The words of ${npcId} do not parse as their own.`,
        "Write the place again.",
      );
    }
  }
  return ok(undefined);
}

/** A course's or dungeon's life: a Scene program, plus its residents' words. */
function writtenPlace(
  source: string,
  dialogues: Readonly<Record<string, string>> | undefined,
  prefix: "place" | "chapter",
): Result<void> {
  const scene = parseScene(source);
  if (!scene.ok) {
    return err(`${prefix}-source-invalid`, scene.error.message, "Write the place again.");
  }
  return residentWords(scene.value, dialogues, prefix);
}

function validatePlaceBody(body: PlaceBody): Result<void> {
  if (body.kind === "otherworld" || body.source === undefined) return ok(undefined);
  return writtenPlace(body.source, body.dialogues, "place");
}

function validateChapterBody(body: ChapterBody): Result<void> {
  if (body.kind === "work" || body.kind === "closed") return ok(undefined);
  if (body.kind !== "land") return writtenPlace(body.source, body.dialogues, "chapter");
  if (body.dialogues !== undefined) {
    return err(
      "chapter-dialogue-mismatch",
      "A chapter on the land keeps its people's words in its own program.",
      "Leave dialogues out of a land chapter.",
    );
  }
  const chapter = parseChapter(body.source, null);
  return chapter.ok
    ? ok(undefined)
    : err("chapter-source-invalid", chapter.error.message, "Write the chapter again.");
}

function validateGiftBody(body: GiftBody): Result<void> {
  const item = parseItem(serializeItem(body.item));
  if (item.ok && canonicalJson(item.value) === canonicalJson(body.item)) return ok(undefined);
  return err(
    "gift-item-invalid",
    item.ok
      ? `The gifted item ${body.item.id} does not survive the Item dialect unchanged.`
      : `The gifted item ${body.item.id} is not an item the Item dialect can write: ${item.error.message}`,
    "Only an item made in this game can be given.",
  );
}

function validateRumorBody(body: RumorBody): Result<void> {
  const read = parseRumors(serializeRumors([{ slot: body.slot, text: body.text }]), null);
  const back = read.ok ? read.value[0] : undefined;
  if (read.ok && read.value.length === 1 && back?.slot === body.slot && back.text === body.text) {
    return ok(undefined);
  }
  return err(
    "rumor-text-invalid",
    `Rumor ${body.slot} is not one plain line the Rumors dialect writes.`,
    "Write one line of 1 to 200 characters, with single spaces.",
  );
}

/** An event's kind with its typed body: a `HistoryEvent`, or a renderer's `EventDraft`. */
export type EventBodyOf = { [K in EventKind]: { kind: K; body: EventBodies[K] } }[EventKind];

/**
 * D5 step 4: the checks on an event's body that need the DSL. Kinds without programs pass. Read
 * the event first (`readEvent`): this trusts the body's shape and caps.
 */
export function validateEventBody(event: EventBodyOf): Result<void> {
  switch (event.kind) {
    case "witness":
      return validateWitnessBody(event.body);
    case "place":
      return validatePlaceBody(event.body);
    case "chapter":
      return validateChapterBody(event.body);
    case "gift":
      return validateGiftBody(event.body);
    case "rumor":
      return validateRumorBody(event.body);
    default:
      return ok(undefined);
  }
}
