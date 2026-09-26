// "Now" is a pure fold over entries and verdicts (rev 6 phase 3, D4): `emptyNow(genesis)` then
// `applyEntry(now, entry, verdict)` for every log entry in order — no clock, no randomness, no IO,
// integer math and code-unit sorts only — so the service, main and every renderer derive the same
// world from the same log. Fog, variants (異聞), legends (傳說), hides and removals are views the
// fold derives; nothing in the history is ever deleted.
//
// The verdict carries what the fold cannot check itself (id, signature, DSL body; computed by main
// and the service). An entry whose verdict is not ok, or that fails reading or `admit`, stays in
// the log (the chain needs it) and is listed in `ignored` with its code; an unknown kind or format
// from a newer build likewise. Outbox events fold on top as provisional (`withPending`).
//
// `applyEntry` never mutates its input: it copies the top-level collections once and replaces any
// nested object it changes, so an earlier `now` stays valid (the pending overlay relies on it).
// `foldEntries` pays that copy once for a whole batch. `WorldNow` is plain JSON: a snapshot
// (`FoldSnapshot`) round-trips through JSON.stringify / JSON.parse and folds on identically.

import { type ChunkCoord, chunkKey } from "../chunks";
import type { LoreNode } from "../lore";
import { err, ok, type Result } from "../result";
import { admit, chapterGate, deedKey, deedTarget } from "./admit";
import { CARE_POINTS, chunkStands, dayOf, pruneTouches } from "./decay";
import { readEvent } from "./event";
import { placeIdOf, timeMs } from "./ids";
import { rumorKey } from "./rumor";
import { verifyEvent } from "./sign";
import type {
  Admission,
  BeatBody,
  Contest,
  EntryVerdict,
  Folded,
  GenesisEvent,
  HistoryEvent,
  HistoryEventOf,
  LogEntry,
  PendingEvent,
  StoredEvent,
  VerdictEntry,
  WitnessBody,
  WorldNow,
} from "./types";

/**
 * Bumps with any change to the fold, admit, beat or rumor rules: older snapshots are refolded.
 * 2: co-owners and the chain opt-in (phase 4 D5, D6: `owners`, `provenance`).
 */
export const FOLD_VERSION = 2;

const ORIGIN: ChunkCoord = { cx: 0, cz: 0 };

/** Codes that mean "written by a newer build" (D18: counted on screen, never an error). */
export const NEWER_CODES: ReadonlySet<string> = new Set([
  "event-kind-unknown",
  "event-version-unknown",
]);

interface Step {
  n: number;
  rt: string;
  pending: boolean;
}

/** A world's genesis read from anywhere (a log's line 1, an `opened` frame, an invite's join). */
export function openGenesis(raw: unknown): Result<GenesisEvent> {
  const read = readEvent(raw);
  if (!read.ok) return read;
  if (read.value.kind !== "genesis") {
    return err("genesis-invalid", "A world's first event must be its genesis.");
  }
  const verified = verifyEvent(read.value);
  return verified.ok ? ok(read.value) : verified;
}

/** The world before its first entry: the genesis names it, its owner and its first door. */
export function emptyNow(genesis: GenesisEvent): WorldNow {
  return {
    world: genesis.id,
    genesis,
    owner: genesis.author,
    owners: {
      [genesis.author]: { key: genesis.author, n: 1, removed: null, added: null, pending: false },
    },
    provenance: null,
    head: { n: 0, chain: genesis.id },
    rt: null,
    genesisRt: null,
    access: genesis.body.access,
    sequencer: null,
    pack: null,
    hidden: {},
    members: {},
    removed: {},
    names: {},
    invites: {},
    chunks: {},
    notes: [],
    signposts: [],
    gifts: {},
    places: [],
    chapters: {},
    more: {},
    care: {},
    season: 0,
    beats: [],
    rumors: {},
    touches: {},
    lastTouch: {},
    lastVisit: {},
    deeds: {},
    events: {},
    ignored: [],
    pending: 0,
  };
}

function cloneNow(now: WorldNow): WorldNow {
  return {
    ...now,
    owners: { ...now.owners },
    hidden: { ...now.hidden },
    members: { ...now.members },
    removed: { ...now.removed },
    names: { ...now.names },
    invites: { ...now.invites },
    chunks: { ...now.chunks },
    notes: [...now.notes],
    signposts: [...now.signposts],
    gifts: { ...now.gifts },
    places: [...now.places],
    chapters: { ...now.chapters },
    more: { ...now.more },
    beats: [...now.beats],
    rumors: { ...now.rumors },
    touches: { ...now.touches },
    lastTouch: { ...now.lastTouch },
    lastVisit: { ...now.lastVisit },
    deeds: { ...now.deeds },
    events: { ...now.events },
    ignored: [...now.ignored],
  };
}

