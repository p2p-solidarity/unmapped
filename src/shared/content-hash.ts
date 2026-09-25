import type { ContentHash } from "./cartridge";

export async function hashText(value: string): Promise<ContentHash> {
  const bytes = new TextEncoder().encode(value.replace(/\r\n?/g, "\n"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}
