// The legacy land fixture (rev 6 phase 3, E2E "Fixture"): a save of the built-in world exactly as
// a phase-2 build (commit 7cebb2f) writes and reads it, made from the committed programs and data
// in tests/fixtures/legacy-land/ with no model. The migration flows (`migrate`, `older-build`,
// `backup`, `migrated-share`, `continent`) start from it.
//
//   bun --tsconfig-override tsconfig.node.json scripts/fixtures/legacy-land.ts <userData> [--seed <text>]
//
// It installs the pinned built-in revision (aether-land 1.3.0, through main's own publisher, whose
// output is byte-identical to phase 2's) and writes the instance, its save and the AI worlds it
// points at. It never writes a phase-3 file (no world.json, progress.json or histories/) and never
// overwrites anything. It prints a JSON manifest: the ids, the counts per kind, the oversized
// chunk and the sha256 of every file. Two runs with the same seed write the same bytes; the seed
// only stands in for what phase 2 draws at random (see ./legacyLand/seeded.ts).
//
// What the save holds (tests/fixtures/legacy-land/land.json and save/):
// - four witnessed chunks with lore, dialogues and errands; 1,1 is deliberately oversized — 13
//   errands and 13 keepsakes, over HISTORY_LIMITS.witnessErrands / witnessKeepsakes, which phase 2
//   never capped — so migration leaves it `legacyOnly`. (No chunk phase 2's DSL round-trips can
//   reach the 128 KiB event cap.)
// - notes: the owner's, a continent visitor's (no karma line of its own), one contesting the
//   visitor's, and one anchored to the oversized chunk's lore;
// - a course place (p1) whose chunk the land's next chapter later took as its gate (phase 2 never
//   checked), and an otherworld (p2) with its published work, draft and journey;
// - the story: e1 played as an AI work (draftId / work / playId, Rule 13's older saves — the
//   built-in world never shipped such chapters, the shape is what matters), e2 and e3 land
//   chapters cleared, `storyMore` e4 (a climb) written ahead with its stage;
// - one item carried (the oversized chunk's first keepsake, errand done) and one on the home
//   shelf, both keepsakes that survive the Item dialect, so a gift needs no model;
// - karma for all of it, in the lines phase 2 (and, for e1, the build before it) wrote.

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseErrands } from "@dsl/index";
import { publishCartridgeInputSchema } from "@main/cartridges/schemas";
import { publishCartridgeRevision } from "@main/cartridges/store";
import builtIn130 from "@main/game/aether-land-1.3.0.json";
import { HISTORY_LIMITS } from "@shared/history/bodies";
import { Writer } from "./legacyLand/files";
import { carriedItems } from "./legacyLand/items";
import { type LandFixture, writeSave } from "./legacyLand/save";
import { seeded } from "./legacyLand/seeded";
import { type FixtureWork, type InstalledWork, installWork } from "./legacyLand/works";

const FIXTURE = resolve(import.meta.dirname, "../../tests/fixtures/legacy-land");
const DEFAULT_SEED = "legacy-land";
const OVERSIZED = "1_1";

function usage(message: string): never {
  console.error(`${message}\nusage: legacy-land.ts <userData> [--seed <text>]`);
  process.exit(2);
}

function args(argv: string[]): { userData: string; seed: string } {
  let seed = DEFAULT_SEED;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (arg === "--seed") {
      seed = argv[i + 1] ?? usage("--seed needs a value");
      i += 1;
    } else if (arg.startsWith("--")) usage(`unknown option ${arg}`);
    else rest.push(arg);
  }
  if (rest.length !== 1 || rest[0] === undefined) usage("give exactly one userData directory");
  if (seed.trim() === "") usage("--seed must not be empty");
  return { userData: resolve(rest[0]), seed };
}