type Decision = { event: HistoryEvent; admission: Admission | "genesis" };

/** Read, take the verdict, and admit one event against the state before it (head = n − 1). */
function decide(
  draft: WorldNow,
  raw: StoredEvent,
  step: Step,
  verdict: EntryVerdict,
): Result<Decision> {
  const read = readEvent(raw);
  if (!read.ok) return read;
  if (!verdict.ok) return err(verdict.code, "The event failed its checks.");
  const event = read.value;
  if (!step.pending && step.n === 1) {
    return event.kind === "genesis" && event.id === draft.world
      ? ok({ event, admission: "genesis" })
      : err("genesis-missing", "Entry 1 of a world's log must be its genesis.");
  }
  if (step.pending && event.kind === "beat") {
    return err("beat-pending", "A beat is never provisional.");
  }
  const admitted = admit(draft, event, step.rt);
  return admitted.ok ? ok({ event, admission: admitted.value }) : admitted;
}

function ignore(draft: WorldNow, raw: StoredEvent, step: Step, code: string): void {
  draft.ignored.push({
    n: step.n,
    id: typeof raw.id === "string" ? raw.id : null,
    kind: typeof raw.kind === "string" ? raw.kind.slice(0, 40) : null,
    code,
    pending: step.pending,
  });
}

function contest<B>(
  map: Record<string, Contest<B>>,
  key: string,
  item: Folded<B>,
  admission: Admission,
): void {
  const current = map[key] ?? { live: null, variants: [] };
  map[key] =
    admission.as === "live"
      ? { live: item, variants: current.variants }
      : { live: current.live, variants: [...current.variants, item] };
}

function applyWitness(draft: WorldNow, witness: Folded<WitnessBody>, admission: Admission): void {
  const { body } = witness;
  const key = chunkKey(body);
  const chunk = draft.chunks[key];
  if (chunk === undefined) {
    draft.chunks[key] = {
      cx: body.cx,
      cz: body.cz,
      live: witness,
      fogged: false,
      variants: [],
      legends: [],
      index: body.index,
    };
  } else if (admission.as === "variant") {
    draft.chunks[key] = { ...chunk, variants: [...chunk.variants, witness] };
  } else {
    // A re-witness of a chunk that did not stand: the new one is the place, the old a legend.
    draft.chunks[key] = {
      ...chunk,
      live: witness,
      fogged: false,
      legends: [...chunk.legends, chunk.live],
      index: body.index,
    };
  }
}

/** Adds care points to a chunk on the receipt day (sequenced events only). */
function touch(draft: WorldNow, where: ChunkCoord, step: Step, points: number): void {
  if (step.pending || points <= 0) return;
  const key = chunkKey(where);
  const ms = timeMs(step.rt);
  const day = String(dayOf(ms));
  const days = draft.touches[key] ?? {};
  draft.touches[key] = { ...days, [day]: (days[day] ?? 0) + points };
  draft.lastTouch[key] = Math.max(draft.lastTouch[key] ?? ms, ms);
}

function applyBeat(draft: WorldNow, beat: Folded<BeatBody>, care: Record<string, number>): void {
  for (const key of beat.body.fog) {
    const chunk = draft.chunks[key];
    if (chunk !== undefined) draft.chunks[key] = { ...chunk, fogged: true };
  }
  draft.touches = pruneTouches(draft.touches, dayOf(timeMs(beat.body.at)));
  draft.care = care;
  draft.season = beat.body.season;
  draft.beats.push(beat);
}

/** One visit per author per UTC receipt day: 1 point to each chunk it names, once. */
function applyVisit(draft: WorldNow, event: HistoryEventOf<"visit">, step: Step): void {
  draft.lastVisit[event.author] = dayOf(timeMs(step.rt));
  const keys = new Set<string>();
  for (const coord of event.body.chunks) {
    if (keys.has(chunkKey(coord))) continue;
    keys.add(chunkKey(coord));
    touch(draft, coord, step, CARE_POINTS.visit ?? 0);
  }
}

function tile(coord: { cx: number; cz: number }): ChunkCoord {
  return { cx: coord.cx, cz: coord.cz };
}

