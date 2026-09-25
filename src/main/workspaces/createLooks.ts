// Concept pictures for Create a game's look step (rev 6 phase 2, D1): drawn from the draft's own
// Look card, premise and name, kept beside its draft.json as <workspaces>/create.<draftId>/looks/
// <id>.png, and shown to the renderer only as data URLs (Rule 6: no path ever leaves main). The
// chosen one is published inside the cartridge by Build (`LOOK_PICTURE_ASSET`); the rest die with
// the draft. Every write goes through the draft's write queue, so a picture that lands after the
// draft was deleted cannot bring its folder back. A file here is untrusted on the way back in:
// only `<16 hex>.png` names holding a real PNG within the size limit are ever read out.

import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type CreateDraft,
  DRAFT_ID,
  LOOK_PICTURE_ID,
  LOOK_PICTURE_MAX_BYTES,
  LOOK_PICTURES_MAX,
  type LookPicture,
} from "@shared/createDraft";
import { err, fail, ok, type Result, toError } from "@shared/result";
import { DRAFT_FILE, draftDir, serialized } from "./createDrafts";

const LOOKS = "looks";
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength > PNG_SIGNATURE.length && PNG_SIGNATURE.every((byte, at) => bytes[at] === byte)
  );
}

/** What each of the three pictures of one draw shows, so the player chooses between looks. */
const VIEWS = [
  "A lived-in street or square where the people of this world spend their days.",
  "The open land at the edge of what is mapped, with a way leading on into it.",
  "A home or a workplace of this world seen up close, with the things people use every day.",
] as const;
export const LOOK_VIEWS = VIEWS.length;

/**
 * The picture's prompt, from the draft as main last saved it. The look is the world's own words;
 * nothing here names a period, genre or rendering style of its own.
 */
export function lookPrompt(draft: CreateDraft, view: number): Result<string> {
  const world = draft.world;
  const look = world?.fields.look.trim() ?? "";
  if (world === null || look === "") {
    return err(
      "create-look-no-card",
      "The world has no look card yet.",
      "Write the look card on the world step first.",
    );
  }
  const name = draft.idea.name.trim() || draft.idea.intent.trim().slice(0, 60);
  return ok(
    [
      `Concept picture for a game world called "${name.slice(0, 60)}".`,
      `The world: ${world.fields.premise.trim().slice(0, 600)}`,
      `How it looks: ${look.slice(0, 300)}`,
      `Show: ${VIEWS[view % VIEWS.length]}`,
      "Draw it exactly the way the look describes — its buildings, materials, colours and era — as one finished picture.",
      "No text, no letters, no writing on signs, no frame, no border, no watermark, no interface.",
    ].join("\n"),
  );
}

function looksDir(workspacesDir: string, draftId: string): string {
  return join(draftDir(workspacesDir, draftId), LOOKS);
}

function dataUrl(bytes: Uint8Array): string {
  return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function pictureIds(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".png"))
      .map((entry) => entry.name.slice(0, -".png".length))
      .filter((id) => LOOK_PICTURE_ID.test(id));
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === "ENOENT") return [];
    throw error;
  }
}

const idProblem = (draftId: string): Result<never> | null =>
  DRAFT_ID.test(draftId) ? null : err("create-draft-id-invalid", "That is not a draft id.");

/** Keeps one drawn picture with its draft; refused when the draft is gone or already full. */
export async function storeLook(
  workspacesDir: string,
  draftId: string,
  png: Uint8Array,
): Promise<Result<LookPicture>> {
  const bad = idProblem(draftId);
  if (bad !== null) return bad;
  if (!isPng(png) || png.byteLength > LOOK_PICTURE_MAX_BYTES) {
    return err("create-look-invalid", "The picture is not a PNG within 4 MB.");
  }
  const dir = draftDir(workspacesDir, draftId);
  return serialized(dir, async () => {
    if (!(await exists(join(dir, DRAFT_FILE)))) {
      return err("create-draft-missing", `The draft ${draftId} is gone.`);
    }
    try {
      const target = join(dir, LOOKS);
      if ((await pictureIds(target)).length >= LOOK_PICTURES_MAX) {
        return err(
          "create-look-full",
          `This draft already keeps ${LOOK_PICTURES_MAX} pictures.`,
          "Draw again: it replaces every picture but the one you chose.",
        );
      }
      await mkdir(target, { recursive: true });
      const id = randomBytes(8).toString("hex");
      const path = join(target, `${id}.png`);
      const temp = `${path}.tmp-${process.pid}`;
      await writeFile(temp, png);
      await rename(temp, path);
      return ok({ id, dataUrl: dataUrl(png) });
    } catch (error) {
      return fail(toError(error, "create-look-write-failed"));
    }
  });
}

/** Every picture the draft keeps, as data URLs; a file that is not a sound PNG is left out. */
export async function readLooks(
  workspacesDir: string,
  draftId: string,
): Promise<Result<LookPicture[]>> {
  const bad = idProblem(draftId);
  if (bad !== null) return bad;
  const dir = looksDir(workspacesDir, draftId);
  try {
    const pictures: LookPicture[] = [];
    for (const id of await pictureIds(dir)) {
      const bytes = new Uint8Array(await readFile(join(dir, `${id}.png`)));
      if (isPng(bytes) && bytes.byteLength <= LOOK_PICTURE_MAX_BYTES) {
        pictures.push({ id, dataUrl: dataUrl(bytes) });
      }
    }
    return ok(pictures);
  } catch (error) {
    return fail(toError(error, "create-look-read-failed"));
  }
}

/** Deletes every picture of the draft but `keep` (the chosen one, before a redraw). */
export async function discardLooks(
  workspacesDir: string,
  draftId: string,
  keep: readonly string[],
): Promise<Result<void>> {
  const bad = idProblem(draftId);
  if (bad !== null) return bad;
  const dir = draftDir(workspacesDir, draftId);
  return serialized(dir, async () => {
    try {
      const target = join(dir, LOOKS);
      for (const id of await pictureIds(target)) {
        if (!keep.includes(id)) await rm(join(target, `${id}.png`), { force: true });
      }
      return ok(undefined);
    } catch (error) {
      return fail(toError(error, "create-look-remove-failed"));
    }
  });
}
