// Image generation for world assets, main process only (Rule 6: the key never reaches a renderer).
// The providers, the device's choice of one and the licence each picture carries moved to
// `src/main/images/` (rev 6 phase 4, D4); this module keeps what an AI world asks a picture for
// and re-exports the rest, so existing imports keep working. How a picture looks comes from the
// world itself — never one house style.

export {
  CONCEPT_SIDE,
  type GeneratedImage,
  IMAGE_SIDE,
  type ImageOptions,
  type ImageProvider,
  openAiImageProvider,
  selectImageProvider,
} from "../images/registry";

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
