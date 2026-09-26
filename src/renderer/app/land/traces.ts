// Traces (rev 6 phase 3, D3): what anyone who may write a world leaves on its land without a model
// — a signpost (one short line, maybe pointing somewhere) and a gift (an item from the bag, a few
// words, maybe for one person) — and taking a gift. Every write is a history event through
// `appendToWorld`, checked by `writeBlocker` and the door (`mayWrite`: a visitor in a public world
// writes these too); a local-only world writes them the same way, sequenced by this device.
//
// A gift leaves the bag the moment its event is pending or sequenced. Taking one is a race the
// fold decides (first valid take wins): the item enters the bag only once this device's take is
// sequenced as the live one — never while it waits in the outbox — so a take that loses leaves the
// bag unchanged ("someone took it first"). A received gift is recorded in the save's flags, so a
// re-fold or a reopened save never hands it out twice; an offline take is received when its receipt
// arrives (the subscription at the bottom). A gift the world refused comes back when its refusal is
// dismissed.

import { parseItem, serializeItem } from "@dsl";
import { GIFT_ITEM_PREFIX } from "@harness/builtins/worldContext";
import { samplePlayer } from "@renderer/engine/playerProbe";
import type { ChunkMarks, NoteMark, WitnessMark } from "@renderer/history";
import {
  appendToWorld,
  myKey,
  onHistory,
  seenHead,
  worldNow,
  writeBlocker,
} from "@renderer/history";
import { errorLine, translate } from "@renderer/i18n";
import {
  foreignAt,
  openWorld,
  useEngineStore,
  useHistoryStore,
  useSessionStore,
  useWorldStore,
} from "@renderer/state";
import { canonicalJson } from "@shared/canonical";
import { CHUNK_SIZE, type ChunkCoord, chunkKey } from "@shared/chunks";
import { mayWrite } from "@shared/history/access";
import { HISTORY_LIMITS, isOneLine, itemSpecSchema } from "@shared/history/bodies";
import { sameChunk } from "@shared/history/ids";
import type { GiftNow, TileCoord, WorldNow } from "@shared/history/types";
import type { LandNote } from "@shared/land";
import { type AppError, err, ok, type Result } from "@shared/result";
import type { ItemSpec } from "@shared/world";
import type { RefusedEvent } from "@shared/worldApi";

export type TraceKind = "signpost" | "gift" | "gift.take";

const NOT_OPEN: AppError = {
  code: "world-not-open",
  message: "This save's world is not open.",
  hint: "Open it from Worlds → My worlds.",
};

const NOWHERE: AppError = {
  code: "trace-nowhere",
  message: "Signposts and gifts are left on this world's own land.",
  hint: "Walk out onto your world's land first.",
};

// ── Gifts as items ────────────────────────────────────────────────────────────────────────────

/**
 * A taken gift's item in the taker's bag (D5): `gift-` + 8 of the gift's event id, the prefix the
 * world context hides from every prompt (another player's words never become model material).
 */
export function giftItemId(giftId: string): string {
  return `${GIFT_ITEM_PREFIX}${giftId.slice(1, 9)}`;
}

/** The save flag that says this gift is in the bag already (never handed out twice). */
export function receivedFlag(giftId: string): string {
  return `gift:${giftId.slice(1, 9)}`;
}

/** Whether an item can travel as a gift: the Item dialect gives it back unchanged (D5). */
export function giftable(item: ItemSpec): boolean {
  if (!itemSpecSchema.safeParse(item).success) return false;
  const back = parseItem(serializeItem(item));
  return back.ok && canonicalJson(back.value) === canonicalJson(item);
}

/** What a taken gift becomes in the bag. */
export function receivedItem(gift: GiftNow): ItemSpec {
  return { ...gift.body.item, id: giftItemId(gift.id) };
}

/**
 * The gifts `me` took that the bag has not received yet: sequenced live takes only (a pending take
 * may still lose), never a hidden gift, and never one the save's flags already record.
 */
