// A game being made in Create a game, before anything is published: the idea, the world bible
// the player is reviewing, and the story's chapters as they edit them. Stored by main as a draft
// kind of its own under <userData>/workspaces/ (Rule 9: durable state never lives in
// localStorage), autosaved on every change, and published only by Build. Main validates every
// draft it reads or is sent against these schemas — a draft file is untrusted input.

import { z } from "zod";
import { BIBLE_PARTS, bibleFieldsSchema } from "./bible";
import { STORY_LIMITS } from "./story";

export const CREATE_DRAFT_FORMAT = 1 as const;

// `look` sits between the world and the story (rev 6 phase 2); a draft saved before it still reads.
export const CREATE_STEPS = ["idea", "world", "look", "story", "build"] as const;
export type CreateStep = (typeof CREATE_STEPS)[number];

export const DRAFT_ID = /^[a-z0-9]{8,32}$/;
const LANGUAGE_TAG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

const fightsSchema = z.enum(["none", "gun", "blade"]);
const languageSchema = z.string().max(35).regex(LANGUAGE_TAG);

export const draftIdeaSchema = z
  .object({
    name: z.string().max(60),
    intent: z.string().max(400),
    /** The player's own story: optional material for the chapters. */
    story: z.string().max(STORY_LIMITS.storyChars),
    language: languageSchema,
    play: z.object({ fights: fightsSchema, weapon: z.string().max(40) }).strict(),
  })
  .strict();
export type DraftIdea = z.infer<typeof draftIdeaSchema>;

/**
 * The parts of the idea a world was written from. A change to the intent, the material, the
 * language or the play style makes it "needs updating"; the name is kept (older drafts have it)
 * but never compared — renaming a world does not make it stale.
 */
const worldBasisSchema = z
  .object({
    name: z.string().max(60),
    intent: z.string().max(400),
    material: z.string().max(STORY_LIMITS.storyChars),
    language: languageSchema,
    fights: fightsSchema,
  })
  .strict();
export type WorldBasis = z.infer<typeof worldBasisSchema>;

const draftWorldSchema = z
  .object({
    fields: bibleFieldsSchema,
    /** Cards the player changed by hand since the model last wrote them. */
    edited: z.array(z.enum(BIBLE_PARTS)).max(BIBLE_PARTS.length),
    basis: worldBasisSchema,
    /** Bumped each time the whole world is written again; a story remembers the one it fits. */
    rev: z.number().int().min(1).max(1_000_000),
    /** Cards the model never overwrites. Absent in drafts saved before locks: none locked. */
    locked: z.array(z.enum(BIBLE_PARTS)).max(BIBLE_PARTS.length).optional(),
  })
  .strict();
export type DraftWorld = z.infer<typeof draftWorldSchema>;

/** One concept picture's id: its file is `looks/<id>.png` in the draft's workspace folder. */
export const LOOK_PICTURE_ID = /^[a-f0-9]{16}$/;
/** Pictures a draft keeps at once: a redraw discards every one but the chosen. */
export const LOOK_PICTURES_MAX = 12;
/** How many concept pictures one "draw" asks for. */
export const LOOK_DRAWS = 3;
/** Bytes of one concept picture (a PNG); larger files are refused on write and on read. */
export const LOOK_PICTURE_MAX_BYTES = 4 * 1024 * 1024;

export const draftLookSchema = z
  .object({
    pictures: z.array(z.string().regex(LOOK_PICTURE_ID)).max(LOOK_PICTURES_MAX),
    chosen: z.string().regex(LOOK_PICTURE_ID).nullable(),
    /** The player went on without a picture; the world is then published with none. */
    skipped: z.boolean().optional(),
  })
  .strict()
  .refine((look) => look.chosen === null || look.pictures.includes(look.chosen), {
    message: "The chosen picture is not one of the draft's pictures.",
  });
export type DraftLook = z.infer<typeof draftLookSchema>;

/** A concept picture as the renderer sees it: its id and a data URL, never a file path (Rule 6). */
export interface LookPicture {
  id: string;
  dataUrl: string;
}

export const draftChapterSchema = z
  .object({
    /** Stable across moves, so an edit or a reply lands on the chapter it was meant for. */
    key: z.string().regex(/^[a-z0-9]{1,16}$/),
    title: z.string().max(STORY_LIMITS.titleChars),
    place: z.string().max(STORY_LIMITS.placeChars),
    kind: z.string().max(STORY_LIMITS.kindChars),
    brief: z.string().max(STORY_LIMITS.briefChars),
    /** Never overwritten by the model. */
    locked: z.boolean(),
    /** Changed by hand since the model last wrote it. */
    edited: z.boolean(),
  })
  .strict();
export type DraftChapter = z.infer<typeof draftChapterSchema>;

const storyBasisSchema = z
  .object({
    language: languageSchema,
    fights: fightsSchema,
    material: z.string().max(STORY_LIMITS.storyChars),
    worldRev: z.number().int().min(1).max(1_000_000),
  })
  .strict();
export type StoryBasis = z.infer<typeof storyBasisSchema>;

const draftStorySchema = z
  .object({
    logline: z.string().max(STORY_LIMITS.loglineChars),
    loglineEdited: z.boolean(),
    chapters: z.array(draftChapterSchema).max(STORY_LIMITS.maxEpisodes),
    basis: storyBasisSchema,
  })
  .strict();
export type DraftStory = z.infer<typeof draftStorySchema>;

export const createDraftSchema = z
  .object({
    formatVersion: z.literal(CREATE_DRAFT_FORMAT),
    draftId: z.string().regex(DRAFT_ID),
    step: z.enum(CREATE_STEPS),
    idea: draftIdeaSchema,
    world: draftWorldSchema.nullable(),
    story: draftStorySchema.nullable(),
    /** The look step's concept pictures. Absent in drafts saved before it. */
    look: draftLookSchema.optional(),
    createdAt: z.string().max(40),
    updatedAt: z.string().max(40),
  })
  .strict();
export type CreateDraft = z.infer<typeof createDraftSchema>;

/** One row of the Create entry: a draft to continue, or a file that no longer reads. */
export type CreateDraftEntry =
  | {
      draftId: string;
      broken: false;
      name: string;
      step: CreateStep;
      chapters: number;
      updatedAt: string;
    }
  | { draftId: string; broken: true; problem: string };
