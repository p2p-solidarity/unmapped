// `interactive-web@1`: AI-written HTML/CSS/JS worlds that run in the sandboxed work player
// (docs/plans/interactive-web-player.md). A sibling of cartridges, never a Scene DSL program: the
// host knows lifecycle, files, assets, saves and messages — every game rule lives in `main.js`.

import { z } from "zod";
import type { CartridgeFileIntegrity, ContentHash } from "./cartridge";

export const WORK_FORMAT = "interactive-web" as const;
export const WORK_FORMAT_VERSION = 1 as const;
/** Version of the `host` object a world is written against. */
export const WORK_HOST_API = 1 as const;
/** Version of the frame ⇄ host `postMessage` envelope (`ulw`). */
export const WORK_PROTOCOL = 1 as const;
/** Custom scheme main serves work frames from; each session gets its own host (own process). */
export const WORK_SCHEME = "ulwork" as const;

export const WORK_LIMITS = {
  codeBytes: 200_000,
  assetBytes: 2_000_000,
  totalAssetBytes: 6_000_000,
  assetCount: 32,
  stateBytes: 256_000,
  carryBytes: 16_000,
  messageBytes: 300_000,
  messagesPerSecond: 40,
  heartbeatMs: 1_000,
  stallMs: 4_000,
  summaryChars: 500,
  requestChars: 4_000,
  worldsPerPlay: 12,
  candidatesPerDraft: 200,
} as const;

export const WORK_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const DRAFT_ID = /^d-[a-f0-9]{16}$/;
export const PLAY_ID = /^p-[a-f0-9]{16}$/;
export const CANDIDATE_ID = /^c[0-9]{3,4}$/;
export const SESSION_TOKEN = /^w[a-f0-9]{32}$/;
/** A world's own image file. SVG is excluded: it is a document, not a picture. */
export const WORK_ASSET_FILE = /^assets\/[a-z0-9][a-z0-9_-]{0,63}\.(png|jpe?g|webp|gif)$/;
export const ASSET_ID = /^[a-z0-9][a-z0-9_-]{0,47}$/;

export const WORK_CODE_FILES = ["main.js", "style.css", "assets.json"] as const;
export type WorkCodeFile = (typeof WORK_CODE_FILES)[number];

/**
 * Host-provided CC0 images (Ninja Adventure by Pixel-boy, docs/licenses/ninja-adventure-cc0.md).
 * The note is exactly what the model is told, so it must describe the real sheet layout.
 */
export const WORK_LIBRARY = [
  {
    path: "library/ninja_blue.png",
    note: "64×112 character sheet of 16×16 frames. Columns: facing down, up, left, right. Rows 0–3 walk cycle, row 4 attack, row 5 jump, row 6 special.",
  },
  { path: "library/samurai_blue.png", note: "64×112, same layout as ninja_blue (blue samurai)." },
  {
    path: "library/samurai_green.png",
    note: "64×112, same layout as ninja_blue (green samurai).",
  },
  {
    path: "library/heart.png",
    note: "80×16, five 16×16 frames left to right: empty, quarter, half, three-quarter, full heart.",
  },
  {
    path: "library/tileset_floor.png",
    note: "352×417 ground tiles, 16×16 each at (x,y): grass (32,176), stone (224,256), sand (32,16), snow (32,224), wood (208,96), lava (208,384), water (32,352).",
  },
  {
    path: "library/tileset_village_abandoned.png",
    note: "320×192 props at (x,y,w,h): tree (16,96,32,48), rock (96,68,16,16), flower (128,64,16,16), mushroom (144,64,16,16), house (176,96,64,80), crate (80,64,16,16), fence (112,112,16,16), signpost (144,112,16,16).",
  },
] as const;

export type LibraryPath = (typeof WORK_LIBRARY)[number]["path"];

export function isLibraryPath(value: string): value is LibraryPath {
  return WORK_LIBRARY.some((entry) => entry.path === value);
}

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export const jsonSchema: z.ZodType<Json> = z.json() as z.ZodType<Json>;

/** Size of a JSON value as the host stores it; `null` for values JSON cannot represent. */
export function jsonBytes(value: unknown): number | null {
  try {
    const text = JSON.stringify(value);
    return text === undefined ? null : new TextEncoder().encode(text).length;
  } catch {
    return null;
  }
}

export interface WorkAssetEntry {
  /** `library/<file>`, the world's own `assets/<file>`, or null: shown to the player as missing. */
  src: string | null;
  note: string;
}

export type WorkAssetMap = Record<string, WorkAssetEntry>;

export const assetMapSchema = z
  .record(
    z.string().regex(ASSET_ID, "asset ids are lowercase letters, digits, _ or -"),
    z.object({
      src: z
        .string()
        .refine(
          (value) => isLibraryPath(value) || WORK_ASSET_FILE.test(value),
          "src must be a listed library/ path, an assets/ file of this world, or null",
        )
        .nullable(),
      note: z.string().max(300),
    }),
  )
  .refine((map) => Object.keys(map).length <= WORK_LIMITS.assetCount, "too many assets");

