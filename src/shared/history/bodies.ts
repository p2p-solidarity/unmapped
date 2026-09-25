// zod schemas for every event body (rev 6 phase 3, D3) and the size caps of D5. Every schema is
// strict and transform-free: the parsed value is the value the author hashed, so a parsed event
// verifies exactly like the raw one. Shapes come from the existing shared types (land, lore,
// places, story, works, world) and their enums; the land schemas here mirror
// `main/instances/land.ts`, which can import them from here once DSL validation moves (WP2).
//
// DSL-bearing checks (programs parse, the index matches the program, dialogues pair up) are not
// here: they are `validateEventBody` in src/dsl (WP2). History-dependent checks are ./admit.

import { z } from "zod";
import type { ContentHash } from "../cartridge";
import { CHAPTER_KINDS, CHAPTER_LIMITS } from "../chapter";
import { NOTE_MAX_CHARS } from "../land";
import { LORE_KINDS, type LoreNode } from "../lore";
import { PLACE_KINDS, PLACE_LIMITS } from "../places";
import { STORY_LIMITS, storyEpisodeSchema } from "../story";
import { WORK_ID } from "../works";
import { ITEM_KINDS, type ItemSpec, NPC_ROLES } from "../world";
import { AUTHOR_KEY, CHAIN, CONTENT_HASH, EVENT_ID, ISO_TIME, NONCE, SIGNATURE } from "./ids";
import {
  ACCESS_POLICIES,
  type ChapterBody,
  DEED_WHATS,
  type EventBodies,
  type EventKind,
  type Invite,
  type RumorSlot,
  type TileCoord,
} from "./types";

export const HISTORY_LIMITS = {
  /** Canonical JSON of a whole event, in UTF-8 bytes. */
  eventBytes: 128 * 1024,
  /** Per-field caps are in characters (UTF-16 units), like every other text limit in the repo. */
  witnessSceneChars: 64 * 1024,
  witnessDialogues: 12,
  witnessDialogueChars: 8 * 1024,
  witnessErrandsChars: 16_000,
  witnessLore: 8,
  witnessNpcs: 12,
  witnessErrands: 12,
  witnessKeepsakes: 12,
  nameChars: 60,
  /** A world's own name (the genesis): as long as an instance's name may be. */
  worldNameChars: 120,
  noteChars: NOTE_MAX_CHARS,
  signpostChars: 40,
  giftWords: 120,
  rumorChars: 200,
  urlChars: 200,
  visitChunks: 64,
  inviteUses: { min: 1, max: 20 },
  /** Per world (D5): members, and places (`PLACE_LIMITS.max`, now counted per world). */
  members: 64,
  places: PLACE_LIMITS.max,
  signpostsPerAuthorChunk: 3,
  rumorSlots: 6,
  beatFog: 4096,
  /** A pack blob (D9: each blob ≤ 32 MiB). */
  packBytes: 32 * 1024 * 1024,
  /** A place's `at` stays within this many chunks of the origin (`place-spot-far`). */
  placeReach: 64,
} as const;

const NPC_ID = /^[a-z][a-z0-9_]{0,31}$/;
const LOCAL_ID = /^[a-z0-9][a-z0-9_]{0,47}$/;
const LORE_ID = /^[a-z][a-z0-9_]{0,31}@-?\d{1,5},-?\d{1,5}$/;
const EPISODE_ID = /^e[1-9][0-9]?$/;
const LEGACY_PLACE_ID = /^p[0-9]{1,3}$/;
const ERRAND_REF = /^h[a-z2-7]{52}:[a-z0-9][a-z0-9_]{0,47}$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const CHUNK_KEY = /^-?\d{1,5},-?\d{1,5}$/;

/** One line of text: no control or line-separator characters. */
export function isOneLine(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029) return false;
  }
  return true;
}

const line = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine(isOneLine, "must be one line")
    .refine((text) => text.trim().length > 0, "must not be blank");

