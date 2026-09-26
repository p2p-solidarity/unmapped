// A joined world's land on the page (rev 6 phase 4, D7): the `PhoneDevice` the mobile shell draws
// with. The land is the world's genesis pack — the cartridge revision its latest `pack` event names
// (P3 D10) — fetched by hash once, kept in IndexedDB, and unpacked here with the pure
// `unpackCartridge` on every open, online or not. The revision must be exactly the one the genesis
// pins (id, version, content hash) and the one the `pack` event names; its entry scene then runs as
// the desktop runs it (`hydrateInstance`: the frozen capability context picks the kit), and it must
// be open land. The seed is not here: it is the genesis's own (`genesis.body.seed`).
//
// Where the player stood is kept per world in the same database, on this device only.

import { parseRules, parseScene } from "@dsl/index";
import { behaviorForKit, resolveSceneKit } from "@renderer/engine/kits/registry";
import type { PhoneDevice, PhoneLand } from "@renderer/mobile/phoneDevice";
import type { CartridgeRevision } from "@shared/cartridge";
import { unpackCartridge } from "@shared/cartridgePack";
import type { GenesisBody } from "@shared/history/types";
import { err, ok, type Result } from "@shared/result";
import { rulesForSceneContext } from "@shared/runtime-context";
import type { Host, LiveWorld } from "./live";
import { fetchPack } from "./packs";

const MISMATCH_HINT = "Ask the world's owner to share the world again from the desktop app.";

/** The revision must be the one the genesis pins and the `pack` event names, byte for byte. */
function sameRevision(
  revision: CartridgeRevision,
  genesis: GenesisBody,
  packCartridge: string,
): Result<void> {
  const { cartridgeId, version, contentHash } = revision.manifest;
  const pinned = genesis.cartridge;
  return cartridgeId === pinned.cartridgeId &&
    version === pinned.version &&
    contentHash === pinned.contentHash &&
    contentHash === packCartridge
    ? ok(undefined)
    : err(
        "browser-pack-mismatch",
        `The pack holds ${cartridgeId}@${version}, not the ${pinned.cartridgeId}@${pinned.version} this world was made on.`,
        MISMATCH_HINT,
      );
}

/** The entry scene as the land runs it, with its rules (as `hydrateInstance`, minus the depths). */
export function landOfRevision(revision: CartridgeRevision): Result<Omit<PhoneLand, "position">> {
  const { manifest } = revision;
  const entry =
    manifest.formatVersion === 1
      ? manifest.entrySceneId
      : manifest.definition.scenePlan.entrySceneId;
  const source = revision.scenes[entry];
  if (source === undefined) {
    return err("instance-scene-missing", `Scene ${entry} is absent from the world's cartridge.`);
  }
  const authored = parseScene(source);
  if (!authored.ok) return authored;
  const parsedRules = parseRules(revision.rules);
  if (!parsedRules.ok) return parsedRules;
  const rules =
    manifest.formatVersion === 2
      ? rulesForSceneContext(manifest.definition, parsedRules.value, authored.value)
      : parsedRules;
  if (!rules.ok) return rules;
  const graph =
    manifest.formatVersion === 2 && authored.value.contract !== null
      ? { ...authored.value, contract: { ...authored.value.contract, kit: rules.value.defaultKit } }
      : authored.value;
  const kit = resolveSceneKit(rules.value, graph);
  if (!kit.ok) return kit;
  if (!behaviorForKit(kit.value.id).open) {
    return err(
      "browser-land-bounded",
      "This world starts in a bounded scene, which only the desktop app plays.",
      "Open this world on the desktop app.",
    );
  }
  return ok({ revision, graph, rules: rules.value });
}

async function packBytes(host: Host, world: LiveWorld, hash: string): Promise<Result<Uint8Array>> {
  const kept = await host.store.blob(hash);
  if (!kept.ok) return kept;
  if (kept.value !== null) return ok(kept.value);
  if (world.link !== "online") {
    return err(
      "browser-pack-missing",
      "This world's land has not reached this browser yet.",
      "Go online once so the land can be fetched; after that it draws offline too.",
    );
  }
  return fetchPack(host, world, hash);
}

/** The page's `PhoneDevice`: `live` loads (and starts syncing) a joined world, as `read` does. */
export function phoneDevice(
  host: Host,
  live: (worldId: string) => Promise<Result<LiveWorld>>,
): PhoneDevice {
  return {
    async land(worldId) {
      const world = await live(worldId);
      if (!world.ok) return world;
      const pack = world.value.now.pack;
      if (pack === null) {
        return err(
          "browser-pack-none",
          "This world's maker has not shared its cartridge with the world yet.",
          MISMATCH_HINT,
        );
      }
      const bytes = await packBytes(host, world.value, pack.pack);
      if (!bytes.ok) return bytes;
      const revision = unpackCartridge(bytes.value);
      if (!revision.ok) return revision;
      const same = sameRevision(revision.value, world.value.genesis.body, pack.cartridge);
      if (!same.ok) return same;
      const land = landOfRevision(revision.value);
      if (!land.ok) return land;
      const position = await host.store.place(worldId);
      if (!position.ok) return position;
      return ok({ ...land.value, position: position.value });
    },
    keepPosition: (worldId, position) => host.store.keepPlace(worldId, position),
  };
}
