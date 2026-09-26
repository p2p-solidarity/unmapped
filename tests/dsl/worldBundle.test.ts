// Verifying a `.world` offline (rev 6 phase 4, D5) — isolated because every failure here is a file
// from someone else (untrusted input), a receipt or hash that must not pass (crypto, silent data
// loss), or a limit a zip bomb would slip past; E2E can export and import a good file, not forge
// a bad one.
//
// Failure modes guarded here (each test names one):
// 1. A listed file whose bytes changed (hash or size) passes.
// 2. An entry the file holds but world.json does not list passes.
// 3. A pack world.json lists or a place names is missing from the file, and the import goes ahead.
// 4. A broken chain passes.
// 5. A receipt under a key the schedule does not give that n passes — among them the entries after
//    a `sequencer` written by an owner removed before it.
// 6. An entry the fold skips is not reported (the report's ignored list is not the fold's).
// 7. A beat that does not recompute over the history before it passes.
// 8. A genesis pack whose manifest is another revision than the genesis names passes.
// 9. A work pack whose licences.json names a picture with another hash passes, so a received
//    world would carry a licence for a picture it does not hold.
// 10. A world on physics this build does not reproduce passes.
// 11. world.json's file list in another order (a locale's collation, not `hashOrder`) passes.
// 12. A zip bomb, or one entry declared larger than a blob, is inflated before it is refused.
// 13. The exporter signs a history that does not verify, or one over 80 MiB.
// 14. A world.json edited after signing still shows a valid signature.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openWorldBundle, readWorldBundle, verifyWorldBundle } from "@dsl/history/worldBundle";
import { type BundleBlob, buildWorldBundle } from "@dsl/history/worldBundleWrite";
import { publishCartridgeRevision, readCartridgeRevision } from "@main/cartridges/store";
import { packCartridgeReproducibly } from "@main/histories/packs";
import { packInstalledWork, packWork } from "@main/works/pack";
import { publishRevision, readRevision, type WorkDirs } from "@main/works/store";
import type { ContentHash } from "@shared/cartridge";
import { hashOrder } from "@shared/hashOrder";
import { computeBeat } from "@shared/history/beat";
import { contentHash, utf8 } from "@shared/history/ids";
import { sequenceEvent, verifyLog, withReceipt } from "@shared/history/log";
import { signText } from "@shared/history/sign";
import type { GenesisBody, LogEntry, StoredEvent } from "@shared/history/types";
import type { WorkRef } from "@shared/works";
import {
  BUNDLE_FILES,
  bundleBlobPath,
  bundleSignText,
  type WorldBundleManifest,
} from "@shared/worldBundle";
import { strFromU8, strToU8, zipSync } from "fflate";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { v2CartridgeInput } from "../fixtures/v2";
import { at, BEN, GENESIS, keyOf, LocalWorld, OWNER, secretOf, sign } from "../service/support";

const inflating = { made: 0 };

vi.mock("fflate", async (original) => {
  const actual = await original<typeof import("fflate")>();
  class CountedInflate extends actual.Inflate {
    constructor(...args: ConstructorParameters<typeof actual.Inflate>) {
      super(...args);
      inflating.made += 1;
    }
  }
  return { ...actual, Inflate: CountedInflate };
});

const MiB = 1024 * 1024;
const S1 = secretOf("service-1");
const S2 = secretOf("service-2");

let root = "";
let genesisPack: BundleBlob;
let otherPack: BundleBlob;
let cartridge: GenesisBody["cartridge"];
let workPack: BundleBlob;
let workRef: WorkRef;

function dirs(base: string): WorkDirs {
  return {
    worksDir: join(base, "works"),
    playsDir: join(base, "work-plays"),
    draftsDir: join(base, "work-drafts"),
  };
}

function blobOf(bytes: Uint8Array): BundleBlob {
  return { hash: contentHash(bytes) as ContentHash, bytes };
}

