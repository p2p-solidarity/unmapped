// Whether an event may enter a world's history, and as what (rev 6 phase 3, D3–D5, D8, D13–D15).
// Pure over the fold and the receipt time, with integer math and code-unit comparisons only (D4).
// The service runs it before it sequences, main before it signs a draft from the renderer, and
// every fold again on receipt: an event that fails here is never sequenced by an honest service,
// and is skipped identically by every client if it is.
//
// Races (D4, D15): a witness, chapter or next chapter of the story for a target that already has
// a live one is refused when its author had folded that live one (`seen ≥ n_live`) — they knew —
// and becomes a variant (異聞) when they had not: an offline race loses nothing. A witness on a
// chunk that does not stand (fogged, or its live witness hidden) is a re-witness: it becomes live
// and the old one a legend. Parents (D3): a note, deed, chapter or gift.take whose parent is a
// variant is a variant.
//
// Geometry that needs trigonometry stays with the writer: a place's `at` (`placeSpot`) and a
// continued chapter's gate (`trailPlace`) are only checked to be free here.

import { canonicalJson } from "../canonical";
import { type ChunkCoord, chunkKey } from "../chunks";
import { err, ok, type Result } from "../result";
import { STORY_CAP } from "../story";
import { mayWrite } from "./access";
import { computeBeat } from "./beat";
import { HISTORY_LIMITS } from "./bodies";
import { chunkStands, dayOf } from "./decay";
import { placeIdOf, sameChunk, timeMs } from "./ids";
import { rumorKey, validateRumor } from "./rumor";
import { inviteSigned, joinProofValid } from "./sign";
import type {
  Admission,
  ChapterBody,
  DeedBody,
  EventKind,
  EventRef,
  Folded,
  HistoryEvent,
  HistoryEventOf,
  Invite,
  WitnessBody,
  WorldNow,
} from "./types";

const ORIGIN: ChunkCoord = { cx: 0, cz: 0 };
const LIVE: Result<Admission> = ok({ as: "live" });
const VARIANT: Result<Admission> = ok({ as: "variant" });

/** Kinds the owner's `hide` cannot target: the world's own structure. */
const UNHIDEABLE: readonly EventKind[] = [
  "genesis",
  "access",
  "sequencer",
  "pack",
  "hide",
  "invite.revoke",
  "member.remove",
  "beat",
];

const isVariant = (now: WorldNow, id: string): boolean => now.events[id]?.status === "variant";

/** Every story gate on the land: the authored ones, then the live continued chapters. */
export function storyGates(now: WorldNow): ChunkCoord[] {
  const gates = now.genesis.body.gates.map((gate) => ({ cx: gate.cx, cz: gate.cz }));
  for (const { live } of Object.values(now.more)) {
    if (live !== null) gates.push({ cx: live.body.episode.cx, cz: live.body.episode.cz });
  }
  return gates;
}

/** The chunk an episode's gate stands in: authored (genesis) or a live `story.more`. */
export function gateOf(now: WorldNow, episodeId: string): ChunkCoord | null {
  const authored = now.genesis.body.gates.find((gate) => gate.id === episodeId);
  if (authored !== undefined) return { cx: authored.cx, cz: authored.cz };
  const more = now.more[episodeId]?.live?.body.episode;
  return more === undefined ? null : { cx: more.cx, cz: more.cz };
}

/**
 * D3: whether a place may stand at `at`: within 64 chunks of the origin (`place-spot-far`), and
 * not home, a story gate or an earlier place (`place-spot-taken`). The writer runs `placeSpot` and
 * this same check; on `place-spot-taken` it picks again, with no model call.
 */
export function spotFree(now: WorldNow, at: ChunkCoord): Result<void> {
  if (Math.abs(at.cx) > HISTORY_LIMITS.placeReach || Math.abs(at.cz) > HISTORY_LIMITS.placeReach) {
    return err("place-spot-far", "A place must stand within 64 chunks of home.");
  }
  const taken =
    sameChunk(at, ORIGIN) ||
    storyGates(now).some((gate) => sameChunk(gate, at)) ||
    now.places.some((place) => sameChunk(place.body.at, at));
  return taken
    ? err("place-spot-taken", "Something already stands there.", "Choose another spot near here.")
    : ok(undefined);
}

/** The id the next continued chapter must have: the lowest `eN` no episode uses yet. */
export function nextFreeEpisode(now: WorldNow): string | null {
  const used = new Set([
    ...now.genesis.body.gates.map((gate) => gate.id),
    ...Object.keys(now.more),
  ]);
  for (let index = 1; index <= STORY_CAP; index += 1) {
    if (!used.has(`e${index}`)) return `e${index}`;
  }
  return null;
}

