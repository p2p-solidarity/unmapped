// Blobs and packs (rev 6 phase 3, D10) — isolated because they are untrusted input from a service
// or a disk, and because reproducibility across machines cannot be staged in one E2E run.
//
// Failure modes guarded here (each test names one):
// 1. A blob damaged on disk is served under its name (the store trusts its file names).
// 2. A blob name that is not a content hash reaches the file system (path traversal).
// 3. A work pack whose bytes differ from the announced pack hash is installed.
// 4. A pack with an extra entry, or a file changed and the pack re-zipped, is installed.
// 5. A pack holding another workId@version than its place announced is installed.
// 6. A received work overwrites a local revision with the same workId@version (other content).
// 7. The same revision packs to different bytes (run to run, or machine timezone to timezone),
//    so friends' pack hashes never match and identical revisions do not share a blob.

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blobPath, putBlob, readBlob, verifyBlobBytes } from "@main/blobs/store";
import { publishCartridgeRevision, readCartridgeRevision } from "@main/cartridges/store";
import { packCartridgeReproducibly } from "@main/histories/packs";
import { installWorkPack, packWork, unpackWork } from "@main/works/pack";
import { publishRevision, readRevision, type WorkDirs } from "@main/works/store";
import type { ContentHash } from "@shared/cartridge";
import { contentHash } from "@shared/history/ids";
import { strToU8, unzipSync, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { v2CartridgeInput } from "../fixtures/v2";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "unmapped-blobs-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function code(result: { ok: boolean; error?: { code: string } }): string {
  return result.ok ? "ok" : (result.error?.code ?? "?");
}

function dirs(base = root): WorkDirs {
  return {
    worksDir: join(base, "works"),
    playsDir: join(base, "work-plays"),
    draftsDir: join(base, "work-drafts"),
  };
}

async function publishWork(base: string, main = "host.loop(() => {});\n") {
  const published = await publishRevision(dirs(base), {
    workId: "lantern-hall",
    title: "Lantern Hall",
    description: "A hall of lanterns.",
    content: { text: { main, style: "body { margin: 0; }\n", assets: "{}" }, images: {} },
    parent: null,
    draftId: null,
    now: new Date("2026-09-27T08:00:00.000Z"),
  });
  if (!published.ok) throw new Error(published.error.message);
  const revision = await readRevision(dirs(base), "lantern-hall", published.value.version);
  if (!revision.ok) throw new Error(revision.error.message);
  return revision.value;
}

function packOf(revision: Awaited<ReturnType<typeof publishWork>>): Uint8Array {
  const packed = packWork(revision);
  if (!packed.ok) throw new Error(packed.error.message);
  return packed.value;
}

describe("blob store", () => {
  it("refuses bytes that no longer match their name, and repairs on a good put (1)", async () => {
    const blobs = join(root, "blobs");
    const stored = await putBlob(blobs, strToU8("a pack"));
    if (!stored.ok) throw new Error("expected a blob");
    const path = blobPath(blobs, stored.value.hash) ?? "";
    await writeFile(path, "a pack, edited");
    expect(code(await readBlob(blobs, stored.value.hash))).toBe("blob-tampered");
    expect(code(await putBlob(blobs, strToU8("a pack")))).toBe("ok");
    expect(code(await readBlob(blobs, stored.value.hash))).toBe("ok");
    expect(code(verifyBlobBytes(strToU8("other"), stored.value.hash))).toBe("blob-tampered");
  });

  it("never turns a name that is not a content hash into a path (2)", async () => {
    const blobs = join(root, "blobs");
    expect(blobPath(blobs, "../../device.key")).toBeNull();
    expect(code(await readBlob(blobs, "sha256:../../etc"))).toBe("blob-hash-invalid");
  });
});