/** Folds an admitted event: what it changes, what it is called and where it happened. */
function apply(draft: WorldNow, event: HistoryEvent, step: Step, admission: Admission): void {
  const folded = <B>(body: B): Folded<B> => ({
    id: event.id,
    n: step.n,
    rt: step.rt,
    at: event.at,
    author: event.author,
    body,
    pending: step.pending,
  });
  let label: string | null = null;
  let where: ChunkCoord | null = null;
  let subject: string | null = null;
  switch (event.kind) {
    case "access":
      draft.access = event.body.policy;
      break;
    case "sequencer":
      draft.sequencer = event.body;
      break;
    case "pack":
      draft.pack = event.body;
      break;
    case "hide":
      if (event.body.hidden) draft.hidden[event.body.id] = true;
      else delete draft.hidden[event.body.id];
      break;
    case "invite.revoke": {
      const seen = draft.invites[event.body.nonce];
      draft.invites[event.body.nonce] = { uses: seen?.uses ?? 0, revoked: seen?.revoked ?? step.n };
      break;
    }
    case "member.remove":
      draft.removed[event.body.key] = draft.removed[event.body.key] ?? step.n;
      break;
    case "member.join": {
      const { nonce } = event.body.invite;
      const seen = draft.invites[nonce];
      draft.invites[nonce] = { uses: (seen?.uses ?? 0) + 1, revoked: seen?.revoked ?? null };
      const member = { key: event.author, name: event.body.name, n: step.n, nonce };
      draft.members[event.author] = { ...member, pending: step.pending };
      draft.names[event.author] = event.body.name;
      label = event.body.name;
      where = ORIGIN;
      break;
    }
    case "profile":
      draft.names[event.author] = event.body.name;
      break;
    case "witness":
      applyWitness(draft, folded(event.body), admission);
      label = event.body.index.name;
      where = { cx: event.body.cx, cz: event.body.cz };
      break;
    case "place": {
      const { at } = event.body;
      const place = event.body.legacyId ?? placeIdOf(event.id);
      draft.places.push({ ...folded(event.body), place, cx: at.cx, cz: at.cz });
      label = event.body.title;
      where = { cx: at.cx, cz: at.cz };
      break;
    }
    case "chapter": {
      const gate = chapterGate(draft, event.body);
      where = gate.ok ? gate.value.gate : null;
      contest(draft.chapters, event.body.episodeId, folded(event.body), admission);
      label = event.body.title;
      break;
    }
    case "story.more": {
      const { episode } = event.body;
      contest(draft.more, episode.id, folded(event.body), admission);
      label = episode.title;
      where = { cx: episode.cx, cz: episode.cz };
      break;
    }
    case "note":
      draft.notes.push(folded(event.body));
      where = tile(event.body.coord);
      break;
    case "signpost":
      draft.signposts.push(folded(event.body));
      where = tile(event.body.coord);
      break;
    case "gift":
      draft.gifts[event.id] = { ...folded(event.body), taken: null };
      label = event.body.item.name;
      where = tile(event.body.coord);
      subject = event.body.for;
      break;
    case "gift.take": {
      const gift = draft.gifts[event.body.gift];
      if (gift !== undefined && admission.as === "live") {
        const taken = { by: event.author, id: event.id, pending: step.pending };
        draft.gifts[event.body.gift] = { ...gift, taken };
      }
      where = gift === undefined ? null : tile(gift.body.coord);
      break;
    }
    case "visit":
      applyVisit(draft, event, step);
      break;
    case "deed": {
      const target = deedTarget(draft, event.body);
      draft.deeds[deedKey(event.author, event.body)] = event.id;
      label = target?.label ?? null;
      where = target?.where ?? null;
      break;
    }
    case "beat":
      applyBeat(draft, folded(event.body), admission.care ?? {});
      break;
    case "rumor": {
      const key = rumorKey(event.body.beat, event.body.slot);
      contest(draft.rumors, key, folded(event.body), admission);
      break;
    }
    case "owner.add": {
      const { key } = event.body;
      const known = draft.owners[key];
      draft.owners[key] =
        known === undefined
          ? { key, n: step.n, removed: null, added: event, pending: step.pending }
          : { ...known, removed: null, pending: step.pending };
      break;
    }
    case "owner.remove": {
      const known = draft.owners[event.body.key];
      if (known !== undefined) {
        draft.owners[event.body.key] = { ...known, removed: step.n, pending: step.pending };
      }
      break;
    }
    case "chain":
      draft.provenance = event.body;
      break;
    case "genesis":
      break;
  }
  draft.events[event.id] = {
    id: event.id,
    n: step.n,
    kind: event.kind,
    author: event.author,
    rt: step.rt,
    status: admission.as,
    pending: step.pending,
    label,
    where,
    subject,
  };
  if (where !== null && event.kind !== "visit") {
    touch(draft, where, step, CARE_POINTS[event.kind] ?? 0);
  }
}