async function packedCartridge(
  version: string,
): Promise<{ blob: BundleBlob; ref: GenesisBody["cartridge"] }> {
  const dir = join(root, "cartridges");
  const published = await publishCartridgeRevision(dir, v2CartridgeInput(version));
  if (!published.ok) throw new Error(published.error.message);
  const revision = await readCartridgeRevision(dir, "v2-world", version);
  if (!revision.ok) throw new Error(revision.error.message);
  const bytes = packCartridgeReproducibly(revision.value);
  if (!bytes.ok) throw new Error(bytes.error.message);
  const { cartridgeId, contentHash: hash } = revision.value.manifest;
  return { blob: blobOf(bytes.value), ref: { cartridgeId, version, contentHash: hash } };
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "unmapped-world-bundle-"));
  const packed = await packedCartridge("2.0.0");
  genesisPack = packed.blob;
  cartridge = packed.ref;
  otherPack = (await packedCartridge("2.0.1")).blob;
  const boat = strToU8("not really a png, but a picture's bytes");
  const published = await publishRevision(dirs(root), {
    workId: "lantern-hall",
    title: "Lantern Hall",
    description: "A hall of lanterns.",
    content: {
      text: { main: "host.loop(() => {});\n", style: "body { margin: 0; }\n", assets: "{}" },
      images: { "assets/boat.png": boat },
    },
    parent: null,
    draftId: null,
    now: new Date("2026-09-27T08:00:00.000Z"),
    licences: {
      v: 1,
      pictures: {
        "assets/boat.png": {
          sha256: contentHash(boat) as ContentHash,
          licence: "player-supplied",
          inherited: false,
        },
      },
    },
  });
  if (!published.ok) throw new Error(published.error.message);
  const { workId, version, contentHash: hash } = published.value;
  workRef = { workId, version, contentHash: hash };
  const bytes = await packInstalledWork(dirs(root), workRef);
  if (!bytes.ok) throw new Error(bytes.error.message);
  workPack = blobOf(bytes.value);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

beforeEach(() => {
  inflating.made = 0;
});

const signer = {
  key: keyOf(OWNER),
  sign: (manifest: WorldBundleManifest) => signText(OWNER, bundleSignText(manifest)),
};

/** A never-attached world on the v2 cartridge: a note, an otherworld place, one owner, a beat. */
function localWorld(): LocalWorld {
  const world = new LocalWorld({ ...GENESIS, cartridge });
  world.write(
    "note",
    { coord: { cx: 2, cz: 2, x: 4, z: 5 }, anchors: [], text: "hi", contests: null, name: "Ann" },
    OWNER,
    at(0, 5),
  );
  world.write(
    "place",
    {
      kind: "otherworld",
      title: "Lantern Hall",
      at: { cx: 3, cz: 4 },
      seed: 7,
      work: { ...workRef, pack: workPack.hash },
    },
    OWNER,
    at(0, 6),
  );
  world.write("owner.add", { key: keyOf(BEN) }, OWNER, at(0, 7));
  const beat = computeBeat(world.now, at(1));
  if (!beat.ok) throw new Error(beat.error.message);
  world.write("beat", beat.value.body, OWNER, at(1));
  return world;
}

function bundleOf(
  entries: readonly LogEntry[],
  extra: Partial<Parameters<typeof buildWorldBundle>[0]> = {},
) {
  const built = buildWorldBundle({
    entries,
    genesisPack,
    works: [workPack],
    exportedAt: at(2),
    signer,
    ...extra,
  });
  if (!built.ok) throw new Error(`${built.error.code}: ${built.error.message}`);
  const files = readWorldBundle(built.value.bytes);
  if (!files.ok) throw new Error(files.error.message);
  return files.value;
}

function manifestOf(files: ReadonlyMap<string, Uint8Array>): WorldBundleManifest {
  return JSON.parse(
    strFromU8(files.get(BUNDLE_FILES.manifest) ?? new Uint8Array()),
  ) as WorldBundleManifest;
}

/** world.json rewritten by the exporter (so its signature is valid again). */
function resigned(
  files: Map<string, Uint8Array>,
  manifest: WorldBundleManifest,
): Map<string, Uint8Array> {
  files.set(BUNDLE_FILES.manifest, utf8(JSON.stringify(manifest)));
  files.set(
    BUNDLE_FILES.signature,
    utf8(JSON.stringify({ v: 1, key: signer.key, sig: signer.sign(manifest) })),
  );
  return files;
}