describe("work packs", () => {
  it("installs a received pack only when its bytes are the announced pack (3)", async () => {
    const sender = await publishWork(join(root, "a"));
    const bytes = packOf(sender);
    const ref = { ...refOf(sender), pack: contentHash(bytes) as ContentHash };
    const flipped = new Uint8Array(bytes);
    flipped[flipped.length - 30] = (flipped[flipped.length - 30] ?? 0) ^ 0xff;
    expect(code(await installWorkPack(dirs(join(root, "b")), flipped, ref))).toBe(
      "work-pack-invalid",
    );
    const installed = await installWorkPack(dirs(join(root, "b")), bytes, ref);
    expect(installed.ok && installed.value.installed).toBe(true);
    const again = await installWorkPack(dirs(join(root, "b")), bytes, ref);
    expect(again.ok && again.value.installed).toBe(false);
  });

  it("refuses an extra entry and a changed file even when re-zipped and re-announced (4)", async () => {
    const sender = await publishWork(join(root, "a"));
    const files = unzipSync(packOf(sender));
    const extra = zipSync({ ...files, "notes.txt": strToU8("hello") });
    const edited = zipSync({ ...files, "main.js": strToU8("host.loop(() => { steal(); });\n") });
    for (const bytes of [extra, edited]) {
      const ref = { ...refOf(sender), pack: contentHash(bytes) as ContentHash };
      expect(code(await installWorkPack(dirs(join(root, "b")), bytes, ref))).toBe(
        "work-pack-invalid",
      );
    }
    expect(code(await readRevision(dirs(join(root, "b")), "lantern-hall", "1.0.0"))).toBe(
      "work-missing",
    );
  });

  it("refuses a pack that holds another revision than announced (5)", async () => {
    const sender = await publishWork(join(root, "a"));
    const bytes = packOf(sender);
    const ref = { ...refOf(sender), version: "1.0.1", pack: contentHash(bytes) as ContentHash };
    expect(code(await installWorkPack(dirs(join(root, "b")), bytes, ref))).toBe(
      "work-pack-invalid",
    );
  });

  it("never overwrites a local revision with the same id and version (6)", async () => {
    const sender = await publishWork(join(root, "a"));
    const local = await publishWork(join(root, "b"), "host.loop(() => { mine(); });\n");
    const bytes = packOf(sender);
    const before = await readFile(join(root, "b", "works", "lantern-hall", "1.0.0", "main.js"));
    const ref = { ...refOf(sender), pack: contentHash(bytes) as ContentHash };
    expect(code(await installWorkPack(dirs(join(root, "b")), bytes, ref))).toBe(
      "work-version-conflict",
    );
    const after = await readFile(join(root, "b", "works", "lantern-hall", "1.0.0", "main.js"));
    expect(after.equals(before)).toBe(true);
    expect(local.manifest.contentHash).not.toBe(sender.manifest.contentHash);
  });

  it("packs one revision to the same bytes run to run and zone to zone (7)", async () => {
    const revision = await publishWork(root);
    const zone = process.env.TZ;
    try {
      process.env.TZ = "America/Los_Angeles";
      const west = packOf(revision);
      process.env.TZ = "Asia/Tokyo";
      const east = packOf(revision);
      expect(contentHash(east)).toBe(contentHash(west));
      expect(contentHash(packOf(revision))).toBe(contentHash(west));
      expect(code(unpackWork(west))).toBe("ok");
    } finally {
      if (zone === undefined) delete process.env.TZ;
      else process.env.TZ = zone;
    }
  });
});

describe("cartridge packs", () => {
  it("packs one revision to the same bytes zone to zone (7)", async () => {
    const cartridges = join(root, "cartridges");
    const published = await publishCartridgeRevision(cartridges, v2CartridgeInput());
    if (!published.ok) throw new Error(published.error.message);
    const revision = await readCartridgeRevision(cartridges, "v2-world", "2.0.0");
    if (!revision.ok) throw new Error(revision.error.message);
    const zone = process.env.TZ;
    try {
      process.env.TZ = "Pacific/Honolulu";
      const west = packCartridgeReproducibly(revision.value);
      process.env.TZ = "Pacific/Kiritimati";
      const east = packCartridgeReproducibly(revision.value);
      if (!west.ok || !east.ok) throw new Error("expected packs");
      expect(contentHash(east.value)).toBe(contentHash(west.value));
    } finally {
      if (zone === undefined) delete process.env.TZ;
      else process.env.TZ = zone;
    }
  });
});

function refOf(revision: Awaited<ReturnType<typeof publishWork>>) {
  const { workId, version, contentHash: hash } = revision.manifest;
  return { workId, version, contentHash: hash };
}
