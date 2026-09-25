import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { BIBLE_FILES, type CartridgeRevision, dialogueFile } from "@shared/cartridge";
import { fail, ok, type Result, toError } from "@shared/result";
import { STORY_FILE, storyText } from "@shared/story";
import { cartridgeScenePath } from "./paths";

const MANIFEST_FILE = "manifest.json";
const RULES_FILE = "rules.oui";

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function writeRevisionFiles(
  destination: string,
  revision: CartridgeRevision,
): Promise<Result<void>> {
  const parent = dirname(destination);
  await mkdir(parent, { recursive: true });
  const staging = join(
    parent,
    `.staging-${revision.manifest.version}-${process.pid}-${Date.now()}`,
  );
  try {
    await mkdir(join(staging, "scenes"), { recursive: true });
    await writeFile(
      join(staging, MANIFEST_FILE),
      `${JSON.stringify(revision.manifest, null, 2)}\n`,
      "utf8",
    );
    await writeFile(join(staging, RULES_FILE), revision.rules, "utf8");
    for (const [id, source] of Object.entries(revision.scenes)) {
      await writeFile(cartridgeScenePath(staging, id), source, "utf8");
    }
    for (const [key, source] of Object.entries(revision.dialogues)) {
      const target = join(staging, dialogueFile(key));
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, source, "utf8");
    }
    if (revision.bible !== null) {
      await mkdir(join(staging, "bible"), { recursive: true });
      await writeFile(join(staging, BIBLE_FILES.core), revision.bible.core, "utf8");
      await writeFile(join(staging, BIBLE_FILES.style), revision.bible.style, "utf8");
    }
    if (revision.story !== null && revision.story !== undefined) {
      await mkdir(join(staging, "bible"), { recursive: true });
      await writeFile(join(staging, STORY_FILE), storyText(revision.story), "utf8");
    }
    for (const [path, bytes] of Object.entries(revision.assets)) {
      const target = join(staging, "assets", path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
    }
    await rename(staging, destination);
    return ok(undefined);
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    return fail(toError(error, "cartridge-publish-failed"));
  }
}

export async function listRevisionFiles(revisionDir: string): Promise<string[]> {
  const root = (await readdir(revisionDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  const sceneEntries = await readdir(join(revisionDir, "scenes"), { withFileTypes: true });
  const files = [
    ...root,
    ...sceneEntries.filter((entry) => entry.isFile()).map((entry) => `scenes/${entry.name}`),
  ];
  const dialogueRoot = join(revisionDir, "dialogue");
  if (await exists(dialogueRoot)) {
    for (const sceneEntry of await readdir(dialogueRoot, { withFileTypes: true })) {
      if (!sceneEntry.isDirectory()) continue;
      const npcEntries = await readdir(join(dialogueRoot, sceneEntry.name), {
        withFileTypes: true,
      });
      for (const npcEntry of npcEntries) {
        if (npcEntry.isFile()) files.push(`dialogue/${sceneEntry.name}/${npcEntry.name}`);
      }
    }
  }
  const bibleRoot = join(revisionDir, "bible");
  if (await exists(bibleRoot)) {
    for (const entry of await readdir(bibleRoot, { withFileTypes: true })) {
      files.push(`bible/${entry.name}`);
    }
  }
  const assetsRoot = join(revisionDir, "assets");
  if (await exists(assetsRoot)) {
    async function visit(dir: string, prefix: string): Promise<void> {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const relative = `${prefix}${entry.name}`;
        if (entry.isDirectory()) await visit(join(dir, entry.name), `${relative}/`);
        else if (entry.isFile()) files.push(`assets/${relative}`);
      }
    }
    await visit(assetsRoot, "");
  }
  return files.sort();
}