export function giftsToReceive(
  sequenced: WorldNow,
  me: string,
  flags: Readonly<Record<string, unknown>> | undefined,
): GiftNow[] {
  return Object.values(sequenced.gifts)
    .filter(
      (gift) =>
        gift.taken !== null &&
        !gift.taken.pending &&
        gift.taken.by === me &&
        sequenced.hidden[gift.id] !== true &&
        flags?.[receivedFlag(gift.id)] === undefined,
    )
    .sort((a, b) => a.n - b.n);
}

export type TakeOutcome =
  | { kind: "mine" }
  | { kind: "lost" }
  | { kind: "refused"; error: AppError }
  | { kind: "waiting" };

/**
 * How this device's take `takeId` of `giftId` came out, from the sequenced fold and the refused
 * list: ours once the gift is taken by `me` in the sequenced log; lost when someone else's take was
 * sequenced first or the world refused ours because the gift was gone; anything else still waits.
 */
export function giftOutcome(
  sequenced: WorldNow,
  refused: readonly RefusedEvent[],
  giftId: string,
  takeId: string,
  me: string,
): TakeOutcome {
  const taken = sequenced.gifts[giftId]?.taken ?? null;
  if (taken !== null && !taken.pending)
    return taken.by === me ? { kind: "mine" } : { kind: "lost" };
  const refusal = refused.find((one) => one.event.id === takeId);
  if (refusal === undefined) return { kind: "waiting" };
  return refusal.error.code === "gift-taken"
    ? { kind: "lost" }
    : { kind: "refused", error: refusal.error };
}

// ── Where, and whether ────────────────────────────────────────────────────────────────────────

function local(value: number, chunk: number): number {
  return Math.min(CHUNK_SIZE - 1, Math.max(0, Math.floor(value) - chunk * CHUNK_SIZE));
}

/** The tile underfoot on this world's own land, or why no trace can be left here. */
function here(): Result<TileCoord> {
  const chunk = useEngineStore.getState().chunk;
  const where = samplePlayer();
  if (chunk === null || where === null || foreignAt(chunk) !== null) {
    return { ok: false, error: NOWHERE };
  }
  if (useSessionStore.getState().networkRole === "peer") return { ok: false, error: NOWHERE };
  return ok({
    cx: chunk.cx,
    cz: chunk.cz,
    x: local(where.x, chunk.cx),
    z: local(where.z, chunk.cz),
  });
}

/** Why this device cannot write a trace of `kind` in the open world now, or null when it can. */
export function traceBlocker(kind: TraceKind): AppError | null {
  if (!onHistory()) return NOT_OPEN;
  const blocked = writeBlocker();
  if (blocked !== null) return blocked;
  const now = worldNow();
  const me = myKey();
  if (now === null || me === null) return NOT_OPEN;
  const door = mayWrite(now, kind, me);
  return door.ok ? null : door.error;
}

/** Signposts `me` put on chunk `coord`, counted as admit counts them (hidden ones too). */
export function signpostsBy(now: WorldNow, me: string, coord: ChunkCoord): number {
  return now.signposts.filter((sign) => sign.author === me && sameChunk(sign.body.coord, coord))
    .length;
}

// ── Writing ───────────────────────────────────────────────────────────────────────────────────

/** Puts up a signpost on the tile underfoot; resolves with its event id. */
export async function leaveSignpost(
  text: string,
  toward: ChunkCoord | null,
): Promise<Result<string>> {
  const words = text.replace(/\s+/g, " ").trim();
  if (words.length === 0 || words.length > HISTORY_LIMITS.signpostChars || !isOneLine(words)) {
    return err(
      "signpost-length",
      `A signpost holds one line of 1 to ${HISTORY_LIMITS.signpostChars} characters.`,
      "Shorten it.",
    );
  }
  const at = here();
  if (!at.ok) return at;
  const blocked = traceBlocker("signpost");
  if (blocked !== null) return { ok: false, error: blocked };
  const now = worldNow();
  const me = myKey();
  if (
    now !== null &&
    me !== null &&
    signpostsBy(now, me, at.value) >= HISTORY_LIMITS.signpostsPerAuthorChunk
  ) {
    return err(
      "signpost-quota",
      "You already put three signposts on this chunk.",
      "Put the next one on another chunk.",
    );
  }
  const body = { coord: at.value, text: words, toward };
  const appended = await appendToWorld({ kind: "signpost", body, seen: seenHead() });
  return appended.ok ? ok(appended.value.id) : appended;
}

