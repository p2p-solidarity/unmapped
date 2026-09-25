import { err, ok, type Result } from "@shared/result";

const CENTRAL_HEADER = 0x02014b50;
const END_HEADER = 0x06054b50;
const END_BYTES = 22;
const MAX_COMMENT_BYTES = 65_535;

function u16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function u32(bytes: Uint8Array, offset: number): number {
  return (u16(bytes, offset) | (u16(bytes, offset + 2) << 16)) >>> 0;
}

/** Reads central-directory names before fflate collapses duplicate ZIP entries into an object. */
export function validateArchiveEntryNames(bytes: Uint8Array, code: string): Result<void> {
  let end = -1;
  const start = Math.max(0, bytes.length - END_BYTES - MAX_COMMENT_BYTES);
  for (let offset = bytes.length - END_BYTES; offset >= start; offset -= 1) {
    if (u32(bytes, offset) === END_HEADER) {
      end = offset;
      break;
    }
  }
  if (end < 0) return err(code, "The ZIP central directory is missing or damaged.");

  const count = u16(bytes, end + 10);
  let offset = u32(bytes, end + 16);
  const names = new Set<string>();
  const decoder = new TextDecoder();
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > end || u32(bytes, offset) !== CENTRAL_HEADER) {
      return err(code, "The ZIP central directory is inconsistent.");
    }
    const nameBytes = u16(bytes, offset + 28);
    const extraBytes = u16(bytes, offset + 30);
    const commentBytes = u16(bytes, offset + 32);
    const next = offset + 46 + nameBytes + extraBytes + commentBytes;
    if (next > end) return err(code, "A ZIP entry name extends past the central directory.");
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameBytes));
    if (names.has(name)) return err(code, `The archive contains duplicate entry ${name}.`);
    names.add(name);
    offset = next;
  }
  return ok(undefined);
}
