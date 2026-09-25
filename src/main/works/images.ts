// Image generation for world assets, main process only (Rule 6: the key never reaches a renderer).
// A generated picture is only ever a candidate image for one declared asset slot: it goes through
// the same draft → player check → compare-and-set path as a picked file, and its time and token
// use are recorded. No key, no picture — the caller gets an actionable error, never a stand-in.

import { resolveApiKey } from "@main/inference/keyStore";
import { PROVIDER_PRESETS } from "@shared/llm";
import { err, ok, type Result } from "@shared/result";
import { nativeImage } from "electron";
import OpenAI from "openai";

export const IMAGE_SIDE = 256;

export interface GeneratedImage {
  png: Uint8Array;
  model: string;
  elapsedMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

/** A consistent look for every generated asset, so worlds do not drift between art styles. */
export function assetPrompt(input: { note: string; assetId: string; world: string }): string {
  return [
    `16-bit pixel art game asset for "${input.world}": ${input.note || input.assetId}.`,
    "Single centred subject, crisp outlines, limited palette, soft top-left light,",
    "transparent background, no text, no frame, no watermark, readable at 32 pixels.",
  ].join(" ");
}

export async function generateImage(prompt: string): Promise<Result<GeneratedImage>> {
  // The same lookup chat uses: the key saved in System → Model, else OPENAI_API_KEY from .env.
  const key = await resolveApiKey({ ...PROVIDER_PRESETS.openai, sidecar: null });
  if (key === null) {
    return err(
      "no-api-key",
      "No OpenAI key is set.",
      "Enter one in System → Model (Cloud API → OpenAI), or add OPENAI_API_KEY to .env.",
    );
  }
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1-mini";
  const quality = (process.env.OPENAI_IMAGE_QUALITY || "medium") as "low" | "medium" | "high";
  const started = performance.now();
  try {
    // Explicit, so an OPENAI_BASE_URL in the environment cannot redirect the key.
    const client = new OpenAI({ apiKey: key.key, baseURL: PROVIDER_PRESETS.openai.baseUrl });
    const response = await client.images.generate({
      model,
      prompt: prompt.slice(0, 4_000),
      size: "1024x1024",
      quality,
      background: "transparent",
      output_format: "png",
      n: 1,
    });
    const b64 = response.data?.[0]?.b64_json;
    if (b64 === undefined) return err("image-empty", "The image service returned no image.");
    // Worlds draw pixel art scaled up; 256 px keeps the asset small without losing the look.
    const png = nativeImage
      .createFromBuffer(Buffer.from(b64, "base64"))
      .resize({ width: IMAGE_SIDE, height: IMAGE_SIDE, quality: "good" })
      .toPNG();
    return ok({
      png: new Uint8Array(png),
      model,
      elapsedMs: Math.round(performance.now() - started),
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return err(
      "image-failed",
      `Image generation failed: ${message}`,
      "Check the key, the model name and your API quota.",
    );
  }
}
