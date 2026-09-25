import { createHash } from "node:crypto";
import type { CartridgeFileIntegrity, CartridgeManifestCore, ContentHash } from "@shared/cartridge";

export function sha256(content: string | Uint8Array): ContentHash {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value !== "object" || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = canonicalValue((value as Record<string, unknown>)[key]);
  }
  return out;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function fileIntegrity(path: string, content: string): CartridgeFileIntegrity {
  return {
    path,
    bytes: Buffer.byteLength(content, "utf8"),
    contentHash: sha256(content),
  };
}

export function cartridgeContentHash(
  manifest: CartridgeManifestCore,
  files: CartridgeFileIntegrity[],
): ContentHash {
  return sha256(
    canonicalJson({ manifest, files: [...files].sort((a, b) => a.path.localeCompare(b.path)) }),
  );
}
