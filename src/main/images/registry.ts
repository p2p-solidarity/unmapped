// Which image provider draws (rev 6 phase 4, D4). The device's choice lives in main's
// `<userData>/images.json` (./choice.ts); the renderer only picks an id from `imageSettings()`.
// Every picture request asks `selectImageProvider()` at the moment it draws, so a choice made
// earlier, an edited images.json or a mode switched on since can never make a provider whose
// licence is not commercial draw while commercial mode is on (`image-licence-noncommercial`).
//
// Keys follow D2's order for images: a keyless server on this machine draws directly; otherwise the
// provider's saved key, then its own .env variable (OPENAI_API_KEY, QWEN_IMAGE_API_KEY); then, for
// OpenAI with no key of the player's own, the gateway's image endpoint when a gateway is configured
// and this device has an account token (./hosted.ts, metered); with none, `no-api-key` naming that
// variable. The hosted provider's licence is its gateway model's, so the commercial check applies.

import { gatewayModels } from "@main/account/gatewayHttp";
import { gatewaySetting } from "@main/inference/config";
import { keyStatusMap, resolveApiKey, resolveProviderKey } from "@main/inference/keyStore";
import type { EnvLike } from "@main/inference/keys";
import {
  type CommercialMode,
  IMAGE_PROVIDER_IDS,
  type ImageProbe,
  type ImageProviderId,
  type ImageProviderInfo,
  type ImageSettings,
  licenceCommercial,
} from "@shared/images";
import { type LicenceRecord, licenceTable } from "@shared/licence";
import { PROVIDER_PRESETS } from "@shared/llm";
import { err, ok, type Result } from "@shared/result";
import { DEFAULT_IMAGE_CHOICE, readImageChoice, writeImageChoice } from "./choice";
import { commercialMode } from "./commercial";
import { hostedImageModel, hostedImageProvider } from "./hosted";
import { openAiImageModel, openAiImageProvider } from "./openai";
import { hasTransparentPixel, resizeToPng } from "./pixels";
import type { ImageProvider } from "./provider";
import { isQwenId, probeQwen, type QwenDeps, qwenImageProvider } from "./qwen";

export type { GeneratedImage, ImageOptions, ImageProvider } from "./provider";
export { CONCEPT_SIDE, IMAGE_SIDE } from "./provider";
export { openAiImageProvider };

let root: string | null = null;

/** Called once when the images IPC is registered; until then the choice is the default. */
export function initImages(userData: string): void {
  root = userData;
}

function qwenDeps(env: EnvLike): QwenDeps {
  return {
    env,
    fetch: (input, init) => fetch(input, init),
    resolveKey: () => resolveProviderKey("qwen-image", env),
    resize: resizeToPng,
    transparent: hasTransparentPixel,
  };
}

export function imageProviderFor(id: ImageProviderId, env: EnvLike = process.env): ImageProvider {
  return isQwenId(id) ? qwenImageProvider(id, qwenDeps(env)) : openAiImageProvider();
}

/** Refuses a provider whose licence is not commercial while commercial mode is on. */
export function licensedFor(
  provider: Pick<ImageProvider, "id" | "licence">,
  commercial: CommercialMode,
  table: ReadonlyMap<string, LicenceRecord> = licenceTable(),
): Result<void> {
  if (!commercial.on || licenceCommercial(provider.licence, table)) return ok(undefined);
  const name = table.get(provider.licence)?.name ?? provider.licence;
  return err(
    "image-licence-noncommercial",
    `${provider.id} draws under ${name}, which does not allow commercial use, and commercial mode is on (${commercial.source}).`,
    "Choose an image provider whose licence allows commercial use in Settings → Advanced settings → Images.",
  );
}

export interface ImagePolicy {
  env?: EnvLike;
  /** The mode to apply; absent = read now (UNMAPPED_COMMERCIAL, then the gateway seam). */
  commercial?: CommercialMode;
}

/**
 * OpenAI chosen but no OpenAI key of the player's own: the gateway draws, when one is configured
 * and this device has a token for it. An own key (or one that no longer reads) keeps OpenAI; with
 * no gateway or no token, OpenAI stays and answers `no-api-key` as before. Never a retry: which
 * one draws is decided here, once, before the picture is asked for.
 */
async function withGateway(provider: ImageProvider, env: EnvLike): Promise<Result<ImageProvider>> {
  if (provider.id !== "openai") return ok(provider);
  const own = await resolveApiKey({ ...PROVIDER_PRESETS.openai, sidecar: null }, env);
  if (!own.ok || own.value !== null) return ok(provider);
  const gateway = gatewaySetting(env);
  if (!gateway.ok || gateway.value === null) return ok(provider);
  const token = await resolveProviderKey("hosted", env);
  if (!token.ok || token.value === null) return ok(provider);
  const models = await gatewayModels(gateway.value);
  if (!models.ok) return models;
  const model = hostedImageModel(models.value, openAiImageModel(env));
  if (!model.ok) return model;
  const quality = (env.OPENAI_IMAGE_QUALITY || "medium") as "low" | "medium" | "high";
  return ok(
    hostedImageProvider(
      { base: gateway.value, token: token.value, model: model.value },
      resizeToPng,
      quality,
    ),
  );
}

