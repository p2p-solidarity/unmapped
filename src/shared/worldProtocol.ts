// The world service protocol (rev 6 phase 3, D9, D17): one WebSocket per service (`/v1/ws`), JSON
// text frames of at most 256 KiB, parsed on both sides by these readers. Main treats the service as
// untrusted exactly as the service treats clients: a frame that is too large, not JSON, or not
// exactly one of the messages below is refused whole (`frame-*`); what is inside a well-formed
// frame (events, entries) is then checked by the history readers one by one.
//
// Events travel as stored events (any object with an event id) so the service can answer
// `rejected` for one unknown or invalid event with its id instead of dropping the frame.
//
// Attach (D2): the owner uploads entries 1..k in `attach` frames; the frame with `last: true`
// carries the owner's `sequencer` event naming the service's key, which the service sequences as
// entry k + 1. An invitee opens with `join` (the invite and the proof bound to its own key, D8).

import { z } from "zod";
import { CHAT_MAX_CHARS } from "./continentHello";
import { inviteSchema } from "./history/bodies";
import { storedEventSchema } from "./history/event";
import { AUTHOR_KEY, CHAIN, EVENT_ID, NONCE, SIGNATURE, utf8Length } from "./history/ids";
import { logEntrySchema } from "./history/log";
import type { Head, Invite, LogEntry, StoredEvent, WorldNow } from "./history/types";
import type { AppError } from "./result";
import { err, ok, type Result } from "./result";

/**
 * 2 (phase 4, D5–D6): co-owners (`owner.add`, `owner.remove`) and the chain opt-in (`chain`). A
 * protocol-1 build skips those kinds as "from a newer build", so it would refuse what a co-owner
 * writes and fold such a world differently: the service refuses its `open` (`protocol-newer`).
 */
export const WORLD_PROTOCOL = 2;

/** The oldest protocol a service still serves: worlds without the protocol-2 kinds fold alike. */
export const WORLD_PROTOCOL_MIN = 1;

/** The lowest protocol that folds `now`'s history as this build does. */
export function protocolFor(now: Pick<WorldNow, "owners" | "provenance">): number {
  return Object.keys(now.owners).length > 1 || now.provenance !== null ? 2 : 1;
}

/**
 * Why a client speaking `protocol` may not open or keep reading the world `now` (D5), or null:
 * a protocol this service does not speak (`protocol-unsupported`), or one older than the world's
 * history needs (`protocol-newer`).
 */
export function protocolRefusal(
  now: Pick<WorldNow, "owners" | "provenance">,
  protocol: number,
): AppError | null {
  if (protocol < WORLD_PROTOCOL_MIN || protocol > WORLD_PROTOCOL) {
    return {
      code: "protocol-unsupported",
      message: `This service speaks world protocols ${WORLD_PROTOCOL_MIN}–${WORLD_PROTOCOL}, not ${protocol}.`,
      hint: "Use a build of UNMAPPED that matches the service.",
    };
  }
  const needs = protocolFor(now);
  return protocol >= needs
    ? null
    : {
        code: "protocol-newer",
        message: `This world has co-owners or a chain opt-in (world protocol ${needs}); this build speaks ${protocol}.`,
        hint: "Update UNMAPPED to open it.",
      };
}

export const FRAME_MAX_BYTES = 256 * 1024;

/** D2: the service refuses an attach whose last uploaded rt is further ahead of its clock. */
export const ATTACH_RT_AHEAD_S = 300;

export const FRAME_LIMITS = {
  submitEvents: 16,
  attachEntries: 64,
  pushEntries: 256,
  /** Stream text kept for a late viewer, and the most one delta may carry. */
  streamChars: 64 * 1024,
  physics: 8,
  errorChars: 500,
} as const;

// ── Presence (D17) ───────────────────────────────────────────────────────────────────────────

export const EMOTES = ["wave", "bow", "cheer", "laugh", "heart", "sit"] as const;
export type Emote = (typeof EMOTES)[number];