/** A witness event as the fold keeps it (live, legend or variant), by its id. */
export function witnessOf(now: WorldNow, id: string): Folded<WitnessBody> | null {
  const ref = now.events[id];
  if (ref === undefined || ref.kind !== "witness" || ref.where === null) return null;
  const chunk = now.chunks[chunkKey(ref.where)];
  if (chunk === undefined) return null;
  return [chunk.live, ...chunk.legends, ...chunk.variants].find((one) => one.id === id) ?? null;
}

/** Live lore (D4): a node of the live witness of a chunk that stands. Ids end in `@cx,cz`. */
export function isLiveLore(now: WorldNow, id: string): boolean {
  const match = /@(-?\d{1,5}),(-?\d{1,5})$/.exec(id);
  if (match === null) return false;
  const chunk = now.chunks[`${Number(match[1])},${Number(match[2])}`];
  if (chunk === undefined || !chunkStands(now, chunk)) return false;
  return chunk.live.body.lore.some((node) => node.id === id);
}

/**
 * Where a chapter's gate stands and whether its parent is a variant: an authored episode
 * (`more: null`), or the episode its `story.more` event wrote (live or variant).
 */
export function chapterGate(
  now: WorldNow,
  body: ChapterBody,
): Result<{ gate: ChunkCoord; parentVariant: boolean }> {
  if (body.more === null) {
    const authored = now.genesis.body.gates.find((gate) => gate.id === body.episodeId);
    return authored === undefined
      ? err("chapter-episode-unknown", `The story has no episode ${body.episodeId}.`)
      : ok({ gate: { cx: authored.cx, cz: authored.cz }, parentVariant: false });
  }
  const ref = now.events[body.more];
  if (ref === undefined || ref.kind !== "story.more") {
    return err("chapter-more-unknown", "The chapter's story.more is not in this history.");
  }
  const contest = now.more[body.episodeId];
  const written = contest === undefined ? [] : [contest.live, ...contest.variants];
  const more = written.find((one) => one?.id === body.more);
  if (more === undefined || more === null) {
    return err("chapter-more-mismatch", "The chapter is for another episode than its story.more.");
  }
  const { cx, cz } = more.body.episode;
  return ok({ gate: { cx, cz }, parentVariant: ref.status === "variant" });
}

/**
 * What a deed is about, if it resolves: the chapter or place event its `ref` names, or for
 * `errand.done` the witness whose index has the errand `<witnessId>:<errandId>` names.
 */
export function deedTarget(now: WorldNow, body: DeedBody): EventRef | null {
  if (body.what === "errand.done") {
    const [witnessId = "", errandId = ""] = body.ref.split(":");
    const witness = witnessOf(now, witnessId);
    const known = witness?.body.index.errands.some((errand) => errand.id === errandId) === true;
    return known ? (now.events[witnessId] ?? null) : null;
  }
  const ref = now.events[body.ref];
  const kind = body.what === "chapter.cleared" ? "chapter" : "place";
  return ref !== undefined && ref.kind === kind ? ref : null;
}

/** One deed per author and ref (D3). */
export function deedKey(author: string, body: DeedBody): string {
  return `${author}|${body.ref}`;
}

/**
 * D8: an invite admits `joiner` at receipt time `rt` when it is for this world, the owner signed
 * it, it has not expired, it was not revoked earlier in the log, it has uses left, and the proof
 * shows the joiner holds the invite's one-time secret (bound to the joiner's own key).
 */
export function verifyInvite(
  now: WorldNow,
  invite: Invite,
  proof: string,
  joiner: string,
  rt: string,
): Result<void> {
  const again = "Ask the owner for a new link.";
  if (invite.world !== now.world) {
    return err("invite-wrong-world", "This invite is for another world.");
  }
  if (invite.by !== now.owner) {
    return err("invite-not-owner", "This invite was not made by the world's owner.");
  }
  if (!inviteSigned(invite)) {
    return err("invite-sig-invalid", "This invite's signature does not verify.", again);
  }
  if (!(timeMs(rt) < timeMs(invite.exp))) {
    return err("invite-expired", "This invite has expired.", again);
  }
  const seen = now.invites[invite.nonce];
  if (seen !== undefined && seen.revoked !== null) {
    return err("invite-revoked", "The owner withdrew this invite.", again);
  }
  if ((seen?.uses ?? 0) >= invite.uses) {
    return err("invite-used-up", "This invite has been used up.", again);
  }
  if (!joinProofValid(invite, proof, joiner)) {
    return err("invite-proof-invalid", "This join does not prove it holds the invite.", again);
  }
  return ok(undefined);
}

