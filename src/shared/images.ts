// Image providers and picture licences as the renderer and the published files see them (rev 6
// phase 4, D4). Which model draws is main's choice from `<userData>/images.json`; the renderer only
// picks an id from the list main returns and never names a URL or a key (Rule 6). Every picture a
// revision holds names its licence: a `@shared/licence` record id, `player-supplied` for a file the
// player picked, or `unknown` for a picture from before phase 4. With commercial mode on, a revision
// may not add or change a picture whose licence is not commercial; pictures inherited unchanged
// from its parent are listed, never refused.
//
// Pure: no Node, no DOM.

import { z } from "zod";
import type { ContentHash } from "./cartridge";
import { hashOrder } from "./hashOrder";
import { LICENCE_ID, type LicenceRecord, PLAYER_SUPPLIED, UNKNOWN_LICENCE } from "./licence";
import type { AppError } from "./result";

/** Every image provider this build can use. `openai` keeps its id, so the usage ledger does too. */
export const IMAGE_PROVIDER_IDS = ["openai", "qwen-image-2512", "qwen-image-2.1"] as const;
export type ImageProviderId = (typeof IMAGE_PROVIDER_IDS)[number];

/** On this machine, straight to a provider with the player's key, or through the gateway. */
export type ImageLocality = "local" | "direct" | "hosted";

/**
 * Commercial mode (D4): on when the build sets UNMAPPED_COMMERCIAL=1, or when the configured
 * gateway's `/v1/status` says `commercial: true`. It applies to every player of that build.
 */
export interface CommercialMode {
  on: boolean;
  source: "build" | "gateway" | null;
}

/** What the Settings → Advanced settings → Images panel may know about one provider: never a key. */
export interface ImageProviderInfo {
  id: ImageProviderId;
  model: string;
  /** The model's licence record; `commercial` decides whether it may be chosen in commercial mode. */
  licence: LicenceRecord;
  locality: ImageLocality;
  /** Where requests go (a configured server address, never a secret). */
  endpoint: string;
  /** Where its key comes from: `not-needed` for a keyless server on this computer. */
  key: "saved" | "env" | "unreadable" | "none" | "not-needed";
  /** False in commercial mode for a provider whose licence is not commercial. */
  selectable: boolean;
}

export interface ImageSettings {
  providers: ImageProviderInfo[];
  choice: ImageProviderId;
  commercial: CommercialMode;
  /** Why `images.json` was not used (the choice is then the default); null when it read. */
  problem: AppError | null;
}

/** A provider's test: its server answered, and whether it serves the model (and edits). */
export interface ImageProbe {
  latencyMs: number;
  models: string[];
  /** The provider's model is among `models`. */
  served: boolean;
  /** The server lists `/v1/images/edits` (a reference picture can be used); null = not asked. */
  edits: boolean | null;
}

export const imageChoiceSchema = z.strictObject({
  v: z.literal(1),
  provider: z.enum(IMAGE_PROVIDER_IDS),
});
export type ImageChoice = z.infer<typeof imageChoiceSchema>;

// ── Picture licences ───────────────────────────────────────────────────────────────────────────

/**
 * The file that names every picture's licence: a cartridge's hashed `assets/licences.json`, and a
 * published AI world's main-owned `licences.json` beside its content (outside `contentFiles`).
 */
export const LICENCES_FILE = "licences.json";

/** A picture's licence value: a record id, `player-supplied` or `unknown`. */
export const pictureLicenceSchema = z
  .string()
  .refine(
    (id) => id === PLAYER_SUPPLIED || id === UNKNOWN_LICENCE || LICENCE_ID.test(id),
    "not a licence id",
  );
const HASH = /^sha256:[a-f0-9]{64}$/;

export interface PictureLicence {
  sha256: ContentHash;
  licence: string;
  /** The same bytes were already in the lineage parent (listed in the audit, never refused). */
  inherited: boolean;
}

export interface LicenceFile {
  v: 1;
  /** By the picture's path inside the revision (`look.png`, `assets/boat.png`). */
  pictures: Record<string, PictureLicence>;
}

export const licenceFileSchema = z.strictObject({
  v: z.literal(1),
  pictures: z.record(
    z.string().min(1).max(256),
    z.strictObject({
      sha256: z.custom<ContentHash>((value) => typeof value === "string" && HASH.test(value)),
      licence: pictureLicenceSchema,
      inherited: z.boolean(),
    }),
  ),
});

export function parseLicenceFile(text: string): LicenceFile | null {
  try {
    const parsed = licenceFileSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** May a picture under this licence go into a product that is sold? */
export function licenceCommercial(licence: string, table: ReadonlyMap<string, LicenceRecord>) {
  if (licence === PLAYER_SUPPLIED) return true;
  return table.get(licence)?.commercial === true;
}

/**
 * Names the licence of every picture of a revision about to be published. A picture whose bytes
 * the parent already held is inherited; otherwise its licence is what this device recorded when it
 * drew it or the player picked it, else `unknown`.
 */
export function licencePictures(
  pictures: Record<string, ContentHash>,
  parent: ReadonlyMap<ContentHash, string> | null,
  known: ReadonlyMap<ContentHash, string>,
): LicenceFile {
  const out: Record<string, PictureLicence> = {};
  for (const path of Object.keys(pictures).sort(hashOrder)) {
    const sha256 = pictures[path] as ContentHash;
    const inherited = parent?.has(sha256) === true;
    const licence = known.get(sha256) ?? parent?.get(sha256) ?? UNKNOWN_LICENCE;
    out[path] = { sha256, licence, inherited };
  }
  return { v: 1, pictures: out };
}

export interface LicenceAuditRow {
  path: string;
  licence: string;
  commercial: boolean;
  inherited: boolean;
}

export interface LicenceAudit {
  rows: LicenceAuditRow[];
  commercial: CommercialMode;
  /** Pictures this revision adds or changes that commercial mode refuses ("redraw these"). */
  blocked: string[];
}

export function licenceAudit(
  file: LicenceFile,
  table: ReadonlyMap<string, LicenceRecord>,
  commercial: CommercialMode,
): LicenceAudit {
  const rows = Object.entries(file.pictures)
    .sort(([a], [b]) => hashOrder(a, b))
    .map(([path, picture]) => ({
      path,
      licence: picture.licence,
      commercial: licenceCommercial(picture.licence, table),
      inherited: picture.inherited,
    }));
  const blocked = commercial.on
    ? rows.filter((row) => !row.inherited && !row.commercial).map((row) => row.path)
    : [];
  return { rows, commercial, blocked };
}

/** Which revision an audit reads. */
export type LicenceAuditTarget =
  | { kind: "cartridge"; cartridgeId: string; version: string }
  | { kind: "work"; workId: string; version: string };