export const FACINGS = ["north", "south", "east", "west"] as const;
export type Facing = (typeof FACINGS)[number];

/** Where a player stands, in the world's own tiles. Never saved; the name comes from the fold. */
export interface Presence {
  x: number;
  z: number;
  facing: Facing;
  moving: boolean;
  /** The place they are inside, or null on the land. */
  place: string | null;
  /** `n` counts emotes so a repeat shows again and a resend does not. */
  emote: { kind: Emote; n: number } | null;
}

const TILE_BOUND = 40_000 * 32;

export const presenceSchema: z.ZodType<Presence> = z.strictObject({
  x: z.number().min(-TILE_BOUND).max(TILE_BOUND),
  z: z.number().min(-TILE_BOUND).max(TILE_BOUND),
  facing: z.enum(FACINGS),
  moving: z.boolean(),
  place: z
    .string()
    .regex(/^p(?:[0-9]{1,3}|[a-z2-7]{8})$/)
    .nullable(),
  emote: z
    .strictObject({ kind: z.enum(EMOTES), n: z.number().int().min(0).max(0x7fffffff) })
    .nullable(),
});

// ── Chat (simplify-together) ──────────────────────────────────────────────────────────────────
//
// Friends in a shared world talk through its service: `chat` goes up, the service relays it to the
// world's other readers that sent `hear`, and keeps nothing. A service older than CHAT_SERVICE_VERSION
// would read either frame as a protocol violation and close the socket, so main sends them only to a
// service whose challenge says it speaks chat; and the service sends `chat` only to a session that
// said `hear`, so an older app never receives a frame it cannot read.

/** The first `unmapped-service/<n>` that relays chat. */
export const CHAT_SERVICE_VERSION = 2;

/** Whether a service's challenge `version` relays chat (`unmapped-service/2` and later). */
export function serviceSpeaksChat(version: string): boolean {
  const match = /^unmapped-service\/(\d{1,4})$/.exec(version);
  return match !== null && Number(match[1]) >= CHAT_SERVICE_VERSION;
}

// ── Claims (D15) ─────────────────────────────────────────────────────────────────────────────

export type ClaimTarget =
  | `chunk:${number},${number}`
  | `chapter:${string}`
  | `more:${string}`
  | `rumors:${string}`;

export type ClaimSubject =
  | { kind: "chunk"; cx: number; cz: number }
  | { kind: "chapter"; episodeId: string }
  | { kind: "more"; episodeId: string }
  | { kind: "rumors"; beat: string };

const CLAIM =
  /^(?:chunk:(-?\d{1,5}),(-?\d{1,5})|(chapter|more):(e[1-9][0-9]?)|rumors:(h[a-z2-7]{52}))$/;

export function claimTarget(subject: ClaimSubject): ClaimTarget {
  switch (subject.kind) {
    case "chunk":
      return `chunk:${subject.cx},${subject.cz}`;
    case "chapter":
      return `chapter:${subject.episodeId}`;
    case "more":
      return `more:${subject.episodeId}`;
    case "rumors":
      return `rumors:${subject.beat}`;
  }
}

export function parseClaimTarget(target: string): ClaimSubject | null {
  const match = CLAIM.exec(target);
  if (match === null) return null;
  const [, cx, cz, kind, episodeId, beat] = match;
  if (cx !== undefined && cz !== undefined) {
    const coord = { cx: Number(cx), cz: Number(cz) };
    return Math.abs(coord.cx) <= 40_000 && Math.abs(coord.cz) <= 40_000
      ? { kind: "chunk", ...coord }
      : null;
  }
  if ((kind === "chapter" || kind === "more") && episodeId !== undefined) {
    return { kind, episodeId };
  }
  return beat === undefined ? null : { kind: "rumors", beat };
}

