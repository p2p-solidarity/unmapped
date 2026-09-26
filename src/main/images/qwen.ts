// The self-hosted Qwen-Image provider (rev 6 phase 4, D4). vLLM-Omni serves the OpenAI Images API
// (`vllm serve Qwen/Qwen-Image-2.1 --omni --port 8091`); main talks to QWEN_IMAGE_BASE_URL, else
// this machine on :8091. The renderer never names the server or its key.
//
// Before every picture: the address must be https or loopback, key or no key (a key only ever
// travels there, and never follows a redirect); `/v1/models` must answer and list this provider's
// exact model, because the model decides the licence the picture carries. A transparent asset must
// come back with an alpha channel (`image-no-alpha`), and a reference picture is used only through
// `/v1/images/edits` when the server lists that route — otherwise the result says
// `usedReference: false` and the caller says so too.
//
// Everything that needs Electron or the key store comes in through `QwenDeps`, so the protocol and
// its failure paths can be checked against a fake server (tests/images/qwen.test.ts).

import { isLoopbackEndpoint } from "@main/inference/config";
import { type EnvLike, keyEndpointAllowed, qwenImageEndpoint } from "@main/inference/keys";
import type { ImageProbe, ImageProviderId } from "@shared/images";
import { err, ok, type Result } from "@shared/result";
import { z } from "zod";
import { aborted, CONCEPT_SIDE, IMAGE_SIDE, type ImageProvider } from "./provider";

type QwenId = Extract<ImageProviderId, `qwen-${string}`>;

/** Each Qwen provider is one exact served model, and that model decides the licence. */
export const QWEN_MODELS: Record<QwenId, { model: string; licence: string }> = {
  "qwen-image-2512": { model: "Qwen/Qwen-Image-2512", licence: "apache-2.0" },
  "qwen-image-2.1": { model: "Qwen/Qwen-Image-2.1", licence: "qwen-research" },
};

export function isQwenId(id: ImageProviderId): id is QwenId {
  return id in QWEN_MODELS;
}

const PROBE_MS = 5_000;
const DRAW_MS = 10 * 60_000;

export interface QwenDeps {
  env: EnvLike;
  fetch: typeof fetch;
  /** The key the server may get: saved first, then QWEN_IMAGE_API_KEY (`resolveProviderKey`). */
  resolveKey(): Promise<Result<{ key: string; source: "saved" | "env" } | null>>;
  /** Scales a picture to side × side and returns a PNG (main: nativeImage). */
  resize(image: Uint8Array, side: number): Uint8Array;
  /** Whether any pixel is see-through; null when it cannot be told (then the header decides). */
  transparent?(png: Uint8Array): boolean | null;
}

function startHint(model: string): string {
  return `Start it with \`vllm serve ${model} --omni --port 8091\`, or set QWEN_IMAGE_BASE_URL in .env to where it runs, then try again.`;
}

const modelListSchema = z.object({ data: z.array(z.object({ id: z.string().max(400) })) });
const imageResponseSchema = z.object({
  data: z.array(z.object({ b64_json: z.string().optional() })).min(1),
  usage: z
    .object({ input_tokens: z.number().int().min(0), output_tokens: z.number().int().min(0) })
    .partial()
    .optional(),
});

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPngBytes(bytes: Uint8Array): boolean {
  return bytes.length > 33 && PNG_SIGNATURE.every((byte, at) => bytes[at] === byte);
}

/**
 * Whether a PNG can hold transparency: colour type 4 or 6 (an alpha channel), or a palette or
 * plain image with a `tRNS` chunk. Anything that is not a PNG cannot.
 */
export function pngHasAlpha(bytes: Uint8Array): boolean {
  if (!isPngBytes(bytes)) return false;
  const colourType = bytes[25];
  if (colourType === 4 || colourType === 6) return true;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8;
  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (type === "tRNS") return true;
    if (type === "IDAT" || type === "IEND") return false;
    at += 12 + length;
  }
  return false;
}

interface Target {
  base: string;
  headers: Record<string, string>;
}

/** Where requests go and with which key, or why nothing may be sent at all. */
async function target(deps: QwenDeps): Promise<Result<Target>> {
  const endpoint = qwenImageEndpoint(deps.env);
  if (!keyEndpointAllowed(endpoint)) {
    return err(
      "image-endpoint-not-allowed",
      `The Qwen-Image server ${endpoint} is neither https:// nor on this computer.`,
      "Serve it over https://, or on http://127.0.0.1, and set QWEN_IMAGE_BASE_URL in .env.",
    );
  }
  const loopback = isLoopbackEndpoint(endpoint);
  const key = await deps.resolveKey();
  if (!key.ok) return key;
  if (key.value === null && !loopback) {
    return err(
      "no-api-key",
      `No key is set for the Qwen-Image server at ${endpoint}.`,
      "Add QWEN_IMAGE_API_KEY to .env, or run the server on this computer.",
    );
  }
  const headers: Record<string, string> =
    key.value === null ? {} : { authorization: `Bearer ${key.value.key}` };
  return ok({ base: endpoint.replace(/\/+$/, ""), headers });
}

