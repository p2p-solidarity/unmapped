// What a migration reads and what it reports (rev 6 phase 3, D6): the legacy save's files as main
// hands them over, the digest `world.json` pins them by, and the list of everything that stayed
// out of the history. Pure: main does every read, this only hashes and describes.

import { canonicalJson } from "@shared/canonical";
import type {
  CartridgeRef,
  ContentHash,
  InstanceMeta,
  SaveState,
  WorldBible,
} from "@shared/cartridge";
import type { ChunkCoord } from "@shared/chunks";
import { contentHash, sha256Hex } from "@shared/history/ids";
import type { LandRecord } from "@shared/land";
import type { StoryPlan } from "@shared/story";
import type { KarmaEntry } from "@shared/world";

/** A file's bytes as main read them (text is hashed as UTF-8). */
export type FileBytes = Uint8Array | string;

/** The source files themselves, for the digest (D6 "Commit"). */
export interface LegacySources {
  /** Every file under the save's `chunks/`, path relative to it ("3_-2/scene.oui"). */
  chunkFiles: readonly { path: string; bytes: FileBytes }[];
  /** `lore.jsonl` / `notes.jsonl`; null when the file is absent. */
  lore: FileBytes | null;
  notes: FileBytes | null;
}

/** Everything `planMigration` reads, all from disk (D1: one instance always yields one genesis). */
export interface MigrationFiles {
  /** The device key that will sign every event: the world's owner. */
  owner: string;
  /** The display name the renderer passed to `ensure`; blank writes no `profile` event. */
  profileName: string;
  meta: Pick<InstanceMeta, "instanceId" | "name" | "createdAt" | "runtimePin">;
  save: Pick<SaveState, "seed" | "language" | "land">;
  /** The private ledger, in file order: it dates witnesses and deeds and tells own notes apart. */
  karma: readonly KarmaEntry[];
  /** The pinned revision's bible (its language) and story (its gates). */
  cartridge: {
    bible: WorldBible | null;
    story: Pick<StoryPlan, "episodes"> | null;
    /** The revision's pack, when it is not a shipped built-in (then a `pack` event announces it). */
    pack: { pack: ContentHash; bytes: number } | null;
  };
  /** Work packs main made, keyed `<workId>@<version>`, for otherworlds and AI-work chapters. */
  workPacks: Readonly<Record<string, { contentHash: ContentHash; pack: ContentHash }>>;
  /** The witnessed land as `readLand` returns it. */
  land: LandRecord;
  sources: LegacySources;
}

/**
 * The legacy files a migration was planned from (D6): counts, plus sha256 of `chunks/` (one
 * `path:sha256` line per file, code-unit sorted), `lore.jsonl`, `notes.jsonl`, and the canonical
 * JSON of the legacy land fields. A later open that computes another digest runs the catch-up.
 */
export interface SourceDigest {
  counts: {
    chunks: number;
    lore: number;
    notes: number;
    places: number;
    storyMore: number;
    episodes: number;
    errands: number;
  };
  chunks: ContentHash;
  lore: ContentHash;
  notes: ContentHash;
  land: ContentHash;
}

export type MigratedWhat =
  | "pack"
  | "profile"
  | "chunk"
  | "lore"
  | "note"
  | "place"
  | "story.more"
  | "chapter"
  | "deed"
  | "errand";

/**
 * Something that stayed out of the history, one by one (D6 "Nothing is dropped"). A chunk here is
 * `legacyOnly`: still drawn on this device from the frozen `chunks/` folder. `key` names it in its
 * own terms: "cx,cz", a lore or note id, a place id, an episode id, an errand key, a karma line.
 */
export interface Skipped {
  what: MigratedWhat;
  key: string;
  code: string;
  message: string;
}
/**
 * Something that entered the history changed, and why: a moved place, a dangling note link, a lore
 * link into a chunk that stayed out (the frozen `chunks/` folder keeps it as it was).
 */
export interface Adjusted {
  what: "note" | "place" | "genesis" | "profile" | "chunk";
  key: string;
  code:
    | "note-anchor-missing"
    | "note-contests-missing"
    | "place-moved"
    | "name-shortened"
    | "lore-link-missing";
  detail: string;
}

const hashLines = (lines: readonly string[]): ContentHash =>
  contentHash(lines.join("\n")) as ContentHash;

/** D6's `SourceDigest` of a legacy save; deterministic for the same files. */
export function sourceDigest(
  input: Pick<MigrationFiles, "save" | "land" | "sources">,
): SourceDigest {
  const land = input.save.land;
  const chunkLines = input.sources.chunkFiles
    .map((file) => `${file.path}:${sha256Hex(file.bytes)}`)
    .sort();
  return {
    counts: {
      chunks: input.land.chunks.length,
      lore: input.land.lore.length,
      notes: input.land.notes.length,
      places: land?.places?.length ?? 0,
      storyMore: land?.storyMore?.length ?? 0,
      episodes: Object.keys(land?.episodes ?? {}).length,
      errands: Object.keys(land?.errands ?? {}).length,
    },
    chunks: hashLines(chunkLines),
    lore: contentHash(input.sources.lore ?? "") as ContentHash,
    notes: contentHash(input.sources.notes ?? "") as ContentHash,
    land: contentHash(
      canonicalJson({
        places: land?.places,
        storyMore: land?.storyMore,
        episodes: land?.episodes,
        errands: land?.errands,
      }),
    ) as ContentHash,
  };
}

/** Whether two digests name the same files (`world.json` against a fresh one: catch-up). */
export function sameSource(a: SourceDigest, b: SourceDigest): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

/** The chunks a plan left to the frozen folder, from its `skipped` list. */
export function legacyOnlyChunks(skipped: readonly Skipped[]): ChunkCoord[] {
  return skipped
    .filter((one) => one.what === "chunk")
    .map((one) => {
      const [cx = 0, cz = 0] = one.key.split(",").map(Number);
      return { cx, cz };
    });
}

/** The genesis's cartridge: exactly the three fields of a `CartridgeRef`. */
export function cartridgeRefOf(ref: CartridgeRef): CartridgeRef {
  return { cartridgeId: ref.cartridgeId, version: ref.version, contentHash: ref.contentHash };
}