const claimTargetSchema = z.custom<ClaimTarget>(
  (value) => typeof value === "string" && parseClaimTarget(value) !== null,
  "must be chunk:cx,cz | chapter:eN | more:eN | rumors:<beat id>",
);

// ── Messages ─────────────────────────────────────────────────────────────────────────────────

export type ToService =
  | { t: "auth"; key: string; sig: string }
  | {
      t: "open";
      world: string;
      have: number;
      chain: string | null;
      protocol: number;
      physics: number[];
      join?: { invite: Invite; proof: string };
    }
  | {
      t: "attach";
      world: string;
      entries: LogEntry[];
      last: boolean;
      /** Present exactly when `last`: the owner's `sequencer` event. */
      sequencer?: StoredEvent;
    }
  | { t: "submit"; world: string; events: StoredEvent[] }
  | { t: "claim"; world: string; target: ClaimTarget }
  | { t: "release"; world: string; target: ClaimTarget }
  | { t: "stream"; world: string; sid: string; k: number; text?: string; end?: StreamEnd }
  | { t: "presence"; world: string; p: Presence | null }
  | { t: "hear"; world: string }
  | { t: "chat"; world: string; text: string }
  | { t: "close"; world: string };

export type OpenedRole = "owner" | "member" | "visitor" | "invitee";
export type ClaimStatus = "granted" | "writing" | "written" | "refused";
export type StreamEnd = "done" | "abort";

export type FromService =
  | { t: "challenge"; nonce: string; key: string; version: string }
  | { t: "opened"; world: string; role: OpenedRole; genesis: StoredEvent; head: Head }
  | { t: "entries"; world: string; entries: LogEntry[]; head: Head }
  | { t: "rejected"; world: string; id: string; error: AppError }
  | {
      t: "claimed";
      world: string;
      target: ClaimTarget;
      status: ClaimStatus;
      sid?: string;
      by?: string;
      n?: number;
      text?: string;
    }
  | {
      t: "stream";
      world: string;
      from: string;
      sid: string;
      k: number;
      text?: string;
      end?: StreamEnd;
    }
  | { t: "presence"; world: string; from: string; p: Presence | null }
  | { t: "chat"; world: string; from: string; text: string }
  | { t: "refused"; world: string; error: AppError };

const world = z.string().regex(EVENT_ID);
const key = z.string().regex(AUTHOR_KEY);
const sid = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const streamText = z.string().max(FRAME_LIMITS.streamChars);
const streamEnd = z.enum(["done", "abort"]);
/** A chat line on the wire; both ends clean it again with `readChatText` before use. */
const chatText = z
  .string()
  .min(1)
  .max(CHAT_MAX_CHARS * 4);
/** chain(0) is the world id itself; later links are sha256 hashes. */
const chainLink = z.union([z.string().regex(CHAIN), z.string().regex(EVENT_ID)]);
const headSchema: z.ZodType<Head> = z.strictObject({ n: count, chain: chainLink });
const errorSchema: z.ZodType<AppError> = z.strictObject({
  code: z.string().min(1).max(64),
  message: z.string().max(FRAME_LIMITS.errorChars),
  hint: z.string().max(FRAME_LIMITS.errorChars).optional(),
});