/** Takes `item` out of the bag: the very object when it is still there, else its first equal. */
function takeOutOfBag(item: ItemSpec): void {
  const world = useWorldStore.getState();
  const items = [...world.inventory.items];
  let index = items.indexOf(item);
  if (index < 0) index = items.findIndex((one) => canonicalJson(one) === canonicalJson(item));
  if (index < 0) return;
  items.splice(index, 1);
  world.setInventory({ ...world.inventory, items });
}

function putInBag(items: readonly ItemSpec[]): void {
  if (items.length === 0) return;
  const world = useWorldStore.getState();
  world.setInventory({ ...world.inventory, items: [...world.inventory.items, ...items] });
}

/**
 * Leaves `item` (an object from the bag) on the tile underfoot, with `words`, for `forKey` or
 * anyone; resolves with the gift's event id. The item leaves the bag once the event is written.
 */
export async function leaveGift(
  item: ItemSpec,
  words: string,
  forKey: string | null,
): Promise<Result<string>> {
  if (!useWorldStore.getState().inventory.items.includes(item) || !giftable(item)) {
    return err(
      "gift-item-invalid",
      `The item ${item.id} cannot be given.`,
      "Only an item made in this game can be given.",
    );
  }
  const said = words.trim();
  if (said.length > HISTORY_LIMITS.giftWords) {
    return err("gift-words-length", "A gift's words hold up to 120 characters.", "Shorten them.");
  }
  const at = here();
  if (!at.ok) return at;
  const blocked = traceBlocker("gift");
  if (blocked !== null) return { ok: false, error: blocked };
  const body = { coord: at.value, item, for: forKey, words: said };
  const appended = await appendToWorld({ kind: "gift", body, seen: seenHead() });
  if (!appended.ok) return appended;
  // D3: pending or sequenced, it is on the land now and no longer in the bag.
  takeOutOfBag(item);
  return ok(appended.value.id);
}

/** Gifts whose take this device is waiting on right now (their arrival is told by the panel). */
const taking = new Set<string>();
/** Takes still undecided when `takeGift` returned (sent offline): told once decided, by key. */
const awaited = new Map<string, { worldId: string; giftId: string; takeId: string }>();

/** Resolves once the take is decided (sequenced, or refused), or after `ms` as still waiting. */
async function settledTake(giftId: string, takeId: string, me: string, ms = 10_000) {
  const check = (): TakeOutcome => {
    const open = openWorld();
    return open === null
      ? { kind: "waiting" }
      : giftOutcome(open.sequenced, open.refused, giftId, takeId, me);
  };
  if (check().kind !== "waiting") return check();
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    const stop = useHistoryStore.subscribe(() => {
      if (check().kind !== "waiting") done();
    });
    function done(): void {
      clearTimeout(timer);
      stop();
      resolve();
    }
  });
  return check();
}

/**
 * Takes the gift `giftId` for this device's key. `mine`: the item is in the bag; `lost`: someone
 * took it first (the bag is unchanged); `waiting`: no receipt yet — it is received when one comes.
 */
export async function takeGift(giftId: string): Promise<Result<TakeOutcome>> {
  const now = worldNow();
  const me = myKey();
  if (now === null || me === null) return { ok: false, error: NOT_OPEN };
  const gift = now.gifts[giftId];
  if (gift === undefined || now.hidden[giftId] === true) {
    return err("gift-unknown", "That gift is not in this world.");
  }
  if (gift.taken !== null) {
    if (gift.taken.by !== me) return ok({ kind: "lost" });
    return ok(gift.taken.pending ? { kind: "waiting" } : { kind: "mine" });
  }
  if (gift.body.for !== null && gift.body.for !== me) {
    return err("gift-not-yours", "That gift was left for someone else.");
  }
  const blocked = traceBlocker("gift.take");
  if (blocked !== null) return { ok: false, error: blocked };
  taking.add(giftId);
  try {
    const appended = await appendToWorld({
      kind: "gift.take",
      body: { gift: giftId },
      seen: seenHead(),
    });
    if (!appended.ok) {
      return appended.error.code === "gift-taken" ? ok({ kind: "lost" }) : appended;
    }
    const outcome = await settledTake(giftId, appended.value.id, me);
    const worldId = openWorld()?.worldId;
    if (outcome.kind === "waiting" && worldId !== undefined) {
      awaited.set(`${worldId}|${giftId}`, { worldId, giftId, takeId: appended.value.id });
    }
    receiveGifts();
    return outcome.kind === "refused" ? { ok: false, error: outcome.error } : ok(outcome);
  } finally {
    taking.delete(giftId);
  }
}

