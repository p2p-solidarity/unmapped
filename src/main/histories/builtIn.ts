// Which cartridge revisions ship with the app (D6, D10): a world on one of them needs no `pack`
// event, and a friend joining it installs the revision from their own build (`ensureBaseGame`),
// never from a blob. The list mirrors `main/game/base.ts`'s SHIPPED; the wiring pass exports that
// list and this file reads it instead.

import type { CartridgeRef } from "@shared/cartridge";
import v100 from "../game/aether-land-1.0.0.json";
import v110 from "../game/aether-land-1.1.0.json";
import v120 from "../game/aether-land-1.2.0.json";
import v130 from "../game/aether-land-1.3.0.json";

const SHIPPED: ReadonlySet<string> = new Set(
  [v100, v110, v120, v130].map(
    (revision) => `${revision.manifest.cartridgeId}@${revision.manifest.version}`,
  ),
);

/**
 * Whether `ref` is a shipped revision. The id and version decide it: an installed revision under a
 * shipped id@version can only be the shipped one (publishing never overwrites a revision), and a
 * joiner checks the installed content hash against the genesis anyway.
 */
export function isBuiltIn(ref: Pick<CartridgeRef, "cartridgeId" | "version">): boolean {
  return SHIPPED.has(`${ref.cartridgeId}@${ref.version}`);
}
