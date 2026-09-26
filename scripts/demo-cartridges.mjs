// Builds the demo cartridges in cartridges-examples/<id>/ through the same path Create takes:
// mode selection → capability compiler → Forge (buildCartridge) → publish validation → .cartridge.
// Nothing here is bundled into the app; the output is imported like any other shared cartridge.
//
//   bun run demo:cartridges             → cartridges-examples/dist/<id>-<version>.cartridge
//   bun run demo:cartridges --install   → also publishes each revision into userData/cartridges

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseScene } from "../src/dsl/index.ts";
import { packCartridge } from "../src/main/cartridges/pack.ts";
import { publishCartridgeRevision } from "../src/main/cartridges/store.ts";
import { prepare } from "../src/main/cartridges/validate-revision.ts";
import { buildCartridge } from "../src/renderer/narrative/forge.ts";
import { compileCapabilities } from "../src/shared/capabilities.ts";
import { BUILTIN_MODULES } from "../src/shared/capability-modules.ts";
import { hashText } from "../src/shared/content-hash.ts";
import { findMode, requirementsFor } from "../src/shared/mode-catalog.ts";

const ROOT = "cartridges-examples";
const OUT = join(ROOT, "dist");
const AXIS_FIELD = {
  genre: "genres",
  timing: "timings",
  structure: "structures",
  setting: "settings",
};

function userDataDir() {
  if (process.env.AETHER_USER_DATA) return process.env.AETHER_USER_DATA;
  if (process.platform === "darwin")
    return join(homedir(), "Library/Application Support/Unwritten Land");
  if (process.platform === "win32") return join(process.env.APPDATA ?? homedir(), "Unwritten Land");
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "Unwritten Land");
}

function fail(id, message) {
  console.error(`✗ ${id}: ${message}`);
  process.exitCode = 1;
  return null;
}

function selectionFor(modes) {
  const selection = { genres: [], timings: [], structures: [], settings: [] };
  for (const id of modes) {
    const mode = findMode(id);
    if (mode === null) throw new Error(`Unknown mode ${id}`);
    selection[AXIS_FIELD[mode.axis]].push(id);
  }
  return selection;
}

async function build(dir) {
  const design = JSON.parse(readFileSync(join(dir, "design.json"), "utf8"));
  const id = design.cartridgeId;
  const selection = selectionFor(design.modes);
  const resolution = compileCapabilities({
    requirements: requirementsFor(selection),
    modules: BUILTIN_MODULES,
    overrides: design.overrides ?? {},
    accepted: design.acceptedSubstitutions ?? {},
  });
  if (resolution.status === "needs_plugin" || resolution.status === "conflict") {
    const missing = resolution.missingModules.map((one) => `${one.key}:${one.value}`);
    return fail(id, `capabilities ${resolution.status} (${missing.join(", ")})`);
  }

  const slots = [];
  for (const scene of design.scenes) {
    const context =
      resolution.contexts.length === 1
        ? resolution.contexts[0]
        : resolution.contexts.find((one) => one.sourceModes.includes(scene.mode));
    if (context === undefined)
      return fail(id, `${scene.slotId}: no context for mode ${scene.mode}`);
    const sceneSource = readFileSync(join(dir, "scenes", `${scene.slotId}.oui`), "utf8");
    const parsed = parseScene(sceneSource);
    if (!parsed.ok) return fail(id, `${scene.slotId}.oui: ${parsed.error.message}`);
    const contentHash = await hashText(sceneSource);
    const candidateId = `${scene.slotId}-authored`;
    slots.push({
      slotId: scene.slotId,
      role: scene.role,
      title: scene.title,
      contextId: context.contextId,
      baseId: scene.baseId,
      selectedCandidateId: candidateId,
      candidates: [
        {
          candidateId,
          slotId: scene.slotId,
          contextId: context.contextId,
          baseId: scene.baseId,
          title: scene.title,
          sceneSource,
          contentHash,
          status: "ready",
          staleReason: null,
          // A demo scene carries no written voices: residents speak only once a Story step writes
          // them, and the cartridge ships none rather than stand-ins (Rule 2).
          dialogues: {},
          receipt: {
            operation: "base",
            generationSeed: 0,
            requestHash: contentHash,
            parentCandidateHash: null,
            modelId: null,
            createdAt: design.createdAt,
          },
        },
      ],
    });
  }

  const snapshot = {
    formatVersion: 1,
    workspaceId: `${id}-examples`,
    draft: {
      formatVersion: 2,
      name: design.name,
      // The draft's own sentence; a demo's words are its narrative premise (empty stays empty).
      brief: design.narrative?.premise ?? "",
      cartridgeId: id,
      author: design.author,
      selection,
      overrides: design.overrides ?? {},
      acceptedSubstitutions: design.acceptedSubstitutions ?? {},
      capabilityResolution: resolution,
      sceneBases: null,
      review: null,
      slots: [],
      stale: { designReview: false, sceneSlots: [] },
      updatedAt: design.createdAt,
    },
    gallery: {
      formatVersion: 1,
      slots,
      entrySlotId: design.scenes[0]?.slotId ?? null,
      endingSlotIds: design.endings,
    },
    narrative: design.narrative,
    updatedAt: design.createdAt,
  };
  const forged = await buildCartridge(snapshot, resolution);
  if (!forged.ok) return fail(id, forged.error.message);
  // Forge stamps the wall clock; a demo keeps its authored date so rebuilding keeps the same hash.
  const input = {
    ...forged.value,
    manifest: { ...forged.value.manifest, version: design.version, createdAt: design.createdAt },
  };
  const prepared = prepare(input);
  if (!prepared.ok) return fail(id, `${prepared.error.message} ${prepared.error.hint ?? ""}`);
  const packed = packCartridge(prepared.value);
  if (!packed.ok) return fail(id, packed.error.message);
  const file = join(OUT, `${id}-${design.version}.cartridge`);
  writeFileSync(file, packed.value);

  const contexts = resolution.contexts.map((one) => one.contextId).join(" | ");
  console.log(`✓ ${file}  ${prepared.value.manifest.contentHash.slice(0, 19)}…`);
  console.log(`  contexts: ${contexts}`);
  for (const slot of slots) console.log(`  ${slot.slotId} → ${slot.contextId}`);
  return input;
}

const install = process.argv.includes("--install");
mkdirSync(OUT, { recursive: true });
const dirs = readdirSync(ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(ROOT, entry.name, "design.json")))
  .map((entry) => join(ROOT, entry.name));
for (const dir of dirs) {
  const input = await build(dir);
  if (input === null || !install) continue;
  const cartridgesDir = join(userDataDir(), "cartridges");
  const published = await publishCartridgeRevision(cartridgesDir, input);
  if (!published.ok) fail(input.manifest.cartridgeId, published.error.message);
  else console.log(`  installed into ${cartridgesDir}`);
}
