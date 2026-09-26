// The device's image-provider choice: `<userData>/images.json`, main-owned and zod-checked on
// every read and write like `inference.json`. It holds one provider id and nothing else — no URL
// and no key — so an edited file can only ever pick among the providers this build ships, and
// commercial mode is checked again when a picture is drawn (./registry.ts). A file that does not
// read falls back to the default and says so (Rule 5), so the app still draws.

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type ImageChoice, imageChoiceSchema } from "@shared/images";
import { type AppError, fail, ok, type Result, toError } from "@shared/result";

export const IMAGES_FILE = "images.json";

/** Today's behaviour when nothing was chosen: OpenAI, as before phase 4. */
export const DEFAULT_IMAGE_CHOICE: ImageChoice = { v: 1, provider: "openai" };

export function imageChoicePath(userData: string): string {
  return join(userData, IMAGES_FILE);
}

export interface ReadChoice {
  choice: ImageChoice;
  /** Why the file was not used (it is then the default); null when it read or was absent. */
  problem: AppError | null;
}

export async function readImageChoice(userData: string): Promise<ReadChoice> {
  let text: string;
  try {
    text = await readFile(imageChoicePath(userData), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { choice: DEFAULT_IMAGE_CHOICE, problem: null };
    }
    return { choice: DEFAULT_IMAGE_CHOICE, problem: toError(error, "image-choice-invalid") };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = null;
  }
  const parsed = imageChoiceSchema.safeParse(raw);
  if (parsed.success) return { choice: parsed.data, problem: null };
  return {
    choice: DEFAULT_IMAGE_CHOICE,
    problem: {
      code: "image-choice-invalid",
      message: `${IMAGES_FILE} is not a valid image-provider choice; OpenAI is used until one is chosen again.`,
      hint: "Choose an image provider in Settings → Images.",
    },
  };
}

/** Validates an untrusted choice and writes it atomically. */
export async function writeImageChoice(
  userData: string,
  raw: unknown,
): Promise<Result<ImageChoice>> {
  const parsed = imageChoiceSchema.safeParse(raw);
  if (!parsed.success) {
    return fail({
      code: "image-choice-invalid",
      message: "That is not an image provider this build has.",
      hint: "Choose one of the providers listed in Settings → Images.",
    });
  }
  const path = imageChoicePath(userData);
  const temp = `${path}.tmp-${process.pid}`;
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(temp, `${JSON.stringify(parsed.data, null, 2)}\n`, "utf8");
    await rename(temp, path);
    return ok(parsed.data);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    return fail({
      ...toError(error, "image-choice-write-failed"),
      hint: "Check the app's data folder.",
    });
  }
}
