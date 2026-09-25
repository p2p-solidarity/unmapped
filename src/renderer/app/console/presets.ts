// Provider preset application for the Inference tab. Pure: picking a kind replaces the endpoint
// fields with that provider's preset while keeping the sidecar block the user configured.

import {
  APPLE_FM_SIDECAR,
  type InferenceConfig,
  PROVIDER_KINDS,
  PROVIDER_PRESETS,
  type ProviderKind,
  type SidecarConfig,
} from "@shared/llm";

/** llama.cpp defaults from the README quick start; paths stay empty until the user picks them. */
export const EMPTY_SIDECAR: SidecarConfig = {
  binaryPath: "",
  modelPath: "",
  port: 8080,
  ctxSize: 16384,
};

export function isProviderKind(value: string): value is ProviderKind {
  return (PROVIDER_KINDS as readonly string[]).includes(value);
}

export function applyProviderPreset(current: InferenceConfig, kind: ProviderKind): InferenceConfig {
  // Apple's model runs through `fm serve`, which the app starts like a llama-server sidecar.
  if (kind === "apple-fm") return { ...PROVIDER_PRESETS[kind], sidecar: { ...APPLE_FM_SIDECAR } };
  return { ...PROVIDER_PRESETS[kind], sidecar: current.sidecar };
}

/** The form keeps apiKeyEnv as text; an empty field means "no auth" (local servers). */
export function apiKeyEnvFromInput(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function numberFromInput(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
