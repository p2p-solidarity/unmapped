// Canonical JSON: object keys sorted (UTF-16 code-unit order, `Array.prototype.sort`) at every
// depth, arrays kept in order, everything else exactly as `JSON.stringify` writes it. The one
// spelling of a value that hashes (cartridge content hashes, history event ids, beat fingerprints)
// are computed over, so the same value hashes the same in main, the renderer, vitest and the world
// service (JavaScriptCore). Pure: no Node, no DOM.
//
// Moved here from `main/cartridges/integrity.ts` (rev 6 phase 3, D2); that module keeps its own copy
// until it re-exports this one, and a test holds the two byte-identical.

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value !== "object" || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    // Never `out[key] = …`: for the own key "__proto__" (which JSON.parse makes) that assignment
    // calls Object.prototype's setter and drops the value, so two different values would hash alike.
    Object.defineProperty(out, key, {
      value: canonicalValue((value as Record<string, unknown>)[key]),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return out;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}