/** The provider the device chose, if commercial mode allows it: asked once per picture. */
export async function selectImageProvider(
  policy: ImagePolicy = {},
): Promise<Result<ImageProvider>> {
  const env = policy.env ?? process.env;
  const commercial = policy.commercial ?? (await commercialMode(env));
  const { choice } = root === null ? { choice: DEFAULT_IMAGE_CHOICE } : await readImageChoice(root);
  const provider = await withGateway(imageProviderFor(choice.provider, env), env);
  if (!provider.ok) return provider;
  const allowed = licensedFor(provider.value, commercial);
  return allowed.ok ? provider : allowed;
}

function unready(): Result<never> {
  return err("images-unready", "The image settings are not open yet.", "Restart UNMAPPED.");
}

export async function imageSettings(env: EnvLike = process.env): Promise<Result<ImageSettings>> {
  if (root === null) return unready();
  const commercial = await commercialMode(env);
  const read = await readImageChoice(root);
  const table = licenceTable();
  const keys = await keyStatusMap(env);
  const providers = IMAGE_PROVIDER_IDS.map((id): ImageProviderInfo | null => {
    const provider = imageProviderFor(id, env);
    const licence = table.get(provider.licence);
    if (licence === undefined) return null;
    const status = keys[isQwenId(id) ? "qwen-image" : "openai"];
    const key =
      status.source === null
        ? provider.locality === "local"
          ? "not-needed"
          : "none"
        : status.source;
    return {
      id,
      model: provider.model,
      licence,
      locality: provider.locality,
      endpoint: provider.endpoint,
      key,
      selectable: !commercial.on || licence.commercial,
    };
  });
  const missing = IMAGE_PROVIDER_IDS.find((_, at) => providers[at] === null);
  if (missing !== undefined) {
    return err(
      "image-licence-missing",
      `The image provider ${missing} names a licence with no record in @shared/licence.`,
    );
  }
  return ok({
    providers: providers as ImageProviderInfo[],
    choice: read.choice.provider,
    commercial,
    problem: read.problem,
  });
}

export async function chooseImageProvider(
  id: ImageProviderId,
  env: EnvLike = process.env,
): Promise<Result<ImageSettings>> {
  if (root === null) return unready();
  const allowed = licensedFor(imageProviderFor(id, env), await commercialMode(env));
  if (!allowed.ok) return allowed;
  const written = await writeImageChoice(root, { v: 1, provider: id });
  if (!written.ok) return written;
  return imageSettings(env);
}

const PROBE_MS = 5_000;

/** OpenAI's test: the key reads, and the API answers for the image model it would draw with. */
async function probeOpenAi(env: EnvLike, signal: AbortSignal): Promise<Result<ImageProbe>> {
  const key = await resolveApiKey({ ...PROVIDER_PRESETS.openai, sidecar: null }, env);
  if (!key.ok) return key;
  if (key.value === null) {
    return err(
      "no-api-key",
      "No OpenAI key is set.",
      "Enter one in Settings → Model (Cloud API → OpenAI), or add OPENAI_API_KEY to .env.",
    );
  }
  const model = openAiImageProvider().model;
  const started = performance.now();
  let response: Response;
  try {
    response = await fetch(
      `${PROVIDER_PRESETS.openai.baseUrl}/models/${encodeURIComponent(model)}`,
      {
        headers: { authorization: `Bearer ${key.value.key}` },
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(PROBE_MS)]),
      },
    );
  } catch (error) {
    return err(
      "image-server-unreachable",
      `OpenAI did not answer: ${error instanceof Error ? error.message : String(error)}`,
      "Check the internet connection, then try again.",
    );
  }
  if (response.status === 401 || response.status === 403) {
    return err(
      "image-failed",
      `OpenAI refused the key (${response.status}).`,
      "Check the key in Settings → Model, or OPENAI_API_KEY in .env.",
    );
  }
  if (!response.ok && response.status !== 404) {
    return err("image-server-unreachable", `OpenAI answered ${response.status}.`);
  }
  return ok({
    latencyMs: Math.round(performance.now() - started),
    models: response.ok ? [model] : [],
    served: response.ok,
    edits: true,
  });
}

/** Settings → Advanced settings → Images "test": asks the provider's server, spends nothing. */
export async function probeImageProvider(
  id: ImageProviderId,
  signal: AbortSignal,
  env: EnvLike = process.env,
): Promise<Result<ImageProbe>> {
  return isQwenId(id) ? probeQwen(id, qwenDeps(env), signal) : probeOpenAi(env, signal);
}