const coord = z.number().int().min(-40_000).max(40_000);
const localTile = z.number().int().min(0).max(31);
const uint32 = z.number().int().min(0).max(0xffffffff);
const hash = z.custom<ContentHash>(
  (value) => typeof value === "string" && CONTENT_HASH.test(value),
  "must be sha256:<64 hex>",
);
const eventId = z.string().regex(EVENT_ID);
const authorKey = z.string().regex(AUTHOR_KEY);
const isoTime = z
  .string()
  .regex(ISO_TIME)
  .refine((text) => Number.isFinite(Date.parse(text)), "must be a real time");
/** Display-only clocks (`at`, `createdAt`): any short text, since migration copies old ones. */
const shownTime = z.string().min(1).max(40);

export const chunkCoordSchema = z.strictObject({ cx: coord, cz: coord });
export const tileCoordSchema: z.ZodType<TileCoord> = z.strictObject({
  cx: coord,
  cz: coord,
  x: localTile,
  z: localTile,
});

const serviceUrl = z
  .string()
  .max(HISTORY_LIMITS.urlChars)
  .refine(isServiceUrl, "must be wss://, or ws:// on loopback");

/** `wss://…` anywhere, `ws://` only on loopback (the `keyEndpointAllowed` rule). */
export function isServiceUrl(text: string): boolean {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return false;
  }
  if (url.username !== "" || url.password !== "") return false;
  if (url.protocol === "wss:") return url.hostname.length > 0;
  return (
    url.protocol === "ws:" && ["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname)
  );
}

export const loreNodeSchema: z.ZodType<LoreNode> = z.strictObject({
  id: z.string().regex(LORE_ID),
  kind: z.enum(LORE_KINDS),
  label: z.string().min(1).max(60),
  text: z.string().max(400),
  coord: chunkCoordSchema,
  links: z.array(z.string().max(48)).max(16),
  tone: z.number().min(-1).max(1),
});

export const itemSpecSchema: z.ZodType<ItemSpec> = z.strictObject({
  id: z.string().min(1).max(64),
  name: line(HISTORY_LIMITS.nameChars),
  kind: z.enum(ITEM_KINDS),
  power: z.number().min(0).max(100),
  perk: z.string().max(200),
  curse: z.string().max(200).nullable(),
  meshDna: z.array(z.string().max(40)).max(16),
  archetype: z.array(z.string().max(40)).max(8),
  flavor: z.string().max(400),
});

export const inviteSchema: z.ZodType<Invite> = z.strictObject({
  v: z.literal(1),
  world: eventId,
  svc: serviceUrl,
  by: authorKey,
  key: authorKey,
  nonce: z.string().regex(NONCE),
  exp: isoTime,
  uses: z.number().int().min(HISTORY_LIMITS.inviteUses.min).max(HISTORY_LIMITS.inviteUses.max),
  sig: z.string().regex(SIGNATURE),
});

const words = (maxKeys: number, maxChars: number, key: z.ZodString) =>
  z
    .record(key, z.string().min(1).max(maxChars))
    .refine((map) => Object.keys(map).length <= maxKeys, `at most ${maxKeys} residents`);

const unique = (ids: readonly string[]): boolean => new Set(ids).size === ids.length;

const genesis = z.strictObject({
  name: line(HISTORY_LIMITS.worldNameChars),
  cartridge: z.strictObject({
    cartridgeId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
    version: z.string().regex(SEMVER),
    contentHash: hash,
  }),
  seed: z.string().min(1).max(96),
  language: z.string().min(1).max(35).regex(/^\S+$/),
  physicsVersion: z.number().int().min(1).max(10_000),
  createdAt: shownTime,
  access: z.enum(ACCESS_POLICIES),
  gates: z
    .array(
      z.strictObject({
        id: z.string().regex(EPISODE_ID),
        cx: z.number().int().min(-64).max(64),
        cz: z.number().int().min(-64).max(64),
      }),
    )
    .max(STORY_LIMITS.maxEpisodes)
    .refine((gates) => unique(gates.map((gate) => gate.id)), "gate ids must be unique"),
  from: z
    .strictObject({
      instanceId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,95}$/),
      world: eventId.optional(),
      head: z
        .strictObject({
          n: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
          chain: z.union([z.string().regex(CHAIN), eventId]),
        })
        .optional(),
    })
    .refine((from) => (from.world === undefined) === (from.head === undefined), {
      message: "an adopted world names both the old world and its head",
    }),
});

