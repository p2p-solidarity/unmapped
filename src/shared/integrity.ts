// A cartridge revision's hash maths (rev 6 phase 4, WP "integrity"), pure so that every place that
// checks a revision runs the same code: main when it publishes and imports, and the world service,
// `verifyWorldBundle` and the browser proof when they check a genesis pack. sha256 is @noble/hashes
// (the same bytes as node:crypto; main keeps its native `sha256` for large blobs), the JSON is
// @shared/canonical, and every list is sorted with @shared/hashOrder, never `localeCompare`, whose
// order follows the machine's language. Moved out of `main/cartridges/{integrity,validate-revision}`
// unchanged: every content hash published before stays byte-identical.

import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { canonicalJson } from "./canonical";
import {
  BIBLE_FILES,
  type CartridgeFileIntegrity,
  type CartridgeManifest,
  type CartridgeManifestCore,
  type ContentHash,
  type WorldBible,
} from "./cartridge";
import { hashOrder } from "./hashOrder";

const encoder = new TextEncoder();

/** "sha256:" + hex of the UTF-8 bytes of a string, or of the bytes themselves. */
export function sha256(content: string | Uint8Array): ContentHash {
  const bytes = typeof content === "string" ? encoder.encode(content) : content;
  return `sha256:${bytesToHex(nobleSha256(bytes))}`;
}

/** The integrity entry of a text file: its UTF-8 size and hash. */
export function fileIntegrity(path: string, content: string): CartridgeFileIntegrity {
  const bytes = encoder.encode(content);
  return { path, bytes: bytes.byteLength, contentHash: sha256(bytes) };
}

/** The integrity entry of a binary file (an asset). */
export function bytesIntegrity(path: string, bytes: Uint8Array): CartridgeFileIntegrity {
  return { path, bytes: bytes.byteLength, contentHash: sha256(bytes) };
}

/** A revision's identity: the manifest core and its file table, files in `hashOrder` of path. */
export function cartridgeContentHash(
  manifest: CartridgeManifestCore,
  files: readonly CartridgeFileIntegrity[],
): ContentHash {
  return sha256(
    canonicalJson({ manifest, files: [...files].sort((a, b) => hashOrder(a.path, b.path)) }),
  );
}

/** The hashed part of a manifest: everything except the hash and the file table it seals. */
export function manifestCore(manifest: CartridgeManifest): CartridgeManifestCore {
  const { contentHash: _contentHash, files: _files, ...core } = manifest;
  return core;
}

/** Integrity entries for a bible, in path order. */
export function bibleIntegrity(bible: WorldBible | null): CartridgeFileIntegrity[] {
  return bible === null
    ? []
    : [fileIntegrity(BIBLE_FILES.core, bible.core), fileIntegrity(BIBLE_FILES.style, bible.style)];
}
