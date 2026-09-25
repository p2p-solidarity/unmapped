// Rumors (rev 6 phase 3, D14): the beat picks what is retold and who tells it, a member's model
// writes how, and this validator checks every rumor's names against the history. Pure, with
// code-unit comparisons and ASCII-only case folding (D4): the service and every client judge a
// rumor the same way.
//
// Slots: events in (previous beat, upTo] of the kinds in RUMOR_KINDS, written by the owner or a
// member, live, not hidden, not pending — never notes or gifts, so no player-typed text or
// player-made item name reaches an NPC's mouth — ranked by (kind priority, n); the first six with
// a listener are taken. The listener is a resident of a standing chunk 1–3 rings from where it
// happened, picked by `hashIndex(event id) mod count` over residents sorted by (cx, cz, npc).

import { type ChunkCoord, chunkDistance, chunkKey } from "../chunks";
import { err, ok, type Result } from "../result";
import { HISTORY_LIMITS, isOneLine } from "./bodies";
import { chunkStands } from "./decay";
import { hashIndex } from "./ids";
import type { EventKind, EventRef, Folded, RumorBody, RumorSlot, WorldNow } from "./types";

/** Kinds a rumor may retell, in priority order (earlier first). */
export const RUMOR_KINDS: readonly EventKind[] = [
  "deed",
  "chapter",
  "place",
  "member.join",
  "witness",
];
/** How far a rumor travels from where it happened, in chunk rings. */
export const RUMOR_RINGS = { min: 1, max: 3 } as const;
/** A rumor may be written for a slot of one of the last this-many beats. */
export const RUMOR_WRITE_BEATS = 4;
/** Residents retell live rumors of the last this-many beats. */
export const RUMOR_SHOW_BEATS = 8;
/** Labels shorter than this are not searched for in a rumor (one letter matches anything). */
export const RUMOR_NAME_MIN = 2;

export interface Listener {
  cx: number;
  cz: number;
  npc: string;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Lowercases A–Z only: the same on every engine and locale. */
export function asciiFold(text: string): string {
  let out = "";
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    out += code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : text[index];
  }
  return out;
}

/** Residents of standing chunks 1–3 rings from `where`, sorted by (cx, cz, npc). */
function listeners(now: WorldNow, where: ChunkCoord, fog: ReadonlySet<string>): Listener[] {
  const out: Listener[] = [];
  for (const chunk of Object.values(now.chunks)) {
    if (!chunkStands(now, chunk) || chunk.live.pending || fog.has(chunkKey(chunk))) continue;
    const ring = chunkDistance(chunk, where);
    if (ring < RUMOR_RINGS.min || ring > RUMOR_RINGS.max) continue;
    for (const npc of chunk.index.npcs) out.push({ cx: chunk.cx, cz: chunk.cz, npc: npc.id });
  }
  return out.sort((a, b) => a.cx - b.cx || a.cz - b.cz || compareText(a.npc, b.npc));
}

/** Whether an event may be retold: live, shown, shared, by the owner or a member, still standing. */
function retellable(now: WorldNow, ref: EventRef): boolean {
  if (ref.status !== "live" || ref.pending || now.hidden[ref.id] === true) return false;
  if (ref.author !== now.owner && now.members[ref.author] === undefined) return false;
  if (ref.kind !== "witness" || ref.where === null) return true;
  const chunk = now.chunks[chunkKey(ref.where)];
  return chunk !== undefined && chunk.live.id === ref.id && chunkStands(now, chunk);
}

/**
 * D14: the rumor slots of a beat over the fold at `toN`, citing events in (fromN, toN]. `fog`
 * holds the chunk keys this beat fogs: nobody there tells anything.
 */
export function pickRumorSlots(
  now: WorldNow,
  fromN: number,
  toN: number,
  fog: readonly string[] = [],
): RumorSlot[] {
  const fogged = new Set(fog);
  const candidates = Object.values(now.events)
    .filter((ref) => ref.n > fromN && ref.n <= toN && RUMOR_KINDS.includes(ref.kind))
    .filter((ref) => ref.label !== null && ref.where !== null && retellable(now, ref))
    .sort((a, b) => RUMOR_KINDS.indexOf(a.kind) - RUMOR_KINDS.indexOf(b.kind) || a.n - b.n);
  const slots: RumorSlot[] = [];
  for (const ref of candidates) {
    if (slots.length >= HISTORY_LIMITS.rumorSlots || ref.where === null) break;
    const heard = listeners(now, ref.where, fogged);
    const listener = heard[hashIndex(ref.id, heard.length)];
    if (listener === undefined) continue;
    const there = now.chunks[chunkKey(ref.where)];
    const place =
      there !== undefined && chunkStands(now, there) && !fogged.has(chunkKey(ref.where))
        ? there.live.id
        : null;
    slots.push({ slot: slots.length, cite: ref.id, place, listener });
  }
  return slots;
}

/**
 * Every label the fold knows (D14): place and resident names and keepsakes of every witness,
 * gift item names, place, chapter and story titles, and member names — at least 2 characters.
 */
