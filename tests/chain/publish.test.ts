// What main sends to `publish`, and from where it takes the hash (on-chain encoding + untrusted IPC).
//
// Ways this can fail:
// 1. A URI of ≤ 400 characters but > 400 UTF-8 bytes (CJK, emoji) passes the app and reverts on
//    chain (`UriTooLong`) after gas estimation — or, cut by characters, lands as a broken link.
// 2. A URI is silently cut instead of refused, so the ledger points at an address nobody wrote.
// 3. A URI of exactly 400 bytes (the contract's limit) is refused by the app.
// 4. The renderer still sends a raw `contentHash`/`parent` and main forwards it: a compromised
//    renderer could claim authorship of any hash, forever (the contract allows one author per hash).
// 5. A subject that is not on disk (or whose files no longer match its hash) still goes out.
// 6. A world's lineage parent is dropped, so a revision is published as a first version.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishOnChainSchema, witnessOnChainSchema } from "@main/chain/ipc";
import { publishArgs } from "@main/chain/ledger";
import { readSubject } from "@main/chain/subjects";
import { publishRevision } from "@main/works/store";
import { LEDGER_URI_MAX, utf8Bytes } from "@shared/chain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const HASH = `sha256:${"ab".repeat(32)}`;
const PARENT = `sha256:${"cd".repeat(32)}`;
const subject = { kind: "world" as const, workId: "w-test", version: "1.0.0" };

describe("the publish URI is measured in bytes, like the contract", () => {
  it("refuses a URI that fits in characters but not in bytes, and never cuts it (1, 2)", () => {
    const cjk = `ipfs://${"潮".repeat(140)}`; // 147 characters, 427 bytes
    expect(cjk.length).toBeLessThan(LEDGER_URI_MAX);
    expect(utf8Bytes(cjk)).toBeGreaterThan(LEDGER_URI_MAX);
    const refused = publishArgs({ contentHash: HASH, parent: null, kind: "world", uri: cjk });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.code).toBe("ledger-uri-too-long");
    expect(publishOnChainSchema.safeParse({ subject, uri: cjk }).success).toBe(false);
  });

  it("sends a URI of exactly the limit unchanged (3)", () => {
    const edge = `https://x/${"é".repeat(195)}`; // 10 + 390 = 400 bytes
    expect(utf8Bytes(edge)).toBe(LEDGER_URI_MAX);
    const args = publishArgs({ contentHash: HASH, parent: PARENT, kind: "world", uri: edge });
    expect(args.ok && args.value).toEqual([
      `0x${"ab".repeat(32)}`,
      `0x${"cd".repeat(32)}`,
      1,
      edge,
    ]);
    expect(publishOnChainSchema.safeParse({ subject, uri: edge }).success).toBe(true);
  });
});

describe("the renderer names a revision; main reads its hash", () => {
  it("refuses payloads that carry a hash or parent of their own (4)", () => {
    expect(
      publishOnChainSchema.safeParse({ subject, uri: "", contentHash: HASH, parent: null }).success,
    ).toBe(false);
    expect(
      publishOnChainSchema.safeParse({ subject: { ...subject, contentHash: HASH }, uri: "" })
        .success,
    ).toBe(false);
    expect(witnessOnChainSchema.safeParse({ contentHash: HASH, note: "I was here." }).success).toBe(
      false,
    );
  });

  let userData = "";
  beforeEach(async () => {
    userData = await mkdtemp(join(tmpdir(), "aether-ledger-"));
  });
  afterEach(async () => {
    await rm(userData, { recursive: true, force: true });
  });

  it("reads hash and parent from the published files, and refuses what is not there (5, 6)", async () => {
    const dirs = {
      worksDir: join(userData, "works"),
      playsDir: join(userData, "work-plays"),
      draftsDir: join(userData, "work-drafts"),
    };
    const content = { text: { main: "host.loop(() => {});", style: "", assets: "{}" }, images: {} };
    const first = await publishRevision(dirs, {
      workId: "w-test",
      title: "Test",
      description: "",
      content,
      parent: null,
      draftId: null,
    });
    if (!first.ok) throw new Error(first.error.message);
    const second = await publishRevision(dirs, {
      workId: "w-test",
      title: "Test",
      description: "",
      content: { ...content, text: { ...content.text, style: "body { margin: 0; }" } },
      parent: {
        workId: "w-test",
        version: first.value.version,
        contentHash: first.value.contentHash,
      },
      draftId: null,
    });
    if (!second.ok) throw new Error(second.error.message);

    const read = await readSubject(userData, join(userData, "cartridges"), {
      kind: "world",
      workId: "w-test",
      version: second.value.version,
    });
    expect(read.ok && read.value).toEqual({
      kind: "world",
      contentHash: second.value.contentHash,
      parent: first.value.contentHash,
    });

    const missing = await readSubject(userData, join(userData, "cartridges"), {
      kind: "world",
      workId: "w-test",
      version: "9.9.9",
    });
    expect(missing.ok).toBe(false);
    const noCartridge = await readSubject(userData, join(userData, "cartridges"), {
      kind: "cartridge",
      cartridgeId: "nowhere",
      version: "1.0.0",
    });
    expect(noCartridge.ok).toBe(false);
  });
});