function unreachable(where: string, why: string, model: string): Result<never> {
  return err(
    "image-server-unreachable",
    `The Qwen-Image server at ${where} did not answer: ${why}`,
    startHint(model),
  );
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** `/v1/models`, then whether the server lists `/v1/images/edits` in its OpenAPI document. */
async function listServer(
  deps: QwenDeps,
  at: Target,
  model: string,
  signal: AbortSignal,
  askEdits: boolean,
): Promise<Result<ImageProbe>> {
  const started = performance.now();
  const timed = AbortSignal.any([signal, AbortSignal.timeout(PROBE_MS)]);
  let response: Response;
  try {
    response = await deps.fetch(`${at.base}/models`, {
      headers: at.headers,
      redirect: "error",
      signal: timed,
    });
  } catch (error) {
    if (signal.aborted) return aborted();
    return unreachable(at.base, reason(error), model);
  }
  if (!response.ok) return unreachable(at.base, `/models answered ${response.status}`, model);
  const listed = modelListSchema.safeParse(await response.json().catch(() => null));
  if (!listed.success) return unreachable(at.base, "/models is not a model list", model);
  const models = listed.data.data.map((entry) => entry.id);
  let edits: boolean | null = null;
  if (askEdits) {
    const editsPath = new URL(`${at.base}/images/edits`).pathname;
    try {
      const doc = await deps.fetch(new URL("/openapi.json", at.base).toString(), {
        headers: at.headers,
        redirect: "error",
        signal: timed,
      });
      const paths = doc.ok ? ((await doc.json()) as { paths?: Record<string, unknown> }).paths : {};
      edits = typeof paths === "object" && paths !== null && editsPath in paths;
    } catch {
      if (signal.aborted) return aborted();
      edits = false;
    }
  }
  return ok({
    latencyMs: Math.round(performance.now() - started),
    models,
    served: models.includes(model),
    edits,
  });
}

/** Settings → Advanced settings → Images "test": the server answers, serves this model, and whether it has edits. */
export async function probeQwen(
  id: QwenId,
  deps: QwenDeps,
  signal: AbortSignal,
): Promise<Result<ImageProbe>> {
  const { model } = QWEN_MODELS[id];
  const at = await target(deps);
  if (!at.ok) return at;
  return listServer(deps, at.value, model, signal, true);
}

export function qwenImageProvider(id: QwenId, deps: QwenDeps): ImageProvider {
  const { model, licence } = QWEN_MODELS[id];
  const endpoint = qwenImageEndpoint(deps.env);
  return {
    id,
    model,
    licence,
    locality: isLoopbackEndpoint(endpoint) ? "local" : "direct",
    endpoint,
    async generate(prompt, signal, options = {}) {
      const at = await target(deps);
      if (!at.ok) return at;
      const wantsReference = options.reference !== undefined;
      const listed = await listServer(deps, at.value, model, signal, wantsReference);
      if (!listed.ok) return listed;
      if (!listed.value.served) {
        return err(
          "image-model-not-served",
          `The Qwen-Image server serves ${listed.value.models.join(", ") || "no model"}, not ${model}.`,
          `${startHint(model)} Pictures carry the licence of the model that drew them, so another model is never used in its place.`,
        );
      }
      const concept = options.kind === "concept";
      const fields = {
        model,
        prompt: prompt.slice(0, 4_000),
        n: 1,
        size: "1024x1024",
        response_format: "b64_json",
        output_format: "png",
        background: concept ? "opaque" : "transparent",
      };
      const useReference = wantsReference && listed.value.edits === true;
      const started = performance.now();
      const timed = AbortSignal.any([signal, AbortSignal.timeout(DRAW_MS)]);
      let response: Response;
      try {
        if (useReference && options.reference !== undefined) {
          const form = new FormData();
          for (const [name, value] of Object.entries(fields)) form.append(name, String(value));
          form.append(
            "image",
            new Blob([new Uint8Array(options.reference)], { type: "image/png" }),
            "look.png",
          );
          response = await deps.fetch(`${at.value.base}/images/edits`, {
            method: "POST",
            headers: at.value.headers,
            body: form,
            redirect: "error",
            signal: timed,
          });
        } else {
          response = await deps.fetch(`${at.value.base}/images/generations`, {
            method: "POST",
            headers: { ...at.value.headers, "content-type": "application/json" },
            body: JSON.stringify(fields),
            redirect: "error",
            signal: timed,
          });
        }
      } catch (error) {
        if (signal.aborted) return aborted();
        return unreachable(at.value.base, reason(error), model);
      }
      if (signal.aborted) return aborted();
      if (!response.ok) {
        const body = (await response.text().catch(() => "")).slice(0, 300);
        return err(
          "image-failed",
          `Image generation failed: the Qwen-Image server answered ${response.status} ${body}`.trim(),
          response.status === 401 || response.status === 403
            ? "Check QWEN_IMAGE_API_KEY in .env, or the key saved for the Qwen-Image server."
            : "Check the server's log; it may be out of GPU memory.",
        );
      }
      const parsed = imageResponseSchema.safeParse(await response.json().catch(() => null));
      const b64 = parsed.success ? parsed.data.data[0]?.b64_json : undefined;
      if (b64 === undefined) {
        return err("image-empty", "The Qwen-Image server returned no image data (b64_json).");
      }
      const raw = new Uint8Array(Buffer.from(b64, "base64"));
      if (!concept) {
        const seeThrough = pngHasAlpha(raw) ? (deps.transparent?.(raw) ?? true) : false;
        if (!seeThrough) {
          return err(
            "image-no-alpha",
            `${model} returned an asset without transparency, though a transparent background was asked for.`,
            "Use a server build whose images API honours background: transparent, or draw with another image provider.",
          );
        }
      }
      let png: Uint8Array;
      try {
        png = deps.resize(raw, concept ? CONCEPT_SIDE : IMAGE_SIDE);
      } catch (error) {
        return err("image-failed", `The Qwen-Image picture could not be read: ${reason(error)}`);
      }
      const usage = parsed.success ? parsed.data.usage : undefined;
      return ok({
        png,
        provider: id,
        model,
        licence,
        usedReference: useReference,
        elapsedMs: Math.round(performance.now() - started),
        inputTokens: usage?.input_tokens ?? null,
        outputTokens: usage?.output_tokens ?? null,
        call: useReference ? "images.edit" : "images.generate",
      });
    },
  };
}