/** The pinned built-in revision, installed by main's publisher; a no-op when already there. */
async function installCartridge(writer: Writer, land: LandFixture): Promise<void> {
  const input = publishCartridgeInputSchema.safeParse(builtIn130);
  if (!input.success) throw new Error("The shipped aether-land 1.3.0 no longer parses.");
  const manifest = await publishCartridgeRevision(join(writer.root, "cartridges"), input.data);
  if (!manifest.ok) throw new Error(`Installing aether-land 1.3.0: ${manifest.error.message}`);
  const pinned = land.runtimePin.cartridge;
  if (
    manifest.value.cartridgeId !== pinned.cartridgeId ||
    manifest.value.version !== pinned.version ||
    manifest.value.contentHash !== pinned.contentHash
  ) {
    throw new Error(
      `The installed built-in revision is ${manifest.value.contentHash}; the fixture pins ` +
        `${pinned.contentHash}. The publisher no longer writes phase 2's bytes.`,
    );
  }
  await writer.record(join("cartridges", pinned.cartridgeId, pinned.version));
}

async function oversized(): Promise<{ errands: number; keepsakes: number }> {
  const source = await readFile(join(FIXTURE, "save", "chunks", OVERSIZED, "errands.oui"), "utf8");
  const read = parseErrands(source);
  if (!read.ok)
    throw new Error(`The oversized chunk's errands no longer parse: ${read.error.message}`);
  const counts = { errands: read.value.errands.length, keepsakes: read.value.keepsakes.length };
  if (
    counts.errands <= HISTORY_LIMITS.witnessErrands ||
    counts.keepsakes <= HISTORY_LIMITS.witnessKeepsakes
  ) {
    throw new Error(
      `The oversized chunk has ${counts.errands} errands and ${counts.keepsakes} keepsakes, no ` +
        `longer over the history caps (${HISTORY_LIMITS.witnessErrands} / ` +
        `${HISTORY_LIMITS.witnessKeepsakes}). Grow tests/fixtures/legacy-land/save/chunks/${OVERSIZED}/errands.oui.`,
    );
  }
  return counts;
}

const lines = (text: string): number =>
  text.split("\n").filter((line) => line.trim() !== "").length;

async function main(): Promise<void> {
  const { userData, seed } = args(process.argv.slice(2));
  const land = JSON.parse(await readFile(join(FIXTURE, "land.json"), "utf8")) as LandFixture & {
    works: Record<string, FixtureWork>;
  };
  const writer = new Writer(userData);
  const ids = seeded(seed);
  try {
    const big = await oversized();
    await installCartridge(writer, land);
    const works: Record<string, InstalledWork> = {};
    for (const [name, work] of Object.entries(land.works)) {
      works[name] = await installWork(writer, FIXTURE, name, work, ids);
    }
    const written = await writeSave(writer, FIXTURE, land, ids, works);
    const save = written.save as Parameters<typeof carriedItems>[1] & {
      land: { errands: object; episodes: object; places: unknown[]; storyMore: unknown[] };
    };
    const items = await carriedItems(FIXTURE, save);
    const saveDir = join(FIXTURE, "save");
    const chunkKeys = Object.keys(writer.manifest())
      .map((path) => /\/chunks\/(-?\d+)_(-?\d+)\/scene\.oui$/.exec(path))
      .flatMap((match) => (match === null ? [] : [`${match[1]},${match[2]}`]));
    const manifest = {
      fixture: "legacy-land",
      format: "phase 2 (7cebb2f)",
      seed,
      userData,
      instanceId: written.instanceId,
      saveId: written.saveId,
      name: written.name,
      seedCode: written.seedCode,
      player: land.player,
      cartridge: land.runtimePin.cartridge,
      counts: {
        chunks: chunkKeys.length,
        lore: lines(await readFile(join(saveDir, "lore.jsonl"), "utf8")),
        notes: land.notes.length,
        places: save.land.places.length,
        storyMore: save.land.storyMore.length,
        episodes: Object.keys(save.land.episodes).length,
        errands: Object.keys(save.land.errands).length,
        karma: lines(await readFile(join(saveDir, "karma.jsonl"), "utf8")),
      },
      oversizedChunk: {
        key: OVERSIZED.replace("_", ","),
        ...big,
        caps: {
          witnessErrands: HISTORY_LIMITS.witnessErrands,
          witnessKeepsakes: HISTORY_LIMITS.witnessKeepsakes,
        },
      },
      items,
      notes: written.noteIds,
      works,
      files: writer.manifest(),
    };
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } catch (error) {
    await writer.rollback();
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

await main();
