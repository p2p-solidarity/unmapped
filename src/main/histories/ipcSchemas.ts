// zod schemas for every `window.seed.world.*` payload (rev 6 phase 3, D11; Rule 6: the renderer is
// untrusted, so main checks every argument, and a draft's body is checked per kind with the same
// schemas the history reads events with). Each is a tuple of the handler's arguments, so arity is
// checked too (`handle`, main/handle.ts).

import { BODY_SCHEMAS, isOneLine, isServiceUrl } from "@shared/history/bodies";
import { EVENT_ID } from "@shared/history/ids";
import { ACCESS_POLICIES } from "@shared/history/types";
import { DRAFT_KINDS, type StreamFrame, type WorldDraft } from "@shared/worldApi";
import {
  type ClaimTarget,
  FRAME_LIMITS,
  parseClaimTarget,
  presenceSchema,
} from "@shared/worldProtocol";
import { z } from "zod";

const worldId = z.string().regex(EVENT_ID);
const eventId = z.string().regex(EVENT_ID);
const instanceId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,95}$/);
const displayName = z
  .string()
  .min(1)
  .max(60)
  .refine(isOneLine, "must be one line")
  .refine((text) => text.trim().length > 0, "must not be blank");
const seen = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

const [firstKind, ...otherKinds] = DRAFT_KINDS;
const draftOf = <K extends (typeof DRAFT_KINDS)[number]>(kind: K) =>
  z.strictObject({ kind: z.literal(kind), body: BODY_SCHEMAS[kind], seen });

/** A renderer draft: one of the kinds the renderer may write, its body checked for that kind. */
export const worldDraftSchema = z.discriminatedUnion("kind", [
  draftOf(firstKind),
  ...otherKinds.map(draftOf),
]) as unknown as z.ZodType<WorldDraft>;

const claimTarget = z.custom<ClaimTarget>(
  (value) => typeof value === "string" && parseClaimTarget(value) !== null,
  "must be chunk:cx,cz | chapter:eN | more:eN | rumors:<beat id>",
);

export const streamFrameSchema: z.ZodType<StreamFrame> = z.strictObject({
  sid: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  k: seen,
  text: z.string().max(FRAME_LIMITS.streamChars).optional(),
  end: z.enum(["done", "abort"]).optional(),
});

const serviceUrl = z.string().max(200).refine(isServiceUrl, "must be wss://, or ws:// on loopback");

export const worldIpcSchemas = {
  ensure: z.tuple([instanceId, displayName]),
  read: z.tuple([worldId]),
  close: z.tuple([worldId]),
  append: z.tuple([worldId, worldDraftSchema]),
  claim: z.tuple([worldId, claimTarget]),
  release: z.tuple([worldId, claimTarget]),
  sendStream: z.tuple([worldId, streamFrameSchema]),
  sendPresence: z.tuple([worldId, presenceSchema.nullable()]),
  attach: z.tuple([worldId, serviceUrl]),
  invite: z.tuple([
    worldId,
    z.strictObject({
      uses: z.number().int().min(1).max(20),
      days: z.number().int().min(1).max(30),
    }),
  ]),
  setAccess: z.tuple([worldId, z.enum(ACCESS_POLICIES)]),
  hide: z.tuple([worldId, eventId, z.boolean()]),
  dismissRefused: z.tuple([worldId, eventId]),
  join: z.union([
    z.tuple([z.string().min(1).max(8000), displayName]),
    z.tuple([z.string().min(1).max(8000), displayName, instanceId]),
  ]),
} as const;
