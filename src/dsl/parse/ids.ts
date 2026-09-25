// Entity ids must stay ascii snake_case even when the world is generated in Japanese, and they
// must be unique inside one program — the engine addresses NPCs, quests and triggers by id.

import { LIMITS } from "../limits";

/** Lowercase ascii snake_case, or `fallback` when nothing ascii survives (e.g. a Japanese id). */
export function slugId(raw: string, fallback: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, LIMITS.text.id)
    .replace(/_+$/g, "");
  if (slug === "" || /^[0-9]/.test(slug)) return fallback;
  return slug;
}

export interface IdScope {
  /** Register one id; returns the snake_cased value actually used. */
  take(raw: string, fallback: string): string;
  /** Ids that were claimed more than once. */
  duplicates(): string[];
}

export function createIdScope(): IdScope {
  const seen = new Set<string>();
  const clashes = new Set<string>();
  return {
    take(raw, fallback) {
      const id = slugId(raw, fallback);
      if (seen.has(id)) clashes.add(id);
      seen.add(id);
      return id;
    },
    duplicates: () => [...clashes],
  };
}
