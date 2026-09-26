// Picture bytes through Electron's nativeImage, for providers whose protocol code stays free of
// Electron (./qwen.ts): scaling to the stored side and telling whether an asset is see-through.

import { nativeImage } from "electron";

/** Scales any picture nativeImage can decode to side × side and returns it as a PNG. */
export function resizeToPng(image: Uint8Array, side: number): Uint8Array {
  const decoded = nativeImage.createFromBuffer(Buffer.from(image));
  if (decoded.isEmpty()) throw new Error("the picture could not be decoded");
  return new Uint8Array(decoded.resize({ width: side, height: side, quality: "good" }).toPNG());
}

/** Whether any pixel is not fully opaque (the bitmap is BGRA, alpha in every fourth byte). */
export function hasTransparentPixel(png: Uint8Array): boolean | null {
  const decoded = nativeImage.createFromBuffer(Buffer.from(png));
  if (decoded.isEmpty()) return null;
  const bitmap = decoded.toBitmap();
  for (let at = 3; at < bitmap.length; at += 4) {
    if ((bitmap[at] ?? 255) < 255) return true;
  }
  return false;
}