const witness = z.strictObject({
  cx: coord,
  cz: coord,
  scene: z.string().min(1).max(HISTORY_LIMITS.witnessSceneChars),
  dialogues: z
    .record(z.string().regex(NPC_ID), z.string().max(HISTORY_LIMITS.witnessDialogueChars))
    .refine(
      (map) => Object.keys(map).length <= HISTORY_LIMITS.witnessDialogues,
      `at most ${HISTORY_LIMITS.witnessDialogues} dialogues`,
    ),
  errands: z.string().min(1).max(HISTORY_LIMITS.witnessErrandsChars).optional(),
  lore: z.array(loreNodeSchema).max(HISTORY_LIMITS.witnessLore),
  index: z.strictObject({
    name: line(HISTORY_LIMITS.nameChars),
    npcs: z
      .array(
        z.strictObject({
          id: z.string().regex(NPC_ID),
          name: line(HISTORY_LIMITS.nameChars),
          role: z.enum(NPC_ROLES),
        }),
      )
      .max(HISTORY_LIMITS.witnessNpcs)
      .refine((npcs) => unique(npcs.map((npc) => npc.id)), "resident ids must be unique"),
    errands: z
      .array(
        z.strictObject({
          id: z.string().regex(LOCAL_ID),
          giver: z.string().regex(NPC_ID),
          place: z.string().regex(LORE_ID).nullable(),
          reward: z.string().min(1).max(64),
        }),
      )
      .max(HISTORY_LIMITS.witnessErrands)
      .refine((errands) => unique(errands.map((errand) => errand.id)), "errand ids must be unique"),
    keepsakes: z
      .array(
        z.strictObject({ id: z.string().min(1).max(64), name: line(HISTORY_LIMITS.nameChars) }),
      )
      .max(HISTORY_LIMITS.witnessKeepsakes),
  }),
  supersedes: eventId.optional(),
});

const workPack = z.strictObject({
  workId: z.string().regex(WORK_ID),
  version: z.string().regex(SEMVER),
  contentHash: hash,
  pack: hash,
});

/**
 * A resident's key in a place's or chapter's words: its NPC id (free in the Scene dialect, ≤ 64).
 * Keys that name Object.prototype's own members are refused, so no program can smuggle one in.
 */
const residentKey = z
  .string()
  .min(1)
  .max(64)
  .refine((key) => !["__proto__", "constructor", "prototype"].includes(key), "reserved key");

const place = z
  .strictObject({
    kind: z.enum(PLACE_KINDS),
    title: line(PLACE_LIMITS.titleChars),
    at: chunkCoordSchema,
    seed: uint32,
    source: z.string().min(1).max(PLACE_LIMITS.sourceChars).optional(),
    dialogues: words(PLACE_LIMITS.residents, PLACE_LIMITS.dialogueChars, residentKey).optional(),
    work: workPack.optional(),
    legacyId: z.string().regex(LEGACY_PLACE_ID).optional(),
  })
  .refine(
    (body) =>
      body.kind === "otherworld"
        ? body.work !== undefined && body.source === undefined && body.dialogues === undefined
        : body.work === undefined && body.source !== undefined,
    "an otherworld carries only its work; a course or dungeon carries its source",
  );

const chapterHead = {
  episodeId: z.string().regex(EPISODE_ID),
  title: line(STORY_LIMITS.titleChars),
  more: eventId.nullable(),
};