function applyInPlace(draft: WorldNow, entry: LogEntry, verdict: EntryVerdict): void {
  const step: Step = { n: entry.n, rt: entry.rt, pending: false };
  if (entry.n !== draft.head.n + 1) {
    ignore(draft, entry.event, step, "entry-out-of-order");
    return;
  }
  const decision = decide(draft, entry.event, step, verdict);
  draft.head = { n: entry.n, chain: entry.chain };
  draft.rt = entry.rt;
  if (!decision.ok) {
    ignore(draft, entry.event, step, decision.error.code);
    return;
  }
  const { event, admission } = decision.value;
  if (admission === "genesis") {
    draft.genesisRt = entry.rt;
    draft.events[event.id] = {
      id: event.id,
      n: entry.n,
      kind: "genesis",
      author: event.author,
      rt: entry.rt,
      status: "live",
      pending: false,
      label: draft.genesis.body.name,
      where: null,
      subject: null,
    };
    return;
  }
  apply(draft, event, step, admission);
}

/** D4: the world after one more entry, given its verdict. `now` itself is left as it was. */
export function applyEntry(now: WorldNow, entry: LogEntry, verdict: EntryVerdict): WorldNow {
  const draft = cloneNow(now);
  applyInPlace(draft, entry, verdict);
  return draft;
}

/** The world after a batch of entries, in order; the same result as applying them one by one. */
export function foldEntries(now: WorldNow, entries: readonly VerdictEntry[]): WorldNow {
  const draft = cloneNow(now);
  for (const { entry, verdict } of entries) applyInPlace(draft, entry, verdict);
  return draft;
}

/**
 * D4 pending overlay: own outbox events folded on top of the sequenced fold as provisional ("not
 * yet shared"), as if received at `rt`, until their receipts make them live or a variant (a child
 * follows its parent). Events whose receipt is already folded are skipped. Recompute it from the
 * sequenced fold whenever either changes; never fold entries onto an overlay.
 */
export function withPending(now: WorldNow, outbox: readonly PendingEvent[], rt: string): WorldNow {
  const draft = cloneNow(now);
  let n = now.head.n;
  for (const { event: raw, verdict } of outbox) {
    if (draft.events[raw.id] !== undefined) continue;
    n += 1;
    const step: Step = { n, rt, pending: true };
    const decision = decide(draft, raw, step, verdict);
    if (!decision.ok) {
      ignore(draft, raw, step, decision.error.code);
      continue;
    }
    const { event, admission } = decision.value;
    if (admission === "genesis") continue;
    apply(draft, event, step, admission);
    draft.pending += 1;
  }
  return draft;
}

/**
 * D6's opt-in, for the service's chain recorder: whether the world's latest `chain` event says
 * `record: true` (a world without one records nothing).
 */
export function chainRecording(now: Pick<WorldNow, "provenance">): boolean {
  return now.provenance?.record === true;
}

/** How many log entries this build skipped as written by a newer one (D18). */
export function newerCount(now: WorldNow): number {
  return now.ignored.filter((entry) => !entry.pending && NEWER_CODES.has(entry.code)).length;
}

export interface LoreNow {
  /** Live nodes keep their ids; any other is `#<witness event id>:<lore id>` (an "old tale"). */
  node: LoreNode;
  live: boolean;
  witness: string;
}

/** A non-live node, re-identified so it can never collide with a live one in `activate()`. */
function oldTale(node: LoreNode, witness: Folded<WitnessBody>): LoreNode {
  const own = new Set(witness.body.lore.map((one) => one.id));
  const rename = (id: string): string => (own.has(id) ? `#${witness.id}:${id}` : id);
  return { ...node, id: rename(node.id), links: node.links.map(rename) };
}

/**
 * D4 lore view: by chunk (cx, cz), then log order. Live nodes are the lore of a standing chunk's
 * live witness; nodes of legends, variants and fogged live witnesses are old tales with `#` ids.
 * Hidden witnesses are left out, like every view.
 */
export function worldLore(now: WorldNow): LoreNow[] {
  const out: LoreNow[] = [];
  const chunks = Object.values(now.chunks).sort((a, b) => a.cx - b.cx || a.cz - b.cz);
  for (const chunk of chunks) {
    const witnesses = [chunk.live, ...chunk.legends, ...chunk.variants].sort((a, b) => a.n - b.n);
    for (const witness of witnesses) {
      if (now.hidden[witness.id] === true) continue;
      const live = witness.id === chunk.live.id && chunkStands(now, chunk);
      for (const node of witness.body.lore) {
        out.push({ node: live ? node : oldTale(node, witness), live, witness: witness.id });
      }
    }
  }
  return out;
}

/** A place by the id saves and targets use. */
export function placeById(now: WorldNow, id: string): WorldNow["places"][number] | null {
  return now.places.find((place) => place.place === id) ?? null;
}