export function knownLabels(now: WorldNow): string[] {
  const labels = new Set<string>(Object.values(now.names));
  for (const chunk of Object.values(now.chunks)) {
    for (const witness of [chunk.live, ...chunk.legends, ...chunk.variants]) {
      const { index } = witness.body;
      labels.add(index.name);
      for (const npc of index.npcs) labels.add(npc.name);
      for (const keepsake of index.keepsakes) labels.add(keepsake.name);
    }
  }
  for (const gift of Object.values(now.gifts)) labels.add(gift.body.item.name);
  for (const place of now.places) labels.add(place.body.title);
  for (const chapter of Object.values(now.chapters)) {
    for (const one of [chapter.live, ...chapter.variants]) {
      if (one !== null) labels.add(one.body.title);
    }
  }
  for (const more of Object.values(now.more)) {
    for (const one of [more.live, ...more.variants]) {
      if (one !== null) labels.add(one.body.episode.title);
    }
  }
  return [...labels].filter((label) => label.length >= RUMOR_NAME_MIN);
}

/** What a slot allows a rumor to name: the cited label, its place, its people, the listener. */
function allowedLabels(now: WorldNow, slot: RumorSlot, cited: EventRef): string[] {
  const allowed: (string | null | undefined)[] = [cited.label, now.names[cited.author]];
  if (cited.subject !== null) allowed.push(now.names[cited.subject]);
  if (slot.place !== null) allowed.push(now.events[slot.place]?.label);
  const home = now.chunks[`${slot.listener.cx},${slot.listener.cz}`];
  if (home !== undefined) {
    allowed.push(home.index.name);
    allowed.push(home.index.npcs.find((npc) => npc.id === slot.listener.npc)?.name);
  }
  return allowed.filter((label): label is string => typeof label === "string" && label !== "");
}

/**
 * D14: whether a rumor may stand. Its beat is among the last four and has the slot; the text is
 * one line of 1–200 characters and names the cited event's label; and every label the fold knows
 * that appears in it lies inside an occurrence of an allowed one (compared as spans). A refusal
 * goes back to the model as a repair message.
 */
export function validateRumor(
  now: WorldNow,
  rumor: { author: string; body: RumorBody },
): Result<void> {
  const { body } = rumor;
  const beat = now.beats.slice(-RUMOR_WRITE_BEATS).find((one) => one.id === body.beat);
  if (beat === undefined) {
    return now.beats.some((one) => one.id === body.beat)
      ? err("rumor-beat-expired", "That beat is too old to write rumors for.")
      : err("rumor-beat-unknown", "The rumor names a beat this world never had.");
  }
  const slot = beat.body.slots.find((one) => one.slot === body.slot);
  if (slot === undefined) {
    return err(
      "rumor-slot-unknown",
      `Beat has no rumor slot ${body.slot}.`,
      "Write only the slots given.",
    );
  }
  const text = body.text;
  if (text.trim().length === 0 || text.length > HISTORY_LIMITS.rumorChars || !isOneLine(text)) {
    return err(
      "rumor-text-invalid",
      `A rumor is one line of 1–${HISTORY_LIMITS.rumorChars} characters.`,
      "Write one short line.",
    );
  }
  const cited = now.events[slot.cite];
  if (cited === undefined || cited.label === null) {
    return err("rumor-cites-nothing", "The rumor's slot cites nothing in this history.");
  }
  const said = asciiFold(text);
  if (!said.includes(asciiFold(cited.label))) {
    return err(
      "rumor-uncited",
      `Rumor ${body.slot} does not name "${cited.label}".`,
      `Name "${cited.label}" exactly as written.`,
    );
  }
  // Compared as spans of the text, never by masking: masking an allowed "Alice" would also hide the
  // known, uncited "Aliceville" it begins. A known label may stand only inside an allowed one.
  const allowed = allowedLabels(now, slot, cited).flatMap((label) => spans(said, asciiFold(label)));
  const named = knownLabels(now).find((label) =>
    spans(said, asciiFold(label)).some(
      ([start, end]) => !allowed.some(([from, to]) => from <= start && end <= to),
    ),
  );
  if (named !== undefined) {
    return err(
      "rumor-names-other",
      `Rumor ${body.slot} names "${named}", which is not part of what it retells.`,
      "Name only the place, people and thing in the fact given.",
    );
  }
  return ok(undefined);
}

/** Every [start, end) where `label` occurs in `text` (overlapping occurrences included). */
function spans(text: string, label: string): [number, number][] {
  const found: [number, number][] = [];
  if (label === "") return found;
  for (let at = text.indexOf(label); at !== -1; at = text.indexOf(label, at + 1)) {
    found.push([at, at + label.length]);
  }
  return found;
}

export function rumorKey(beat: string, slot: number): string {
  return `${beat}#${slot}`;
}

/** Slots of the last four beats nobody has written a live rumor for yet. */
export function openRumorSlots(now: WorldNow): { beat: string; slot: RumorSlot }[] {
  return now.beats
    .slice(-RUMOR_WRITE_BEATS)
    .flatMap((beat) =>
      beat.body.slots
        .filter((slot) => (now.rumors[rumorKey(beat.id, slot.slot)]?.live ?? null) === null)
        .map((slot) => ({ beat: beat.id, slot })),
    );
}

/** Live, shown rumors of the last eight beats a resident tells ("They say…"), oldest first. */
export function rumorsFor(now: WorldNow, listener: Listener): Folded<RumorBody>[] {
  return now.beats.slice(-RUMOR_SHOW_BEATS).flatMap((beat) =>
    beat.body.slots
      .filter(
        (slot) =>
          slot.listener.cx === listener.cx &&
          slot.listener.cz === listener.cz &&
          slot.listener.npc === listener.npc,
      )
      .flatMap((slot) => {
        const live = now.rumors[rumorKey(beat.id, slot.slot)]?.live ?? null;
        return live === null || now.hidden[live.id] === true ? [] : [live];
      }),
  );
}
