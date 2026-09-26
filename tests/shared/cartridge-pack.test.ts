// Reading a `.cartridge` from elsewhere (rev 6 phase 4, WP "integrity"): a genesis pack a peer
// announced, a file a player picked, a `.world` bundle's pack. Isolated because each failure is
// untrusted input E2E cannot craft, or silent data loss E2E would only see much later.
//
// Failure modes guarded here (each test names one):
// 1. A zip bomb whose central directory honestly declares a huge file is inflated anyway, and the
//    refusal comes only after the memory is spent.
// 2. One entry declared larger than a blob is inflated before it is refused.
// 3. A directory that lies (a small declared size, data that inflates to far more) makes the
//    reader inflate everything the data expands to before noticing.
// 4. A zip64 locator makes the reader follow another central directory than the one it checked.
// 5. An archive larger than a pack blob is read at all.
// 6. Moving the hash maths into @shared changes a shipped revision's content hash, so every save
//    pinned to it stops opening (runtime-pin-mismatch) on the next build.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packCartridge } from "@main/cartridges/pack";
import { listCartridgeRevisions, readCartridgeRevision } from "@main/cartridges/store";
import { ensureBaseGame } from "@main/game/base";
import { CARTRIDGE_PACK_LIMITS, unpackCartridge } from "@shared/cartridgePack";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const inflating = { made: 0, pushes: 0 };

vi.mock("fflate", async (original) => {
  const actual = await original<typeof import("fflate")>();
  class CountedInflate extends actual.Inflate {
    constructor(...args: ConstructorParameters<typeof actual.Inflate>) {
      super(...args);
      inflating.made += 1;
    }
    override push(chunk: Uint8Array, final?: boolean): void {
      inflating.pushes += 1;
      super.push(chunk, final);
    }
  }
  return { ...actual, Inflate: CountedInflate };
});

const MiB = 1024 * 1024;

function code(result: { ok: boolean; error?: { code: string } }): string | null {
  return result.ok ? null : (result.error?.code ?? null);
}

/** Offsets of the end record and every central-directory entry of a zip. */
function directoryOf(zip: Uint8Array): { end: number; entries: number[] } {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = zip.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end -= 1;
  const entries: number[] = [];
  let offset = view.getUint32(end + 16, true);
  for (let index = 0; index < view.getUint16(end + 10, true); index += 1) {
    entries.push(offset);
    offset +=
      46 +
      view.getUint16(offset + 28, true) +
      view.getUint16(offset + 30, true) +
      view.getUint16(offset + 32, true);
  }
  return { end, entries };
}

/** The same zip with every central entry's declared inflated size set to `bytes`. */
function declaring(zip: Uint8Array, bytes: number): Uint8Array {
  const copy = zip.slice();
  const view = new DataView(copy.buffer);
  for (const entry of directoryOf(copy).entries) view.setUint32(entry + 24, bytes, true);
  return copy;
}

beforeEach(() => {
  inflating.made = 0;
  inflating.pushes = 0;
});

describe("a .cartridge from elsewhere", () => {
  it("refuses an honest zip bomb from its directory, inflating nothing (1)", () => {
    const zeros = new Uint8Array(30 * MiB);
    const bomb = zipSync({
      "manifest.json": strToU8("{}"),
      "assets/a.png": zeros,
      "assets/b.png": zeros,
      "assets/c.png": zeros,
    });
    expect(bomb.length).toBeLessThan(MiB);
    expect(code(unpackCartridge(bomb))).toBe("cartridge-pack-too-large");
    expect(inflating.made).toBe(0);
  });

  it("refuses one entry declared larger than a blob before inflating it (2)", () => {
    const small = zipSync({ "manifest.json": strToU8("{}"), "rules.oui": strToU8("root = 1") });
    const oversized = declaring(small, CARTRIDGE_PACK_LIMITS.entryBytes + 1);
    expect(code(unpackCartridge(oversized))).toBe("cartridge-pack-too-large");
    expect(inflating.made).toBe(0);
    const honest = zipSync({
      "assets/big.png": new Uint8Array(CARTRIDGE_PACK_LIMITS.entryBytes + 1),
    });
    expect(code(unpackCartridge(honest))).toBe("cartridge-pack-too-large");
    expect(inflating.made).toBe(0);
  });

  it("stops inflating a lying entry at its declared size (3)", () => {
    const bomb = zipSync({ "rules.oui": new Uint8Array(16 * MiB) });
    const lying = declaring(bomb, 100);
    const read = unpackCartridge(lying);
    expect(code(read)).toBe("cartridge-pack-unreadable");
    // One 8 KiB step of compressed zeros already yields more than the 100 bytes declared.
    expect([inflating.made, inflating.pushes]).toEqual([1, 1]);
  });

  it("refuses a zip64 locator instead of following it (4)", () => {
    const zip = zipSync({ "manifest.json": strToU8("{}") });
    const { end } = directoryOf(zip);
    const locator = new Uint8Array(20);
    new DataView(locator.buffer).setUint32(0, 0x07064b50, true);
    const withLocator = new Uint8Array(zip.length + 20);
    withLocator.set(zip.subarray(0, end), 0);
    withLocator.set(locator, end);
    withLocator.set(zip.subarray(end), end + 20);
    const read = unpackCartridge(withLocator);
    expect(code(read)).toBe("cartridge-pack-duplicate");
    expect(read.ok ? "" : read.error.message).toContain("ZIP64");
  });

  it("refuses an archive larger than a pack blob without reading it (5)", () => {
    const huge = new Uint8Array(CARTRIDGE_PACK_LIMITS.archiveBytes + 1);
    expect(code(unpackCartridge(huge))).toBe("cartridge-pack-too-large");
    expect(inflating.made).toBe(0);
  });
});

describe("the shipped revisions", () => {
  let root = "";
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "unmapped-pack-limits-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("keep the content hashes they were published with, packed and unpacked (6)", async () => {
    const dir = join(root, "cartridges");
    expect((await ensureBaseGame(dir)).ok).toBe(true);
    const listed = await listCartridgeRevisions(dir);
    if (!listed.ok) throw new Error(listed.error.message);
    const hashes = Object.fromEntries(listed.value.map((one) => [one.version, one.contentHash]));
    // Measured on the build before the move (HEAD f764630); never edit, a save pins these.
    expect(hashes).toEqual({
      "1.0.0": "sha256:631536b8c2eaf942d18d421140f82bd66a2e6a03ca8d1ee5f121637df9bf53ed",
      "1.1.0": "sha256:d0b4e02332e42b8182c2629099ea9ffa5d4350c7e87a6e98fa5168114312f0e3",
      "1.2.0": "sha256:d40a3f256ca8e29b8e914f9a7bc5ae7e237641ecc9afbbb3811156066a4dd79d",
      "1.3.0": "sha256:57f17e0d3e1504466da111ee6eae2e55720b812a2b07afdad932e7f72467e81b",
    });
    for (const manifest of listed.value) {
      const revision = await readCartridgeRevision(dir, manifest.cartridgeId, manifest.version);
      if (!revision.ok) throw new Error(revision.error.message);
      const packed = packCartridge(revision.value);
      if (!packed.ok) throw new Error(packed.error.message);
      const unpacked = unpackCartridge(packed.value);
      expect(unpacked.ok && unpacked.value.manifest.contentHash).toBe(manifest.contentHash);
    }
  });
});
