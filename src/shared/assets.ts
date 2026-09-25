import { BUILTIN_ASSET_HASHES, BUILTIN_PACK_HASH } from "./builtin-asset-hashes";
import type { ContentHash } from "./cartridge";
import { err, ok, type Result } from "./result";
import { PROP_KINDS, type PropKind, type SceneGraph } from "./world";

export interface AssetRef {
  assetId: string;
  role: "environment" | "character" | "weapon" | "vehicle" | "ui" | "audio";
  path: string;
  contentHash: ContentHash;
}
export interface AssetPackRef {
  packId: string;
  version: string;
  contentHash: ContentHash;
  assets: AssetRef[];
}
export type AssetPack = AssetPackRef;

export function builtinAssetRef(kind: PropKind): AssetRef {
  return {
    assetId: `builtin:${kind}`,
    role: "environment",
    path: `builtin/props/${kind}`,
    contentHash: BUILTIN_ASSET_HASHES[kind],
  };
}

export function builtinAssetKind(assetId: string): PropKind | null {
  const kind = assetId.replace(/^builtin:/, "");
  return assetId.startsWith("builtin:") && (PROP_KINDS as readonly string[]).includes(kind)
    ? (kind as PropKind)
    : null;
}

export function builtinAssetPack(kinds: readonly PropKind[] = PROP_KINDS): AssetPackRef {
  return {
    packId: "builtin-props",
    version: "1.0.0",
    contentHash: BUILTIN_PACK_HASH,
    assets: [...new Set(kinds)].sort().map(builtinAssetRef),
  };
}

export function validateAssetRef(ref: AssetRef): Result<AssetRef> {
  const kind = builtinAssetKind(ref.assetId);
  if (kind === null)
    return err(
      "asset-missing",
      `Asset ${ref.assetId} is not installed.`,
      "Choose an installed built-in asset.",
    );
  const expected = builtinAssetRef(kind);
  if (
    ref.path !== expected.path ||
    ref.contentHash !== expected.contentHash ||
    ref.role !== expected.role
  )
    return err(
      "asset-hash-mismatch",
      `Asset ${ref.assetId} does not match its installed recipe.`,
      "Regenerate the candidate using the installed asset pack.",
    );
  return ok(ref);
}

export function assetsForScene(graph: SceneGraph): AssetRef[] {
  return [...new Set(graph.props.map((prop) => prop.kind))].sort().map(builtinAssetRef);
}