function admitWitness(now: WorldNow, event: HistoryEventOf<"witness">): Result<Admission> {
  const { body } = event;
  const own = new Set<string>();
  for (const node of body.lore) {
    const onChunk = node.coord.cx === body.cx && node.coord.cz === body.cz;
    if (!onChunk || !node.id.endsWith(`@${body.cx},${body.cz}`)) {
      return err("lore-off-chunk", `Lore ${node.id} is not on the chunk it was written on.`);
    }
    if (own.has(node.id)) return err("lore-id-duplicate", `Lore ${node.id} is written twice.`);
    own.add(node.id);
  }
  // Lore ids carry their chunk, so a new live witness (only ever on a chunk that does not stand)
  // cannot collide with live lore; links and errand places must reach live lore or its own.
  const reachable = (id: string): boolean => own.has(id) || isLiveLore(now, id);
  for (const node of body.lore) {
    const dangling = node.links.find((link) => !reachable(link));
    if (dangling !== undefined) {
      return err("lore-link-unknown", `Lore ${node.id} links to ${dangling}, which is not live.`);
    }
  }
  const lost = body.index.errands.find(
    (errand) => errand.place !== null && !reachable(errand.place),
  );
  if (lost !== undefined) {
    return err("errand-place-unknown", `Errand ${lost.id} names a place that is not live lore.`);
  }
  const chunk = now.chunks[chunkKey(body)];
  if (body.supersedes !== undefined) {
    const known =
      chunk !== undefined &&
      [chunk.live, ...chunk.variants, ...chunk.legends].some((one) => one.id === body.supersedes);
    if (!known) {
      return err("witness-supersedes-unknown", "It grows out of a witness this chunk never had.");
    }
  }
  if (chunk === undefined || !chunkStands(now, chunk)) return LIVE;
  if (event.seen >= chunk.live.n) {
    return err(
      "chunk-already-witnessed",
      `Chunk (${body.cx}, ${body.cz}) was already witnessed.`,
      "Reload the land; the first witness is what this place is.",
    );
  }
  return VARIANT;
}

function admitPlace(now: WorldNow, event: HistoryEventOf<"place">): Result<Admission> {
  const { body } = event;
  if (now.places.length >= HISTORY_LIMITS.places) {
    return err("places-full", `This world already has ${HISTORY_LIMITS.places} places.`);
  }
  if (body.legacyId !== undefined && event.author !== now.owner) {
    return err("place-legacy-owner", "Only the owner's migration keeps an old place id.");
  }
  const id = body.legacyId ?? placeIdOf(event.id);
  if (now.places.some((place) => place.place === id)) {
    return err("place-id-taken", `Place ${id} already exists.`);
  }
  const spot = spotFree(now, body.at);
  return spot.ok ? LIVE : spot;
}

function admitChapter(now: WorldNow, event: HistoryEventOf<"chapter">): Result<Admission> {
  const gate = chapterGate(now, event.body);
  if (!gate.ok) return gate;
  const live = now.chapters[event.body.episodeId]?.live ?? null;
  if (live !== null && event.seen >= live.n) {
    return err(
      "chapter-already-written",
      `Chapter ${event.body.episodeId} is already written.`,
      "Reload the land.",
    );
  }
  return gate.value.parentVariant || live !== null ? VARIANT : LIVE;
}

function admitMore(now: WorldNow, event: HistoryEventOf<"story.more">): Result<Admission> {
  const { episode } = event.body;
  if (now.genesis.body.gates.some((gate) => gate.id === episode.id)) {
    return err("more-authored", `Episode ${episode.id} belongs to the cartridge's story.`);
  }
  const live = now.more[episode.id]?.live ?? null;
  if (live !== null) {
    return event.seen >= live.n
      ? err("more-already-written", `Episode ${episode.id} is already written.`, "Reload the land.")
      : VARIANT;
  }
  const next = nextFreeEpisode(now);
  if (next === null) return err("story-full", `The story already has ${STORY_CAP} episodes.`);
  if (episode.id !== next) {
    return err("more-not-next", `The next chapter of this story is ${next}, not ${episode.id}.`);
  }
  if (
    sameChunk(episode, ORIGIN) ||
    storyGates(now).some((gate) => sameChunk(gate, episode)) ||
    now.places.some((one) => sameChunk(one, episode))
  ) {
    return err(
      "more-gate-taken",
      "That gate stands where another gate, a place or home already is.",
    );
  }
  return LIVE;
}

function admitNote(now: WorldNow, event: HistoryEventOf<"note">): Result<Admission> {
  const { anchors, contests } = event.body;
  for (const anchor of anchors) {
    if (now.events[anchor]?.kind !== "witness") {
      return err("note-anchor-unknown", "The note is anchored to a place this world never had.");
    }
  }
  if (contests !== null && now.events[contests]?.kind !== "note") {
    return err("note-contests-unknown", "The note it answers is not in this world.");
  }
  const parents = contests === null ? anchors : [...anchors, contests];
  return parents.some((id) => isVariant(now, id)) ? VARIANT : LIVE;
}