const chapter: z.ZodType<ChapterBody> = z.union([
  z.strictObject({
    ...chapterHead,
    kind: z.enum(CHAPTER_KINDS),
    source: z.string().min(1).max(CHAPTER_LIMITS.sourceChars),
    dialogues: words(PLACE_LIMITS.residents, PLACE_LIMITS.dialogueChars, residentKey).optional(),
    seed: uint32,
  }),
  z.strictObject({ ...chapterHead, kind: z.literal("work"), work: workPack }),
  z.strictObject({ ...chapterHead, kind: z.literal("closed") }),
]);

const note = z.strictObject({
  coord: tileCoordSchema,
  anchors: z.array(eventId).max(8),
  text: z
    .string()
    .min(1)
    .max(HISTORY_LIMITS.noteChars)
    .refine((text) => text.trim().length > 0, "must not be blank"),
  contests: eventId.nullable(),
  name: line(HISTORY_LIMITS.nameChars),
  via: z.literal("continent").optional(),
});

const rumorSlot: z.ZodType<RumorSlot> = z.strictObject({
  slot: z
    .number()
    .int()
    .min(0)
    .max(HISTORY_LIMITS.rumorSlots - 1),
  cite: eventId,
  place: eventId.nullable(),
  listener: z.strictObject({ cx: coord, cz: coord, npc: z.string().regex(NPC_ID) }),
});

const deed = z
  .strictObject({ what: z.enum(DEED_WHATS), ref: z.string().min(1).max(120) })
  .refine(
    (body) => (body.what === "errand.done" ? ERRAND_REF : EVENT_ID).test(body.ref),
    "ref must be an event id (errand.done: <witness id>:<errand id>)",
  );

export const BODY_SCHEMAS: { [K in EventKind]: z.ZodType<EventBodies[K]> } = {
  genesis,
  access: z.strictObject({ policy: z.enum(ACCESS_POLICIES) }),
  sequencer: z.strictObject({ url: serviceUrl, key: authorKey }),
  pack: z.strictObject({
    cartridge: hash,
    pack: hash,
    bytes: z.number().int().min(1).max(HISTORY_LIMITS.packBytes),
  }),
  hide: z.strictObject({ id: eventId, hidden: z.boolean() }),
  "invite.revoke": z.strictObject({ nonce: z.string().regex(NONCE) }),
  "member.remove": z.strictObject({ key: authorKey }),
  "member.join": z.strictObject({
    invite: inviteSchema,
    name: line(HISTORY_LIMITS.nameChars),
    proof: z.string().regex(SIGNATURE),
  }),
  profile: z.strictObject({ name: line(HISTORY_LIMITS.nameChars) }),
  witness,
  place,
  chapter,
  "story.more": z.strictObject({ episode: storyEpisodeSchema }),
  note,
  signpost: z.strictObject({
    coord: tileCoordSchema,
    text: line(HISTORY_LIMITS.signpostChars),
    toward: chunkCoordSchema.nullable(),
  }),
  gift: z.strictObject({
    coord: tileCoordSchema,
    item: itemSpecSchema,
    for: authorKey.nullable(),
    words: z.string().max(HISTORY_LIMITS.giftWords),
  }),
  "gift.take": z.strictObject({ gift: eventId }),
  visit: z.strictObject({
    chunks: z.array(chunkCoordSchema).min(1).max(HISTORY_LIMITS.visitChunks),
  }),
  deed,
  beat: z.strictObject({
    upTo: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    at: isoTime,
    season: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    fog: z.array(z.string().regex(CHUNK_KEY)).max(HISTORY_LIMITS.beatFog),
    slots: z.array(rumorSlot).max(HISTORY_LIMITS.rumorSlots),
    fingerprint: z.string().regex(CONTENT_HASH),
  }),
  rumor: z.strictObject({
    beat: eventId,
    slot: z
      .number()
      .int()
      .min(0)
      .max(HISTORY_LIMITS.rumorSlots - 1),
    text: line(HISTORY_LIMITS.rumorChars),
  }),
};