/** The log replaced and relisted, as a forger who controls the whole file would write it. */
function withLog(
  base: ReadonlyMap<string, Uint8Array>,
  entries: readonly LogEntry[],
): Map<string, Uint8Array> {
  const files = new Map(base);
  const log = utf8(`${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
  files.set(BUNDLE_FILES.log, log);
  const manifest = manifestOf(files);
  const last = entries[entries.length - 1];
  manifest.head = { n: last?.n ?? 0, chain: last?.chain ?? "" };
  manifest.files = manifest.files.map((file) =>
    file.path === BUNDLE_FILES.log
      ? { ...file, bytes: log.length, sha256: contentHash(log) as ContentHash }
      : file,
  );
  const verified = verifyLog(manifest.worldId, entries);
  if (verified.ok) {
    manifest.services = verified.value.schedule.map((step) => ({
      url: String((entries[step.n - 1]?.event.body as { url?: unknown } | undefined)?.url),
      key: step.key,
      from: step.n,
    }));
  }
  return resigned(files, manifest);
}

const codes = (files: ReadonlyMap<string, Uint8Array>): string[] =>
  verifyWorldBundle(files).problems.map((problem) => problem.code);

/** The world attached to S1 as P3's attach leaves it: 1..k re-receipted, then the owner's s1. */
function attached(world: LocalWorld): LogEntry[] {
  const entries = world.entries.map((entry) => withReceipt(entry, S1));
  const s1 = world.sequencer(keyOf(S1));
  return append(entries, s1, at(1, 30), S1);
}

function append(
  entries: LogEntry[],
  event: StoredEvent,
  rt: string,
  secret: Uint8Array,
): LogEntry[] {
  const last = entries[entries.length - 1];
  if (last === undefined) throw new Error("empty");
  entries.push(sequenceEvent({ n: last.n, chain: last.chain, rt: last.rt }, event, rt, secret));
  return entries;
}

describe("verifyWorldBundle", () => {
  it("passes a file the exporter built, and reports what it holds", () => {
    const world = localWorld();
    const report = verifyWorldBundle(bundleOf(world.entries));
    expect(report.problems).toEqual([]);
    expect(report.signature).toBe("valid");
    expect(report.entries).toBe(world.entries.length);
    expect(report.owners).toEqual([keyOf(BEN), keyOf(OWNER)].sort());
    expect(report.beats).toEqual({ total: 1, mismatched: [] });
    expect(report.works).toBe(1);
    expect(report.services).toEqual([]);
  });

  it("refuses a listed file whose bytes changed (1)", () => {
    const files = new Map(bundleOf(localWorld().entries));
    const log = files.get(BUNDLE_FILES.log) ?? new Uint8Array();
    files.set(BUNDLE_FILES.log, utf8(strFromU8(log).replace('"hi"', '"ho"')));
    expect(codes(files)).toContain("bundle-hash-mismatch");
    const pack = new Uint8Array(files.get(bundleBlobPath(workPack.hash)) ?? []);
    pack[10] = (pack[10] ?? 0) ^ 0xff;
    files.set(bundleBlobPath(workPack.hash), pack);
    expect(
      verifyWorldBundle(files).problems.filter((p) => p.code === "bundle-hash-mismatch"),
    ).toHaveLength(2);
  });

  it("refuses an entry world.json does not list (2)", () => {
    const files = new Map(bundleOf(localWorld().entries));
    const stray = strToU8("a stowaway");
    files.set(bundleBlobPath(contentHash(stray)), stray);
    expect(codes(files)).toContain("bundle-file-unlisted");
  });

  it("refuses a listed pack, or one a place names, that is not in the file (3)", () => {
    const files = new Map(bundleOf(localWorld().entries));
    files.delete(bundleBlobPath(workPack.hash));
    expect(codes(files)).toEqual(
      expect.arrayContaining(["bundle-file-missing", "bundle-blob-missing"]),
    );
    const unlisted = new Map(bundleOf(localWorld().entries, { works: [] }));
    expect(codes(unlisted)).toEqual(["bundle-blob-missing"]);
  });

  it("refuses a broken chain (4)", () => {
    const world = localWorld();
    const entries = world.entries.map((entry) => ({ ...entry }));
    const third = entries[2];
    if (third === undefined) throw new Error("short");
    entries[2] = { ...third, rt: at(0, 9) };
    expect(codes(withLog(bundleOf(world.entries), entries))).toContain("entry-chain-broken");
  });

  it("refuses a receipt the schedule does not give that n (5)", () => {
    const world = localWorld();
    const base = bundleOf(world.entries);
    const good = attached(world);
    append(
      good,
      sign(
        world.id,
        "note",
        {
          coord: { cx: 1, cz: 1, x: 1, z: 1 },
          anchors: [],
          text: "on S1",
          contests: null,
          name: "Ann",
        },
        OWNER,
        good.length,
      ),
      at(1, 40),
      S1,
    );
    expect(codes(withLog(base, good))).toEqual([]);
    const forged = good.map((entry, index) =>
      index === good.length - 1 ? withReceipt(entry, S2) : entry,
    );
    expect(codes(withLog(base, forged))).toContain("entry-rsig-invalid");
  });

  it("does not let a removed owner's sequencer switch the receipt key (5)", () => {
    const world = localWorld();
    const base = bundleOf(world.entries);
    const rehost = (removedFirst: boolean): LogEntry[] => {
      const entries = attached(world);
      if (removedFirst) {
        append(
          entries,
          sign(world.id, "owner.remove", { key: keyOf(BEN) }, OWNER, entries.length),
          at(1, 41),
          S1,
        );
      }
      const s2 = sign(
        world.id,
        "sequencer",
        { url: "ws://127.0.0.1:8789", key: keyOf(S2) },
        BEN,
        entries.length,
      );
      append(entries, s2, at(1, 42), S2);
      const note = {
        coord: { cx: 1, cz: 1, x: 1, z: 1 },
        anchors: [],
        text: "on S2",
        contests: null,
        name: "Ben",
      };
      return append(entries, sign(world.id, "note", note, BEN, entries.length), at(1, 43), S2);
    };
    const coOwner = verifyWorldBundle(withLog(base, rehost(false)));
    expect(coOwner.problems).toEqual([]);
    expect(coOwner.services.map((one) => one.key)).toEqual([keyOf(S1), keyOf(S2)]);
    expect(codes(withLog(base, rehost(true)))).toContain("entry-rsig-invalid");
  });

  it("reports every entry the fold skips (6)", () => {
    const world = localWorld();
    const entries = [...world.entries];
    // An owner kind by someone who owns nothing: signed and chained, never admitted.
    const stranger = secretOf("stranger");
    const bad = sign(world.id, "access", { policy: "public" }, stranger, world.now.head.n);
    const last = entries[entries.length - 1];
    if (last === undefined) throw new Error("empty");
    entries.push(sequenceEvent({ n: last.n, chain: last.chain, rt: last.rt }, bad, at(1, 1), null));
    const report = verifyWorldBundle(withLog(bundleOf(world.entries), entries));
    expect(report.ignored).toEqual([
      { n: entries.length, kind: "access", code: expect.any(String) },
    ]);
    expect(report.problems.map((p) => [p.check, p.code, p.n])).toEqual([
      [3, "bundle-entry-ignored", entries.length],
    ]);
  });

  it("refuses a beat that does not recompute (7)", () => {
    const world = new LocalWorld({ ...GENESIS, cartridge });
    world.write(
      "place",
      {
        kind: "otherworld",
        title: "Lantern Hall",
        at: { cx: 3, cz: 4 },
        seed: 7,
        work: { ...workRef, pack: workPack.hash },
      },
      OWNER,
      at(0, 6),
    );
    const beat = computeBeat(world.now, at(1));
    if (!beat.ok) throw new Error(beat.error.message);
    world.write("beat", { ...beat.value.body, fingerprint: contentHash("forged") }, OWNER, at(1));
    const report = verifyWorldBundle(bundleOf(world.entries));
    expect(report.beats.mismatched).toEqual([world.entries.length]);
    expect(report.problems.map((p) => [p.check, p.code])).toEqual([[4, "bundle-beat-mismatch"]]);
  });

  it("refuses a genesis pack that is another revision than the genesis names (8)", () => {
    expect(codes(bundleOf(localWorld().entries, { genesisPack: otherPack }))).toEqual([
      "bundle-genesis-pack-mismatch",
    ]);
  });

  it("refuses a work pack whose licences name a picture wrongly (9)", async () => {
    const revision = await readRevision(dirs(root), workRef.workId, workRef.version);
    if (!revision.ok) throw new Error(revision.error.message);
    const lying = packWork(revision.value, {
      v: 1,
      pictures: {
        "assets/boat.png": {
          sha256: contentHash("another picture") as ContentHash,
          licence: "player-supplied",
          inherited: false,
        },
      },
    });
    if (!lying.ok) throw new Error(lying.error.message);
    const blob = blobOf(lying.value);
    const world = new LocalWorld({ ...GENESIS, cartridge });
    world.write(
      "place",
      {
        kind: "otherworld",
        title: "Lantern Hall",
        at: { cx: 3, cz: 4 },
        seed: 7,
        work: { ...workRef, pack: blob.hash },
      },
      OWNER,
      at(0, 6),
    );
    expect(codes(bundleOf(world.entries, { works: [blob] }))).toEqual(["work-pack-invalid"]);
  });

  it("refuses a world on physics this build does not reproduce (10)", () => {
    const world = new LocalWorld({ ...GENESIS, cartridge, physicsVersion: 99 });
    const report = verifyWorldBundle(bundleOf(world.entries, { works: [] }));
    expect(report.problems.map((p) => [p.check, p.code])).toEqual([[7, "physics-newer"]]);
  });

  it("refuses a file list in any order but hashOrder (11)", () => {
    const files = new Map(bundleOf(localWorld().entries));
    const manifest = manifestOf(files);
    const danish = new Intl.Collator("da");
    const byLocale = [...manifest.files].sort((a, b) => danish.compare(a.path, b.path));
    const reversed = [...manifest.files].reverse();
    const other = JSON.stringify(byLocale) !== JSON.stringify(manifest.files) ? byLocale : reversed;
    expect(manifest.files.map((f) => f.path)).toEqual(
      manifest.files.map((f) => f.path).sort(hashOrder),
    );
    expect(codes(resigned(files, { ...manifest, files: other }))).toEqual(["bundle-files-order"]);
  });

  it("refuses a world.json edited after it was signed (14)", () => {
    const files = new Map(bundleOf(localWorld().entries));
    const manifest = manifestOf(files);
    files.set(BUNDLE_FILES.manifest, utf8(JSON.stringify({ ...manifest, exportedAt: at(3) })));
    const report = verifyWorldBundle(files);
    expect(report.signature).toBe("invalid");
    expect(report.problems.map((p) => p.code)).toEqual(["bundle-signature-invalid"]);
  });
});

describe("readWorldBundle", () => {
  /** A zip whose central (and local) header declare `declared` bytes for the entry `name`. */
  function lyingZip(name: string, declared: number): Uint8Array {
    const zip = zipSync({ [name]: [strToU8("x".repeat(64)), { level: 6 }] });
    const bytes = new Uint8Array(zip);
    const view = new DataView(bytes.buffer);
    for (let offset = 0; offset + 4 <= bytes.length; offset += 1) {
      const signature = view.getUint32(offset, true);
      if (signature === 0x02014b50) view.setUint32(offset + 24, declared, true);
      if (signature === 0x04034b50) view.setUint32(offset + 22, declared, true);
    }
    return bytes;
  }

  it("refuses a log declared over 80 MiB before inflating anything (12)", () => {
    const read = readWorldBundle(lyingZip(BUNDLE_FILES.log, 81 * MiB));
    expect(read.ok ? null : read.error.code).toBe("bundle-too-large");
    expect(inflating.made).toBe(0);
  });

  it("refuses a pack entry declared over 32 MiB before inflating anything (12)", () => {
    const read = readWorldBundle(lyingZip(`blobs/${"ab".repeat(32)}`, 33 * MiB));
    expect(read.ok ? null : read.error.code).toBe("bundle-too-large");
    expect(inflating.made).toBe(0);
  });

  it("refuses an entry the format does not know before inflating it (12)", () => {
    const read = readWorldBundle(zipSync({ "../../evil": strToU8("x") }));
    expect(read.ok ? null : read.error.code).toBe("bundle-entry-unknown");
    expect(inflating.made).toBe(0);
  });

  it("refuses an entry that inflates to more than it declared (12)", () => {
    const read = readWorldBundle(lyingZip(BUNDLE_FILES.log, 8));
    expect(read.ok ? null : read.error.code).toBe("bundle-archive-invalid");
  });
});

describe("buildWorldBundle", () => {
  it("never signs a history that does not verify, or one over 80 MiB (13)", () => {
    const world = localWorld();
    const entries = world.entries.map((entry, index) =>
      index === 1 ? { ...entry, chain: `sha256:${"0".repeat(64)}` } : entry,
    );
    const broken = buildWorldBundle({
      entries,
      genesisPack,
      works: [workPack],
      exportedAt: at(2),
      signer,
    });
    expect(broken.ok ? null : broken.error.code).toBe("entry-chain-broken");
    const huge = `${world.entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
    const padded = huge.replace("\n", `${" ".repeat(81 * MiB)}\n`);
    const big = buildWorldBundle({
      entries: world.entries,
      logText: padded,
      genesisPack,
      works: [workPack],
      exportedAt: at(2),
      signer,
    });
    expect(big.ok ? null : big.error.code).toBe("world-too-large");
  });

  it("opens with the parts an importer needs", () => {
    const world = localWorld();
    const { opened } = openWorldBundle(bundleOf(world.entries));
    expect(opened?.genesis.id).toBe(world.id);
    expect(opened?.blobs.has(genesisPack.hash)).toBe(true);
    expect(opened?.now.places).toHaveLength(1);
  });
});