/** The three text files a model reads and edits. Image bytes never pass through the model. */
export interface WorkText {
  main: string;
  style: string;
  /** Raw `assets.json` text, validated with `assetMapSchema` before it is stored. */
  assets: string;
}

export function textOf(text: WorkText, file: WorkCodeFile): string {
  return file === "main.js" ? text.main : file === "style.css" ? text.style : text.assets;
}

export function withFile(text: WorkText, file: WorkCodeFile, content: string): WorkText {
  if (file === "main.js") return { ...text, main: content };
  if (file === "style.css") return { ...text, style: content };
  return { ...text, assets: content };
}

export interface WorkRef {
  workId: string;
  version: string;
  contentHash: ContentHash;
}

/**
 * The world (a cartridge revision) an otherworld is being written in. Main resolves it to that
 * world's look picture for the pictures drawn meanwhile; the renderer only ever sends these ids.
 */
export interface WorkLookSource {
  cartridgeId: string;
  version: string;
}

export interface WorkManifestCore {
  format: typeof WORK_FORMAT;
  formatVersion: typeof WORK_FORMAT_VERSION;
  hostApi: typeof WORK_HOST_API;
  workId: string;
  version: string;
  title: string;
  description: string;
  createdAt: string;
  lineage: { kind: "new" | "revision"; parent: WorkRef | null; draftId: string | null };
}

export interface WorkManifest extends WorkManifestCore {
  files: CartridgeFileIntegrity[];
  contentHash: ContentHash;
}

export interface WorkPlayCompletion {
  world: number;
  summary: string;
  at: string;
}

/** Progress for an ordered journey of pinned world revisions. One world = a journey of one. */
export interface WorkPlay {
  formatVersion: 1;
  playId: string;
  title: string;
  worlds: WorkRef[];
  current: number;
  /** Per-world saved state, same order as `worlds`. */
  states: (Json | null)[];
  /** The object that travels from one world to the next. */
  carry: Json | null;
  completions: WorkPlayCompletion[];
  createdAt: string;
  updatedAt: string;
}

/** Every way a journey's progress can change; main validates each one against the play. */
export type PlayChange =
  | { kind: "save"; world: number; state: Json }
  | { kind: "complete"; world: number; summary: string; carry: Json }
  | { kind: "restart"; world: number }
  | { kind: "goto"; world: number };

export type CandidateKind = "generate" | "edit" | "repair" | "asset" | "import";
export type CandidateStatus = "pending" | "playable" | "failed" | "stale" | "cancelled";

export interface CandidateMetrics {
  model: string | null;
  elapsedMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
}

export interface DraftCandidate {
  id: string;
  parent: string | null;
  kind: CandidateKind;
  /** The player's words for this attempt (or the error list for a repair). */
  request: string;
  /** The model's own summary of what it made or changed. */
  summary: string;
  status: CandidateStatus;
  error: string | null;
  /** Files that differ from `parent`. */
  changed: WorkCodeFile[];
  metrics: CandidateMetrics | null;
  createdAt: string;
  settledAt: string | null;
}

export interface WorkDraft {
  formatVersion: 1;
  draftId: string;
  workId: string;
  title: string;
  /** Last candidate that passed the check; the only one Play and Publish ever use. */
  head: string | null;
  candidates: DraftCandidate[];
  published: WorkRef[];
  createdAt: string;
  updatedAt: string;
}

export type WorkSessionSource =
  | { kind: "play"; playId: string }
  | {
      kind: "draft";
      draftId: string;
      candidateId: string;
      state: Json | null;
      carry: Json | null;
    };

export interface WorkSession {
  token: string;
  url: string;
  title: string;
  /** Journey index for play sessions; null for draft previews. */
  world: number | null;
  /** Assets whose src is null or unreadable, so the shell can say so before the world does. */
  missingAssets: string[];
}

const envelope = { ulw: z.literal(WORK_PROTOCOL), token: z.string().regex(SESSION_TOKEN) };

/** Everything a world may say to the host. Anything else is dropped, never interpreted. */
export const frameMessageSchema = z.discriminatedUnion("type", [
  z.object({ ...envelope, type: z.literal("ready"), rendered: z.boolean() }),
  z.object({ ...envelope, type: z.literal("heartbeat") }),
  z.object({ ...envelope, type: z.literal("save"), state: jsonSchema }),
  z.object({
    ...envelope,
    type: z.literal("complete"),
    summary: z.string().max(WORK_LIMITS.summaryChars),
    carry: jsonSchema,
  }),
  z.object({ ...envelope, type: z.literal("status"), text: z.string().max(200) }),
  z.object({
    ...envelope,
    type: z.literal("error"),
    message: z.string().max(2_000),
    file: z.enum(["main.js", "runtime"]),
    line: z.number().int().nullable(),
    column: z.number().int().nullable(),
  }),
  z.object({ ...envelope, type: z.literal("probed") }),
  /**
   * The player pressed Escape inside the world. The frame has keyboard focus while played, so the
   * host never sees that key itself; it answers as if Escape were pressed outside the frame.
   */
  z.object({ ...envelope, type: z.literal("escape") }),
]);

export type FrameMessage = z.infer<typeof frameMessageSchema>;
