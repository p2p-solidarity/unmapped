// The image-provider seam, main process only (Rule 6: keys never reach a renderer). A generated
// picture is only ever a candidate for one declared slot: it goes through the same draft → player
// check → compare-and-set path as a picked file, and its time and token use are recorded. No key,
// no picture — the caller gets an actionable error, never a stand-in.
//
// Which model draws is behind `ImageProvider` (rev 6: the model must be replaceable before anything
// is sold): swapping the model is swapping this object. Each one names the licence its pictures
// carry (a `@shared/licence` record id) and where it runs (rev 6 phase 4, D4). How a picture looks
// comes from the world itself — never one house style.

import type { ImageLocality, ImageProviderId } from "@shared/images";
import { err, type Result } from "@shared/result";

export const IMAGE_SIDE = 256;
/** A concept picture (Create's look step) is a whole scene: kept larger than an asset. */
export const CONCEPT_SIDE = 512;

export interface GeneratedImage {
  png: Uint8Array;
  provider: string;
  model: string;
  /** The licence record this picture was drawn under (`@shared/licence`), stored beside it. */
  licence: string;
  /**
   * Whether the reference picture was really used. A provider that could not use one says false
   * here, so the caller never claims "drawn over the look" for a picture that was not.
   */
  usedReference: boolean;
  elapsedMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  /** The provider's own request, for the log ("images.generate", "images.edit"). */
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
  /** A provider the device can choose, or `hosted`: the gateway drawing for it (./hosted.ts). */
  readonly id: ImageProviderId | "hosted";
  /** The model it will draw with, known before any request (the usage ledger needs it). */
  readonly model: string;
  /** The licence record its pictures carry. */
  readonly licence: string;
  readonly locality: ImageLocality;
  /** Where its requests go (a server address, never a secret). */
  readonly endpoint: string;
  generate(
    prompt: string,
    signal: AbortSignal,
    options?: ImageOptions,
  ): Promise<Result<GeneratedImage>>;
}

export function aborted(): Result<never> {
  return err("cancelled", "The picture was cancelled; nothing was changed.");
}
