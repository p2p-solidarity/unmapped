// A published picture's bytes are untrusted (a `cartridges:publish` payload) and main decodes them
// on its own thread (src/main/images/pictureBytes.ts). The ways that check can fail, each guarded
// below (Rule 0: untrusted input, which no E2E can craft):
//
// 1. A deflate bomb behind an honest small header: main inflates the whole stream (hundreds of MiB
//    from under 1 MiB) before it notices the size is wrong — the app freezes or runs out of memory.
// 2. A header that promises a huge picture within MAX_SIDE (8192 × 8192 × 16-bit RGBA): main
//    inflates up to that promise instead of refusing it first.
// 3. Something that is not a whole PNG passes: empty bytes, no signature, a cut-off chunk, a damaged
//    CRC, no end chunk.
// 4. A real PNG, as main writes them, is refused.
// 5. An oversized asset reaches the decoder at all: the publish schema lets a picture over a pack's
//    own limit through.

import { crc32, deflateSync } from "node:zlib";
import { publishCartridgeInputSchema } from "@main/cartridges/schemas";
import { checkPublishedPicture, pngProblem } from "@main/images/pictureBytes";
import { describe, expect, it } from "vitest";

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  out.set(Buffer.from(type, "latin1"), 4);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

function png(width: number, height: number, idat: Uint8Array, colour = 2, depth = 8): Uint8Array {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr.set([depth, colour, 0, 0, 0], 8);
  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", new Uint8Array(0)),
  ];
  return Uint8Array.from(Buffer.concat(parts));
}

/** A real 16 × 16 RGB picture: every row a filter byte (0) and 48 bytes of colour. */
function realPicture(): Uint8Array {
  const rows = Buffer.alloc(16 * (1 + 16 * 3), 0x40);
  for (let row = 0; row < 16; row += 1) rows[row * (1 + 48)] = 0;
  return png(16, 16, deflateSync(rows));
}

describe("a published picture's bytes", () => {
  it("(1) refuses a deflate bomb without inflating past the header's promise", () => {
    // 64 × 64 RGB promises 12,352 bytes; the stream inflates to 64 MiB.
    const bomb = png(64, 64, deflateSync(Buffer.alloc(64 * 1024 * 1024), { level: 9 }));
    expect(bomb.length).toBeLessThan(1024 * 1024);
    const started = performance.now();
    expect(pngProblem(bomb)).toBe("its image data inflates past the size its header gives");
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it("(2) refuses a header promising more than any picture of ours, before inflating", () => {
    const huge = png(8_192, 8_192, deflateSync(Buffer.alloc(16)), 6, 16);
    expect(pngProblem(huge)).toBe("its size 8192 × 8192 is too large a picture");
  });

  it("(3) refuses what is not a whole PNG", () => {
    const whole = realPicture();
    expect(checkPublishedPicture("look.png", new Uint8Array(0)).ok).toBe(false);
    expect(pngProblem(Uint8Array.from(Buffer.from("not a picture")))).toContain("no PNG signature");
    expect(pngProblem(whole.subarray(0, whole.length - 20))).toContain("cut off");
    const damaged = Uint8Array.from(whole);
    damaged[40] = (damaged[40] ?? 0) ^ 0xff;
    expect(pngProblem(damaged)).toContain("CRC mismatch");
    expect(pngProblem(whole.subarray(0, whole.length - 12))).toContain("no end chunk");
  });

  it("(4) accepts a real picture", () => {
    expect(pngProblem(realPicture())).toBeNull();
    expect(checkPublishedPicture("look.png", realPicture()).ok).toBe(true);
  });

  it("(5) keeps an oversized asset out of the publish payload", () => {
    const base = {
      manifest: {},
      rules: "Rules()",
      scenes: {},
    };
    const big = publishCartridgeInputSchema.safeParse({
      ...base,
      assets: { "look.png": new Uint8Array(16 * 1024 * 1024 + 1) },
    });
    expect(big.success).toBe(false);
    const issues = big.success ? [] : big.error.issues.map((issue) => issue.message);
    expect(issues).toContain("asset too large");
  });
});
