// The OpenAI image provider (moved from works/images.ts unchanged in behaviour; rev 6 phase 4 D4
// adds its licence and locality). Its id stays "openai", so the usage ledger keeps one value.
// Pictures carry `openai-terms`: a contract, not a model licence (docs/licenses/models.md).

import { resolveApiKey } from "@main/inference/keyStore";
import { PROVIDER_PRESETS } from "@shared/llm";
import { err, ok } from "@shared/result";
import { nativeImage } from "electron";
import OpenAI, { APIUserAbortError, toFile } from "openai";
import { aborted, CONCEPT_SIDE, IMAGE_SIDE, type ImageProvider } from "./provider";

export const OPENAI_LICENCE = "openai-terms";

export function openAiImageModel(env: Record<string, string | undefined> = process.env): string {
  return env.OPENAI_IMAGE_MODEL || "gpt-image-1-mini";
}

export function openAiImageProvider(): ImageProvider {
  const model = openAiImageModel();
  return {
    id: "openai",
    model,
    licence: OPENAI_LICENCE,
    locality: "direct",
    endpoint: PROVIDER_PRESETS.openai.baseUrl,
    async generate(prompt, signal, options = {}) {
      // The same lookup chat uses: the key saved in Settings → Model, else OPENAI_API_KEY from .env.
      const resolved = await resolveApiKey({ ...PROVIDER_PRESETS.openai, sidecar: null });
      if (!resolved.ok) return resolved;
      const key = resolved.value;
      if (key === null) {
        return err(
          "no-api-key",
          "No OpenAI key is set.",
          "Enter one in Settings → Model (Cloud API → OpenAI), or add OPENAI_API_KEY to .env.",
        );
      }
      if (signal.aborted) return aborted();
      const quality =
        options.quality ??
        ((process.env.OPENAI_IMAGE_QUALITY || "medium") as "low" | "medium" | "high");
      const concept = options.kind === "concept";
      const side = concept ? CONCEPT_SIDE : IMAGE_SIDE;
      const shape = {
        model,
        prompt: prompt.slice(0, 4_000),
        size: "1024x1024",
        quality,
        background: concept ? ("opaque" as const) : ("transparent" as const),
        output_format: "png" as const,
        n: 1,
      };
      const started = performance.now();
      try {
        // Explicit, so an OPENAI_BASE_URL in the environment cannot redirect the key.
        const client = new OpenAI({ apiKey: key.key, baseURL: PROVIDER_PRESETS.openai.baseUrl });
        const response =
          options.reference === undefined
            ? await client.images.generate(shape, { signal })
            : await client.images.edit(
                {
                  ...shape,
                  image: await toFile(Buffer.from(options.reference), "look.png", {
                    type: "image/png",
                  }),
                },
                { signal },
              );
        if (signal.aborted) return aborted();
        const b64 = response.data?.[0]?.b64_json;
        if (b64 === undefined) return err("image-empty", "The image service returned no image.");
        // Worlds draw assets scaled up; 256 px keeps the asset small without losing the look.
        const png = nativeImage
          .createFromBuffer(Buffer.from(b64, "base64"))
          .resize({ width: side, height: side, quality: "good" })
          .toPNG();
        return ok({
          png: new Uint8Array(png),
          provider: "openai",
          model,
          licence: OPENAI_LICENCE,
          usedReference: options.reference !== undefined,
          elapsedMs: Math.round(performance.now() - started),
          inputTokens: response.usage?.input_tokens ?? null,
          outputTokens: response.usage?.output_tokens ?? null,
          call: options.reference === undefined ? "images.generate" : "images.edit",
        });
      } catch (error) {
        if (signal.aborted || error instanceof APIUserAbortError) return aborted();
        const message = error instanceof Error ? error.message : String(error);
        return err(
          "image-failed",
          `Image generation failed: ${message}`,
          "Check the key, the model name and your API quota.",
        );
      }
    },
  };
}
