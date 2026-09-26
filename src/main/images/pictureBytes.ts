// Whether a picture a revision publishes is a picture at all (rev 6 phase 4 fix; p4-licence
// published a 0-byte `assets/look.png`). Every picture this app draws or stores is a PNG main wrote
// (`resizeToPng`), so a published one must decode as a PNG: the signature, every chunk whole with
// a matching CRC, a sane IHDR first, IDAT data that inflates to exactly the rows the header
// promises, and IEND last. Pure (node:zlib only), so it runs in vitest as it does in main.
// The bytes are untrusted (a publish IPC payload): inflating never goes past what the header
// promises, and a header promising more than any picture of ours is refused before inflating.

import { crc32, inflateSync } from "node:zlib";
import { err, ok, type Result } from "@shared/result";

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Far above any picture main stores (512 × 512); a larger header is not one of ours. */
const MAX_SIDE = 8_192;
/** The most filtered image data a header may promise (4096 × 4096 RGBA8): main inflates no more. */
const MAX_IMAGE_BYTES = 64 * 1024 * 1024;
/** Samples per pixel by colour type (0 grey, 2 RGB, 3 palette, 4 grey + alpha, 6 RGBA). */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const DEPTHS: Record<number, readonly number[]> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16],
};
/** Adam7: each pass's first column / row and step. */
const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
] as const;

/** Bytes of filtered image data a header promises (one filter byte per row, per pass). */
function expectedBytes(width: number, height: number, bits: number, interlaced: boolean): number {
  const rows = (w: number, h: number) =>
    w === 0 || h === 0 ? 0 : h * (1 + Math.ceil((w * bits) / 8));
  if (!interlaced) return rows(width, height);
  let total = 0;
  for (const [x0, y0, dx, dy] of ADAM7) {
    total += rows(Math.ceil((width - x0) / dx), Math.ceil((height - y0) / dy));
  }
  return total;
}

/** Why `bytes` is not a PNG this app can publish, or null when it decodes. */
export function pngProblem(bytes: Uint8Array): string | null {
  if (bytes.length < SIGNATURE.length || SIGNATURE.some((b, at) => bytes[at] !== b)) {
    return "it is not a PNG (no PNG signature)";
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = SIGNATURE.length;
  let header: { width: number; height: number; bits: number; interlaced: boolean } | null = null;
  const data: Uint8Array[] = [];
  let ended = false;
  while (at < bytes.length) {
    if (ended) return "there are bytes after its end chunk";
    if (at + 12 > bytes.length) return "a chunk is cut off";
    const length = view.getUint32(at);
    if (at + 12 + length > bytes.length) return "a chunk is cut off";
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (crc32(bytes.subarray(at + 4, at + 8 + length)) !== view.getUint32(at + 8 + length)) {
      return `its ${type} chunk is damaged (CRC mismatch)`;
    }
    if (header === null && type !== "IHDR") return "its first chunk is not IHDR";
    if (type === "IHDR") {
      if (header !== null || length !== 13) return "its IHDR chunk is malformed";
      const width = view.getUint32(at + 8);
      const height = view.getUint32(at + 12);
      const [depth = 0, colour = -1, compression, filter, interlace = 0] = body.subarray(8, 13);
      const channels = CHANNELS[colour];
      if (width === 0 || height === 0 || width > MAX_SIDE || height > MAX_SIDE) {
        return `its size ${width} × ${height} is not a picture's`;
      }
      if (channels === undefined || !(DEPTHS[colour] ?? []).includes(depth)) {
        return "its colour type or bit depth is not valid";
      }
      if (compression !== 0 || filter !== 0 || interlace > 1) return "its IHDR chunk is malformed";
      header = { width, height, bits: depth * channels, interlaced: interlace === 1 };
    } else if (type === "IDAT") {
      data.push(body);
    } else if (type === "IEND") {
      ended = true;
    }
    at += 12 + length;
  }
  if (header === null) return "it has no IHDR chunk";
  if (!ended) return "it has no end chunk (cut off)";
  if (data.length === 0) return "it has no image data";
  const { width, height, bits, interlaced } = header;
  const expected = expectedBytes(width, height, bits, interlaced);
  if (expected > MAX_IMAGE_BYTES) return `its size ${width} × ${height} is too large a picture`;
  let pixels: Uint8Array;
  try {
    // One byte past the promise is enough to tell a stream that inflates further (a zip bomb).
    pixels = inflateSync(Buffer.concat(data), { maxOutputLength: expected + 1 });
  } catch (error) {
    return (error as { code?: string }).code === "ERR_BUFFER_TOO_LARGE"
      ? "its image data inflates past the size its header gives"
      : "its image data does not inflate";
  }
  if (pixels.length !== expected) {
    return "its image data does not fill the size its header gives";
  }
  return null;
}

/**
 * Refuses a picture that is empty or does not decode, naming it. `path` is the asset path as the
 * revision lists it (`look.png`); the message carries the reason for the log and the detail line.
 */
export function checkPublishedPicture(path: string, bytes: Uint8Array): Result<void> {
  const hint =
    "Draw the picture again (or pick another) at Create World's Look step, then build again.";
  if (bytes.length === 0) {
    return err("cartridge-picture-empty", `assets/${path} is empty (0 bytes).`, hint);
  }
  const problem = pngProblem(bytes);
  if (problem !== null) {
    return err(
      "cartridge-picture-undecodable",
      `assets/${path} cannot be decoded as a picture: ${problem}.`,
      hint,
    );
  }
  return ok(undefined);
}
