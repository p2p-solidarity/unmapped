import { createHash } from "node:crypto";
import { BUILTIN_MODULES } from "@shared/capability-modules";
import type {
  CartridgeFileIntegrity,
  CartridgeManifest,
  CartridgeManifestCore,
  ContentHash,
  RuntimePin,
} from "@shared/cartridge";
import { EMPTY_MOD_LOCK } from "@shared/mods";
import { err, ok, type Result } from "@shared/result";

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

/** The hashed part of a manifest: everything except the hash and the file table it seals. */
export function manifestCore(manifest: CartridgeManifest): CartridgeManifestCore {
  const { contentHash: _contentHash, files: _files, ...core } = manifest;
  return core;
}

/** Recomputes every runtime identity from the immutable manifest; stored pins are never trusted. */
export function deriveRuntimePin(manifest: CartridgeManifest): Result<RuntimePin> {
  const cartridge = {
    cartridgeId: manifest.cartridgeId,
    version: manifest.version,
    contentHash: manifest.contentHash,
  };
  if (manifest.formatVersion === 1) {
    const moduleLock = { entries: [] };
    const profileHash = sha256(
      canonicalJson({
        legacy: { requiredKits: manifest.requiredKits, genesis: manifest.genesis },
        moduleLock,
        modLock: EMPTY_MOD_LOCK.entries,
        engineApiVersion: manifest.engineApiVersion,
        networkProtocolVersion: 0,
      }),
    );
    return ok({
      cartridge,
      moduleLock,
      modLock: EMPTY_MOD_LOCK,
      profileHash,
      effectiveHash: sha256(`${manifest.contentHash}${profileHash}`),
    });
  }
  const { capabilityProfile, moduleLock, modLock } = manifest.definition;
  const moduleIds = new Set<string>();
  for (const module of moduleLock.entries) {
    if (moduleIds.has(module.moduleId)) {
      return err(
        "cartridge-module-lock-invalid",
        `Module ${module.moduleId} is locked more than once.`,
        "Publish the revision again from a verified workspace.",
      );
    }
    moduleIds.add(module.moduleId);
    const installed = BUILTIN_MODULES.find(
      (candidate) => candidate.moduleId === module.moduleId && candidate.version === module.version,
    );
    if (installed === undefined || canonicalJson(installed) !== canonicalJson(module)) {
      return err(
        "cartridge-module-lock-untrusted",
        `Module ${module.moduleId}@${module.version} does not match an installed engine module.`,
        "Install a compatible engine build or publish with the modules available in this build.",
      );
    }
  }
  const lockedModuleVersions = new Set(
    moduleLock.entries.map((module) => `${module.moduleId}@${module.version}`),
  );
  for (const module of moduleLock.entries) {
    const missing = module.requires.find((required) => !lockedModuleVersions.has(required));
    if (missing !== undefined) {
      return err(
        "cartridge-module-lock-invalid",
        `${module.moduleId}@${module.version} requires unlocked module ${missing}.`,
        "Publish the revision again with every required module in its ordered lock.",
      );
    }
  }
  const modNames = new Set<string>();
  for (const mod of modLock.entries) {
    if (modNames.has(mod.name)) {
      return err(
        "cartridge-mod-lock-invalid",
        `Mod ${mod.name} is locked more than once.`,
        "Publish the revision again from a verified workspace.",
      );
    }
    modNames.add(mod.name);
  }
  const expectedModLockHash = sha256(canonicalJson(modLock.entries));
  if (expectedModLockHash !== modLock.lockHash) {
    return err(
      "cartridge-mod-lock-invalid",
      "The cartridge mod lock does not match its ordered entries.",
      "Publish the revision again from a verified workspace.",
    );
  }
  const runtimeMods = modLock.entries.filter((entry) => entry.affectsRuntime);
  const profileHash = sha256(
    canonicalJson({
      capabilityProfile,
      moduleLock,
      runtimeMods,
      engineApiVersion: manifest.engineApiVersion,
      networkProtocolVersion: manifest.networkProtocolVersion,
    }),
  );
  return ok({
    cartridge,
    moduleLock,
    modLock,
    profileHash,
    effectiveHash: sha256(`${manifest.contentHash}${profileHash}`),
  });
}

/** Backwards-compatible name for callers created while the v2 format was being introduced. */
export const runtimePinForManifest = deriveRuntimePin;

export function verifyRuntimePin(
  manifest: CartridgeManifest,
  stored: RuntimePin,
): Result<RuntimePin> {
  const derived = deriveRuntimePin(manifest);
  if (!derived.ok) return derived;
  if (canonicalJson(derived.value) !== canonicalJson(stored)) {
    return err(
      "runtime-pin-mismatch",
      "The stored runtime pin does not match the installed cartridge revision.",
      "Restore the exact cartridge revision or create a fresh instance.",
    );
  }
  return derived;
}
