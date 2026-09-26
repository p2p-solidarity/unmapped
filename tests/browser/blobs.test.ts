// Blobs fetched by the browser proof (rev 6 phase 4, D7; P3 D9–D10): a pack is asked for by its
// hash and kept only if the bytes hash to it. Isolated because an E2E against an honest service
// never sees altered bytes.
//
// Ways it could fail, each guarded below:
//   1. bytes with one bit flipped accepted under the hash they were asked for;
//   2. another blob's bytes accepted (a service answering with the wrong file);
//   3. a hash that is not "sha256:<64 lowercase hex>" asked for or accepted;
//   4. a body larger than a pack may be (32 MiB) hashed and kept;
//   5. a service answer that is not 200 kept as if it were the blob;
//   6. the request signed for another path than the one fetched, so the service refuses it.

import { contentHash } from "@shared/history/ids";
import { authorKeyFor, readBlobAuth, signText } from "@shared/history/sign";
import { describe, expect, it } from "vitest";
import { BLOB_MAX_BYTES, blobPathOf, fetchBlob, verifyBlob } from "../../src/browser/blobs";
import type { BrowserSigner } from "../../src/browser/signer";

const WORLD = `h${"q".repeat(52)}`;
const bytes = new TextEncoder().encode("a cartridge pack, as a service stores it");
const HASH = contentHash(bytes);
const SECRET = Uint8Array.from({ length: 32 }, (_, i) => 255 - i);
const signer: BrowserSigner = {
  author: authorKeyFor(SECRET),
  sign: async (text) => signText(SECRET, text),
};

const code = (result: { ok: boolean; error?: { code: string } }) =>
  result.ok ? "ok" : result.error?.code;

describe("verifyBlob", () => {
  it("keeps bytes only under their own hash (1, 2, 3, 4)", () => {
    expect(verifyBlob(bytes, HASH)).toEqual({ ok: true, value: bytes });
    const flipped = bytes.slice();
    flipped[7] = (flipped[7] ?? 0) ^ 1;
    expect(code(verifyBlob(flipped, HASH))).toBe("blob-tampered");
    expect(code(verifyBlob(new TextEncoder().encode("another pack"), HASH))).toBe("blob-tampered");
    for (const bad of [HASH.toUpperCase(), HASH.slice(7), `sha1:${"a".repeat(40)}`, ""]) {
      expect(code(verifyBlob(bytes, bad))).toBe("blob-hash-invalid");
    }
    const huge = new Uint8Array(BLOB_MAX_BYTES + 1);
    expect(code(verifyBlob(huge, contentHash(huge)))).toBe("blob-too-large");
  });
});

describe("fetchBlob", () => {
  const answer =
    (body: Uint8Array, status = 200, seen: Request[] = []): typeof fetch =>
    async (input, init) => {
      seen.push(new Request(input, init));
      return new Response(new Uint8Array(body), { status });
    };

  it("signs the exact path it fetches, and refuses altered or failed answers (1, 5, 6)", async () => {
    const seen: Request[] = [];
    const got = await fetchBlob(
      "ws://127.0.0.1:8797",
      WORLD,
      HASH,
      signer,
      answer(bytes, 200, seen),
    );
    expect(got).toEqual({ ok: true, value: bytes });
    const request = seen[0] as Request;
    const path = blobPathOf(WORLD, HASH);
    expect(new URL(request.url).pathname).toBe(path);
    expect(request.url.startsWith("http://127.0.0.1:8797/")).toBe(true);
    const header = request.headers.get("x-unmapped-auth") ?? "";
    const nowS = Math.floor(Date.now() / 1000);
    const auth = readBlobAuth(header, { method: "GET", path, body: new Uint8Array(), nowS });
    expect(auth).toEqual({ ok: true, value: signer.author });

    const flipped = bytes.slice();
    flipped[0] = (flipped[0] ?? 0) ^ 128;
    expect(code(await fetchBlob("wss://w.example", WORLD, HASH, signer, answer(flipped)))).toBe(
      "blob-tampered",
    );
    expect(code(await fetchBlob("wss://w.example", WORLD, HASH, signer, answer(bytes, 404)))).toBe(
      "blob-http-failed",
    );
  });
});
