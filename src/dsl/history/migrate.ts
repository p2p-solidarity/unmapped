// Migration from a pre-phase-3 save (rev 6 phase 3, D6): the unsigned events that turn one save's
// legacy land into a world's history, the player's `progress.json`, and the source digest
// `world.json` pins. Pure and deterministic — the same files always give byte-identical events —
// and it never writes: main signs the plan (Ed25519 is deterministic) and sequences it.
//
// Order: genesis, pack (not a shipped built-in), profile; one witness per chunk in lore-run order,
// then the rest by (cx, cz); notes in file order; places; story.more; chapters; deeds
// (./migrateLand, ./migrateStory). Every event has `seen: 0` and a fixed `at` (its own time, its
// karma line's, else the genesis `createdAt`).
//
// Nothing is dropped. Every event is admitted against the fold of the plan before it
// (./migratePlanner); one that would not enter the history stays out and is listed in `skipped`
// with its code. A chunk listed there is `legacyOnly`: still drawn on this device from the frozen
// `chunks/` folder. Anything that entered changed (a moved place, a note link to something that
// stayed out) is listed in `adjusted`.

import { bibleLanguage } from "@shared/cartridge";
import type { ChunkCoord } from "@shared/chunks";
import { HISTORY_LIMITS } from "@shared/history/bodies";
import type { GenesisBody, UnsignedEvent, UnsignedEventOf } from "@shared/history/types";
import { physicsOf } from "@shared/physics";
import { err, ok, type Result } from "@shared/result";
import type { WorldProgress } from "@shared/worldProgress";
import { migrateChunks, migrateNotes, migratePlaces } from "./migrateLand";
import { startPlan } from "./migratePlanner";
import { clip, oneLine, put, type Run, SHOWN_CHARS, unsigned } from "./migrateRun";
import {
  type Adjusted,
  cartridgeRefOf,
  legacyOnlyChunks,
  type MigrationFiles,
  type Skipped,
  type SourceDigest,
  sourceDigest,
} from "./migrateSource";
import { migrateChapters, migrateDeeds, migrateMore, progressOf } from "./migrateStory";

export interface MigrationPlan {
  /** The genesis's event id. */
  worldId: string;
  /** Unsigned, in log order, genesis first; main signs and sequences them as they are. */
  events: UnsignedEvent[];
  /** `progress.json`: this player's errands, episodes and places, keyed into the history. */
  progress: WorldProgress;
  source: SourceDigest;
  skipped: Skipped[];
  adjusted: Adjusted[];
  /** The chunks in `skipped`: drawn from the frozen `chunks/` folder on this device only. */
  legacyOnly: ChunkCoord[];
}

/** D1's genesis body, exactly, from the instance meta, the save, the pinned bible and story. */
function genesisOf(files: MigrationFiles): UnsignedEventOf<"genesis"> {
  const { meta, save, cartridge } = files;
  const ref = cartridgeRefOf(meta.runtimePin.cartridge);
  const createdAt = clip(meta.createdAt, SHOWN_CHARS);
  const body: GenesisBody = {
    name: oneLine(meta.name, HISTORY_LIMITS.worldNameChars),
    cartridge: ref,
    seed: save.seed ?? ref.cartridgeId,
    language: save.language ?? bibleLanguage(cartridge.bible) ?? "und",
    physicsVersion: physicsOf(meta.runtimePin),
    createdAt,
    access: "friends",
    gates: (cartridge.story?.episodes ?? []).map(({ id, cx, cz }) => ({ id, cx, cz })),
    from: { instanceId: meta.instanceId },
  };
  return { v: 1, world: "", kind: "genesis", author: files.owner, at: createdAt, seen: 0, body };
}

/** The pack of a revision that is not a shipped built-in, then the owner's display name. */
function migrateHead(run: Run): void {
  const { cartridge, profileName, meta } = run.files;
  if (cartridge.pack !== null) {
    const body = {
      cartridge: meta.runtimePin.cartridge.contentHash,
      pack: cartridge.pack.pack,
      bytes: cartridge.pack.bytes,
    };
    put(run, "pack", "pack", unsigned(run, "pack", body, run.createdAt));
  }
  if (profileName.trim().length === 0) return;
  const name = oneLine(profileName, HISTORY_LIMITS.nameChars);
  const id = put(run, "profile", "profile", unsigned(run, "profile", { name }, run.createdAt));
  if (id !== null && name !== profileName) {
    run.adjusted.push({ what: "profile", key: "profile", code: "name-shortened", detail: name });
  }
}

/**
 * D6: the plan that turns one legacy save into a world's history, its `progress.json` and the
 * source digest. The same files always give the same plan, byte for byte; the files are only read.
 */
export function planMigration(files: MigrationFiles): Result<MigrationPlan> {
  const genesis = genesisOf(files);
  const started = startPlan(genesis);
  if (!started.ok) {
    return err(
      "migration-genesis-invalid",
      `This save cannot become a world: ${started.error.message}`,
      "It still opens from its own files; report the save so its world can be made.",
    );
  }
  const planner = started.value;
  const run: Run = {
    files,
    land: files.save.land,
    planner,
    createdAt: genesis.at,
    karma: files.karma.map((entry) => ({ entry, used: false })),
    skipped: [],
    adjusted: [],
    witnesses: new Map(),
    notes: new Map(),
    places: new Map(),
    more: new Map(),
    chapters: new Map(),
  };
  if (genesis.body.name !== files.meta.name) {
    const detail = genesis.body.name;
    run.adjusted.push({ what: "genesis", key: "name", code: "name-shortened", detail });
  }
  migrateHead(run);
  migrateChunks(run);
  migrateNotes(run);
  migratePlaces(run);
  migrateMore(run);
  migrateChapters(run);
  migrateDeeds(run);
  const progress = progressOf(run);
  if (!progress.ok) return progress;
  return ok({
    worldId: planner.world,
    events: planner.events(),
    progress: progress.value,
    source: sourceDigest(files),
    skipped: run.skipped,
    adjusted: run.adjusted,
    legacyOnly: legacyOnlyChunks(run.skipped),
  });
}
