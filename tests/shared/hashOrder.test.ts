// Content hashes must not depend on the language of the machine that computes them. What this
// guards (written before src/shared/hashOrder.ts):
//   1. A cartridge or AI-world revision hashes differently on a machine whose collation reorders
//      its paths (Czech "ch" after "h", Danish "aa" after "z"), so a valid revision fails
//      `cartridge-integrity-failed` there and a save pinned to it cannot open.
//   2. Pinning the order changes the hash of revisions already published on en / zh / ja machines,
//      so every save pinned to one of them breaks.
//   3. A capability context id stored in a cartridge is re-derived in another order and no longer
//      matches on validation.

import { cartridgeContentHash } from "@main/cartridges/integrity";
import { workContentHash } from "@main/works/store";
import type { CartridgeFileIntegrity, CartridgeManifestCore } from "@shared/cartridge";
import { hashOrder } from "@shared/hashOrder";
import { afterEach, describe, expect, it, vi } from "vitest";

const PATHS = [
  "scenes/h2.oui",
  "scenes/chapter1.oui",
  "scenes/d1.oui",
  "assets/z.png",
  "assets/aa.png",
  "assets/a_b.png",
  "assets/a1.png",
  "dialogue/origin/chen.oui",
  "bible/core.md",
  "rules.oui",
];

const files: CartridgeFileIntegrity[] = PATHS.map((path, i) => ({
  path,
  bytes: i + 1,
  contentHash: `sha256:${String(i).padStart(64, "0")}`,
}));
const manifest = { cartridgeId: "t", version: "1.0.0" } as unknown as CartridgeManifestCore;

/** Makes every bare `localeCompare` in this process behave as on a machine set to `locale`. */
function machineLanguage(locale: string): void {
  const collator = new Intl.Collator(locale);
  vi.spyOn(String.prototype, "localeCompare").mockImplementation(function (
    this: string,
    that: string,
  ) {
    return collator.compare(String(this), that);
  });
}

afterEach(() => vi.restoreAllMocks());

describe("hash order", () => {
  it("(2) keeps the order every published hash was made with", () => {
    const pinned = [...PATHS].sort(hashOrder);
    expect(pinned).toEqual([...PATHS].sort((a, b) => a.localeCompare(b, "en")));
    expect([...PATHS].sort((a, b) => a.localeCompare(b, "zh-TW"))).toEqual(pinned);
    expect([...PATHS].sort((a, b) => a.localeCompare(b, "ja"))).toEqual(pinned);
  });

  it("(1) a cartridge and a work hash the same on a Czech or Danish machine", () => {
    const cartridge = cartridgeContentHash(manifest, files);
    const work = workContentHash(manifest as never, files);
    for (const locale of ["cs", "da", "et"]) {
      machineLanguage(locale);
      expect(cartridgeContentHash(manifest, [...files].reverse()), locale).toBe(cartridge);
      expect(workContentHash(manifest as never, [...files].reverse()), locale).toBe(work);
      vi.restoreAllMocks();
    }
  });

  it("(1) the guard is real: those languages do reorder these paths", () => {
    const pinned = [...PATHS].sort(hashOrder);
    for (const locale of ["cs", "da"]) {
      expect(
        [...PATHS].sort((a, b) => a.localeCompare(b, locale)),
        locale,
      ).not.toEqual(pinned);
    }
  });
});