function admitBeat(now: WorldNow, event: HistoryEventOf<"beat">, rt: string): Result<Admission> {
  const { body } = event;
  if (body.upTo !== now.head.n) {
    return err(
      "beat-mismatch",
      `The beat folds up to ${body.upTo}, but the log stands at ${now.head.n}.`,
    );
  }
  if (timeMs(body.at) > timeMs(rt)) {
    return err("beat-time", "A beat cannot be from after its own receipt.");
  }
  const computed = computeBeat(now, body.at);
  if (!computed.ok) return computed;
  if (canonicalJson(computed.value.body) !== canonicalJson(body)) {
    return err("beat-mismatch", "The beat does not equal its recomputation over the history.");
  }
  return ok({ as: "live", care: computed.value.care });
}

function admitKind(now: WorldNow, event: HistoryEvent, rt: string): Result<Admission> {
  switch (event.kind) {
    case "genesis":
      return err("genesis-duplicate", "A world has exactly one genesis.");
    case "pack":
      return event.body.cartridge === now.genesis.body.cartridge.contentHash
        ? LIVE
        : err("pack-cartridge-mismatch", "The pack is for another cartridge revision.");
    case "hide": {
      const target = now.events[event.body.id];
      if (target === undefined) return err("hide-unknown", "There is no such event to hide.");
      return UNHIDEABLE.includes(target.kind)
        ? err("hide-kind", `A ${target.kind} event cannot be hidden.`)
        : LIVE;
    }
    case "member.remove":
      return event.body.key === now.owner
        ? err("member-remove-owner", "The owner cannot remove themself.")
        : LIVE;
    case "member.join": {
      const current = Object.keys(now.members).filter((key) => now.removed[key] === undefined);
      if (current.length >= HISTORY_LIMITS.members) {
        return err("members-full", `This world already has ${HISTORY_LIMITS.members} members.`);
      }
      const { invite, proof } = event.body;
      const valid = verifyInvite(now, invite, proof, event.author, rt);
      return valid.ok ? LIVE : valid;
    }
    case "witness":
      return admitWitness(now, event);
    case "place":
      return admitPlace(now, event);
    case "chapter":
      return admitChapter(now, event);
    case "story.more":
      return admitMore(now, event);
    case "note":
      return admitNote(now, event);
    case "signpost": {
      const { coord } = event.body;
      const mine = now.signposts.filter(
        (sign) => sign.author === event.author && sameChunk(sign.body.coord, coord),
      ).length;
      return mine >= HISTORY_LIMITS.signpostsPerAuthorChunk
        ? err("signpost-quota", "You already put three signposts on this chunk.")
        : LIVE;
    }
    case "gift.take": {
      const gift = now.gifts[event.body.gift];
      if (gift === undefined) return err("gift-unknown", "That gift is not in this world.");
      if (gift.taken !== null) return err("gift-taken", "Someone already took that gift.");
      if (gift.body.for !== null && gift.body.for !== event.author) {
        return err("gift-not-yours", "That gift was left for someone else.");
      }
      return isVariant(now, gift.id) ? VARIANT : LIVE;
    }
    case "visit":
      return now.lastVisit[event.author] === dayOf(timeMs(rt))
        ? err("visit-today", "Today's visit is already counted.")
        : LIVE;
    case "deed": {
      const target = deedTarget(now, event.body);
      if (target === null) {
        return err("deed-ref-unknown", "The deed names something this history does not have.");
      }
      if (now.deeds[deedKey(event.author, event.body)] !== undefined) {
        return err("deed-duplicate", "That deed is already in the history.");
      }
      return target.status === "variant" ? VARIANT : LIVE;
    }
    case "beat":
      return admitBeat(now, event, rt);
    case "rumor": {
      const valid = validateRumor(now, event);
      if (!valid.ok) return valid;
      const live = now.rumors[rumorKey(event.body.beat, event.body.slot)]?.live ?? null;
      return live === null ? LIVE : VARIANT;
    }
    default:
      return LIVE;
  }
}

/**
 * D5 step 5: whether `event` may be the next entry of `now`'s log, received at `rt`, and as what.
 * Checks the world, duplicates, `seen`, the door (./access), then the kind's own rules.
 */
export function admit(now: WorldNow, event: HistoryEvent, rt: string): Result<Admission> {
  if (event.kind !== "genesis" && event.world !== now.world) {
    return err("event-wrong-world", "The event belongs to another world.");
  }
  if (now.events[event.id] !== undefined) {
    return err("event-duplicate", "That event is already in the history.");
  }
  if (event.seen > now.head.n) {
    return err("event-seen-future", "The event claims to have seen history that does not exist.");
  }
  const door = mayWrite(now, event.kind, event.author);
  if (!door.ok) return door;
  return admitKind(now, event, rt);
}
