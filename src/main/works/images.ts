// Image generation for world assets, main process only (Rule 6: the key never reaches a renderer).
// A generated picture is only ever a candidate image for one declared asset slot: it goes through
// the same draft → player check → compare-and-set path as a picked file, and its time and token
// use are recorded. No key, no picture — the caller gets an actionable error, never a stand-in.
//
// Which model draws is behind `ImageProvider` (rev 6: the model must be replaceable before anything
// is sold), and how a picture looks comes from the world itself — never one house style.

import { resolveApiKey } from "@main/inference/keyStore";
import { PROVIDER_PRESETS } from "@shared/llm";
import { err, ok, type Result } from "@shared/result";
import { nativeImage } from "electron";
import OpenAI, { APIUserAbortError, toFile } from "openai";

export const IMAGE_SIDE = 256;
/** A concept picture (Create's look step) is a whole scene: kept larger than an asset. */
export const CONCEPT_SIDE = 512;

export interface GeneratedImage {
  png: Uint8Array;
  provider: string;
  model: string;
  elapsedMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  /** The provider's own request, for the log (the OpenAI provider: "images.edit" over a reference). */
  call?: string;
}

export interface ImageOptions {
  /**
   * A picture the new one must match in look (a world's `assets/look.png`, rev 6 D2). The OpenAI
   * provider then draws with `images.edit`, the reference as its input image.
   */
  reference?: Uint8Array;
  /** "low" for quick concept pictures; absent = OPENAI_IMAGE_QUALITY, else medium. */
  quality?: "low" | "medium";
  /**
   * "asset" (the default): one subject on a transparent background, kept at IMAGE_SIDE.
   * "concept": a whole opaque scene, kept at CONCEPT_SIDE.
   */
  kind?: "asset" | "concept";
}

/** One image model. Swapping the model is swapping this object, nothing else. */
export interface ImageProvider {
  readonly id: string;
  /** The model it will draw with, known before any request (the usage ledger needs it). */
  readonly model: string;
  generate(
    prompt: string,
    signal: AbortSignal,
    options?: ImageOptions,
  ): Promise<Result<GeneratedImage>>;
}

export interface AssetPromptInput {
  note: string;
  assetId: string;
  world: string;
  /** How the maker described this world, in their own words (the first request), if any. */
  description: string | null;
  /** True when the world already draws library pictures, which are pixel art. */
  usesLibrary: boolean;
  /** True when the picture is drawn over the look picture of the world it is written in. */
  reference?: boolean;
}

/**
 * The picture's look is the world's: what its maker asked for, and the library art it already
 * shows. What stays fixed is only what an asset slot needs to work in any look.
 */
export function assetPrompt(input: AssetPromptInput): string {
  const look = [
    input.description === null
      ? null
      : `The world's maker described it as: "${input.description.slice(0, 400)}". Draw in the look that description implies.`,
    input.usesLibrary
      ? "Match the pixel-art look of the library pictures this world already uses."
      : null,
    input.reference === true
      ? "The input picture is the look of the land this world opens from: match its palette, light and brushwork, but draw only the subject."
      : null,
    "Keep one consistent look with this world's other pictures.",
  ].filter((line) => line !== null);
  return [
    `Game asset for the world "${input.world}": ${input.note || input.assetId}.`,
    ...look,
    "Single centred subject, transparent background, no text, no frame, no watermark, readable at 32 pixels.",
  ].join(" ");
}

function aborted(): Result<never> {
  return err("cancelled", "The picture was cancelled; nothing was changed.");
}

export function openAiImageProvider(): ImageProvider {
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1-mini";
  return {
    id: "openai",
    model,
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

/** The provider every asset request uses today. */
export function imageProvider(): ImageProvider {
  return openAiImageProvider();
}