/**
 * Puts every gift this device's key took (and the save has not received) into the bag and records
 * it in the save's flags. Only for the save the world store and the open world both hold, once it
 * has hydrated. Returns what it added.
 */
export function receiveGifts(): { gift: GiftNow; item: ItemSpec }[] {
  const open = openWorld();
  const me = open?.status.me ?? null;
  const world = useWorldStore.getState();
  const instanceId = useHistoryStore.getState().instanceId;
  if (open === null || me === null || world.hydrating || world.meta === null) return [];
  if (world.origin?.kind !== "instance" || world.origin.instanceId !== instanceId) return [];
  const due = giftsToReceive(open.sequenced, me, world.meta.flags);
  if (due.length === 0) return [];
  const received = due.map((gift) => ({ gift, item: receivedItem(gift) }));
  putInBag(received.map((one) => one.item));
  const flags = { ...world.meta.flags };
  for (const gift of due) flags[receivedFlag(gift.id)] = true;
  useWorldStore.getState().setMeta({ ...world.meta, flags });
  return received;
}

/** Whether a refusal is of this device's own gift, so dismissing it returns the item. */
export function refusedGiftItem(refused: RefusedEvent, me: string | null): ItemSpec | null {
  const { event } = refused;
  if (event.kind !== "gift" || me === null || event.author !== me) return null;
  const body = event.body as { item?: unknown } | undefined;
  const item = itemSpecSchema.safeParse(body?.item);
  return item.success ? item.data : null;
}

/** Dismisses a refused event (Rule 2: listed until then); a refused gift's item comes back. */
export async function dismissRefused(refused: RefusedEvent): Promise<Result<void>> {
  const open = openWorld();
  if (open === null) return { ok: false, error: NOT_OPEN };
  const done = await window.seed.world.dismissRefused(open.worldId, refused.event.id);
  if (!done.ok) return done;
  const item = refusedGiftItem(refused, open.status.me);
  if (item !== null) putInBag([item]);
  const latest = openWorld();
  if (latest !== null && latest.worldId === open.worldId) {
    const rest = latest.refused.filter((one) => one.event.id !== refused.event.id);
    useHistoryStore.getState().setRefused(open.worldId, rest);
  }
  return ok(undefined);
}

// ── What the panels list ──────────────────────────────────────────────────────────────────────

/** How a note stands in the history, for its line in the notes panel; null: plainly live. */
export type NoteStanding = "pending" | "variant" | "kept" | "local";

export function noteStanding(mark: NoteMark | undefined, onWorld: boolean): NoteStanding | null {
  if (mark === undefined) return onWorld ? "local" : null;
  if (mark.variant) return "variant";
  if (mark.pending) return "pending";
  return mark.via === "continent" ? "kept" : null;
}

/** One telling of a chunk (the standing one or a variant) and the notes left on it. */
export interface Telling {
  mark: WitnessMark;
  notes: number;
}

export interface Tellings {
  live: Telling | null;
  variants: Telling[];
  legends: WitnessMark[];
  /** This device keeps its own older copy (a local variant of the shared one, D6). */
  localCopy: boolean;
}

/** The chunk's tellings as the land store marks them; null when it has none to list. */
export function tellingsOf(
  marks: ChunkMarks | undefined,
  notes: readonly LandNote[],
): Tellings | null {
  if (marks === undefined) return null;
  const count = (id: string): number => notes.filter((note) => note.anchors.includes(id)).length;
  const telling = (mark: WitnessMark): Telling => ({ mark, notes: count(mark.id) });
  const variants = marks.variants.map(telling);
  if (variants.length === 0 && marks.legends.length === 0 && !marks.localCopy) return null;
  return {
    live: marks.live === null || marks.fogged ? null : telling(marks.live),
    variants,
    legends: marks.fogged && marks.live !== null ? [...marks.legends, marks.live] : marks.legends,
    localCopy: marks.localCopy,
  };
}