const toServiceSchema: z.ZodType<ToService> = z.discriminatedUnion("t", [
  z.strictObject({ t: z.literal("auth"), key, sig: z.string().regex(SIGNATURE) }),
  z.strictObject({
    t: z.literal("open"),
    world,
    have: count,
    chain: chainLink.nullable(),
    protocol: z.number().int().min(1).max(1_000),
    physics: z.array(z.number().int().min(1).max(10_000)).min(1).max(FRAME_LIMITS.physics),
    join: z.strictObject({ invite: inviteSchema, proof: z.string().regex(SIGNATURE) }).optional(),
  }),
  z
    .strictObject({
      t: z.literal("attach"),
      world,
      entries: z.array(logEntrySchema).max(FRAME_LIMITS.attachEntries),
      last: z.boolean(),
      sequencer: storedEventSchema.optional(),
    })
    .refine((frame) => frame.last === (frame.sequencer !== undefined), {
      message: "the last attach frame, and only it, carries the sequencer event",
    }),
  z.strictObject({
    t: z.literal("submit"),
    world,
    events: z.array(storedEventSchema).min(1).max(FRAME_LIMITS.submitEvents),
  }),
  z.strictObject({ t: z.literal("claim"), world, target: claimTargetSchema }),
  z.strictObject({ t: z.literal("release"), world, target: claimTargetSchema }),
  z.strictObject({
    t: z.literal("stream"),
    world,
    sid,
    k: count,
    text: streamText.optional(),
    end: streamEnd.optional(),
  }),
  z.strictObject({ t: z.literal("presence"), world, p: presenceSchema.nullable() }),
  z.strictObject({ t: z.literal("hear"), world }),
  z.strictObject({ t: z.literal("chat"), world, text: chatText }),
  z.strictObject({ t: z.literal("close"), world }),
]);

const fromServiceSchema: z.ZodType<FromService> = z.discriminatedUnion("t", [
  z.strictObject({
    t: z.literal("challenge"),
    nonce: z.string().regex(NONCE),
    key,
    version: z.string().min(1).max(40),
  }),
  z.strictObject({
    t: z.literal("opened"),
    world,
    role: z.enum(["owner", "member", "visitor", "invitee"]),
    genesis: storedEventSchema,
    head: headSchema,
  }),
  z.strictObject({
    t: z.literal("entries"),
    world,
    entries: z.array(logEntrySchema).max(FRAME_LIMITS.pushEntries),
    head: headSchema,
  }),
  z.strictObject({
    t: z.literal("rejected"),
    world,
    id: z.string().regex(EVENT_ID),
    error: errorSchema,
  }),
  z.strictObject({
    t: z.literal("claimed"),
    world,
    target: claimTargetSchema,
    status: z.enum(["granted", "writing", "written", "refused"]),
    sid: sid.optional(),
    by: key.optional(),
    n: count.optional(),
    text: streamText.optional(),
  }),
  z.strictObject({
    t: z.literal("stream"),
    world,
    from: key,
    sid,
    k: count,
    text: streamText.optional(),
    end: streamEnd.optional(),
  }),
  z.strictObject({ t: z.literal("presence"), world, from: key, p: presenceSchema.nullable() }),
  z.strictObject({ t: z.literal("chat"), world, from: key, text: chatText }),
  z.strictObject({
    t: z.literal("refused"),
    world: z.union([world, z.literal("")]),
    error: errorSchema,
  }),
]);

function readFrame<T>(frame: string, schema: z.ZodType<T>): Result<T> {
  if (utf8Length(frame) > FRAME_MAX_BYTES) {
    return err("frame-too-large", `A frame may hold at most ${FRAME_MAX_BYTES} bytes.`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(frame);
  } catch {
    return err("frame-not-json", "The frame is not JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (parsed.success) return ok(parsed.data);
  const issue = parsed.error.issues[0];
  return err(
    "frame-invalid",
    `Frame ${issue?.path.join(".") || "message"}: ${issue?.message ?? "not a known message"}`,
  );
}

/** A client's frame, as the service reads it. */
export function readToService(frame: string): Result<ToService> {
  return readFrame(frame, toServiceSchema);
}

/** A service's frame, as main reads it: the service is untrusted too. */
export function readFromService(frame: string): Result<FromService> {
  return readFrame(frame, fromServiceSchema);
}

/** The text of a message, refused if the other side would refuse it for size. */
export function frameText(message: ToService | FromService): Result<string> {
  const text = JSON.stringify(message);
  return utf8Length(text) > FRAME_MAX_BYTES
    ? err("frame-too-large", `A frame may hold at most ${FRAME_MAX_BYTES} bytes.`)
    : ok(text);
}