/** How many other tellings a chunk has (異聞 ×n), this device's own older copy included. */
export function variantCount(marks: ChunkMarks | undefined): number {
  return marks === undefined ? 0 : marks.variants.length + (marks.localCopy ? 1 : 0);
}

/** The name a chunk's legend goes by: while fogged its last look, else its latest legend. */
export function legendName(marks: ChunkMarks | undefined): string | null {
  if (marks === undefined || marks.hidden) return null;
  if (marks.fogged) return marks.live?.name ?? null;
  return marks.legends.at(-1)?.name ?? null;
}

/** Places a new signpost may point to: home and the nearest named chunks, never here. */
export function signpostTargets(
  chunk: ChunkCoord,
  named: Readonly<Record<string, string>>,
): { coord: ChunkCoord; name: string | null }[] {
  const out: { coord: ChunkCoord; name: string | null }[] = [];
  const home = { cx: 0, cz: 0 };
  if (!sameChunk(home, chunk)) out.push({ coord: home, name: null });
  const near = Object.entries(named)
    .map(([key, name]) => {
      const [cx = 0, cz = 0] = key.split(",").map(Number);
      return { coord: { cx, cz }, name, far: Math.abs(cx - chunk.cx) + Math.abs(cz - chunk.cz) };
    })
    .filter((one) => one.far > 0 && !sameChunk(one.coord, home))
    .sort((a, b) => a.far - b.far || (chunkKey(a.coord) < chunkKey(b.coord) ? -1 : 1));
  for (const one of near.slice(0, 5)) out.push({ coord: one.coord, name: one.name });
  return out;
}

// ── Opening the variants from the HUD ─────────────────────────────────────────────────────────

let variantsWanted = false;
let showVariants: (() => void) | null = null;

/** Opens the chunk's 異聞: the notes panel opens on them (or switches to them when it is open). */
export function openVariants(): void {
  if (showVariants !== null) {
    showVariants();
    return;
  }
  variantsWanted = true;
  if (document.pointerLockElement !== null) document.exitPointerLock();
  useSessionStore.getState().toggleNotes(true);
}

/** The panel that shows 異聞 registers here while it is mounted; returns the unregister. */
export function onVariantsRequest(show: () => void): () => void {
  showVariants = show;
  return () => {
    if (showVariants === show) showVariants = null;
  };
}

/** Whether the notes panel was opened to show 異聞 (read once, as it mounts). */
export function takeVariantsRequest(): boolean {
  const wanted = variantsWanted;
  variantsWanted = false;
  return wanted;
}

/**
 * A take sent while the service was away is decided when it comes back: a take that lost the race
 * is told here ("someone took it first"), as is a refusal; a take that won is told by the bag.
 */
function tellAwaited(): void {
  const open = openWorld();
  const me = open?.status.me ?? null;
  if (open === null || me === null) return;
  for (const [key, take] of awaited) {
    if (take.worldId !== open.worldId) continue;
    const outcome = giftOutcome(open.sequenced, open.refused, take.giftId, take.takeId, me);
    if (outcome.kind === "waiting") continue;
    awaited.delete(key);
    const toast = useSessionStore.getState().toast;
    if (outcome.kind === "lost") toast("info", translate("traces.tookFirst"));
    if (outcome.kind === "refused") toast("danger", errorLine(outcome.error));
  }
}

// Gifts taken while offline are received when their receipts arrive; a take the panel is waiting
// on tells its own outcome there.
useHistoryStore.subscribe((state, previous) => {
  if (state.world === previous.world) return;
  for (const { gift, item } of receiveGifts()) {
    if (taking.has(gift.id)) continue;
    useSessionStore.getState().toast("success", translate("traces.tookIt", { item: item.name }));
  }
  tellAwaited();
});
useWorldStore.subscribe((state, previous) => {
  if (previous.hydrating && !state.hydrating) receiveGifts();
});
