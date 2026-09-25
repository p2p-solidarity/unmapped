// Gathering a mod's files off disk or out of a `.mod` zip. These are the checks that run before
// anything is copied into `<userData>/mods`, so they are the ones a hostile archive meets first.

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectDirFiles, collectZipFiles, writeModFiles } from "@main/mods/files";
import {
  hasModExtension,
  isModName,
  isSafeRelativePath,
  MAX_MOD_FILE_BYTES,
} from "@main/mods/paths";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const MANIFEST = `name: onsen-festival
version: 0.1.0
author: kidney.eth
description: A hot-spring undercurrent.
inject: []
prompt:
  - { name: onsen-lore, order: 420, file: prompt/lore.md }
tools: []
skills: [skills]
`;

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "aether-mods-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writeTree(root: string, files: Record<string, string>): Promise<void> {
  for (const [relative, content] of Object.entries(files)) {
    const target = join(root, ...relative.split("/"));
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, content, "utf8");
  }
}

function zipOf(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) entries[name] = strToU8(content);
  return zipSync(entries, { level: 6 });
}

describe("path guards", () => {
  it("accepts ordinary mod names and rejects the dangerous ones", () => {
    expect(isModName("onsen-festival")).toBe(true);
    expect(isModName("mod_2.0")).toBe(true);
    expect(isModName("")).toBe(false);
    expect(isModName("..")).toBe(false);
    expect(isModName("../escape")).toBe(false);
    expect(isModName("Onsen")).toBe(false);
    expect(isModName("a/b")).toBe(false);
  });

  it("rejects every shape of traversal in a relative path", () => {
    expect(isSafeRelativePath("prompt/lore.md")).toBe(true);
    expect(isSafeRelativePath("skills/lantern-rite/SKILL.md")).toBe(true);
    expect(isSafeRelativePath("../../etc/passwd")).toBe(false);
    expect(isSafeRelativePath("prompt/../../x.md")).toBe(false);
    expect(isSafeRelativePath("/etc/passwd")).toBe(false);
    expect(isSafeRelativePath("C:/windows/x.md")).toBe(false);
    expect(isSafeRelativePath("prompt\\lore.md")).toBe(false);
    expect(isSafeRelativePath("prompt//lore.md")).toBe(false);
    expect(isSafeRelativePath("./lore.md")).toBe(false);
  });

  it("only recognises the four text extensions", () => {
    expect(hasModExtension("mod.yml")).toBe(true);
    expect(hasModExtension("prompt/lore.md")).toBe(true);
    expect(hasModExtension("data/table.json")).toBe(true);
    expect(hasModExtension("notes.txt")).toBe(true);
    expect(hasModExtension("payload.js")).toBe(false);
    expect(hasModExtension("native.node")).toBe(false);
    expect(hasModExtension("art.png")).toBe(false);
  });
});

describe("collectDirFiles", () => {
  it("collects the text files and silently leaves everything else behind", async () => {
    const src = join(dir, "src");
    await writeTree(src, {
      "mod.yml": MANIFEST,
      "prompt/lore.md": "# lore",
      "skills/lantern-rite/SKILL.md": "# rite",
      "README.txt": "hello",
      "payload.js": "process.exit(1)",
    });
    const files = await collectDirFiles(src);
    expect(files.ok).toBe(true);
    if (!files.ok) return;
    expect(Object.keys(files.value).sort()).toEqual([
      "README.txt",
      "mod.yml",
      "prompt/lore.md",
      "skills/lantern-rite/SKILL.md",
    ]);
    expect(files.value["prompt/lore.md"]).toBe("# lore");
  });

  it("refuses a file over the size limit", async () => {
    const src = join(dir, "src");
    await writeTree(src, { "mod.yml": MANIFEST });
    await writeFile(join(src, "huge.md"), "x".repeat(MAX_MOD_FILE_BYTES + 1), "utf8");
    const files = await collectDirFiles(src);
    expect(files.ok).toBe(false);
    if (!files.ok) expect(files.error.code).toBe("mod-file-too-large");
  });
});

describe("collectZipFiles", () => {
  it("rejects an oversize entry", () => {
    const files = collectZipFiles(
      zipOf({ "mod.yml": MANIFEST, "huge.md": "x".repeat(MAX_MOD_FILE_BYTES + 1) }),
    );
    expect(files.ok).toBe(false);
    if (!files.ok) expect(files.error.code).toBe("mod-file-too-large");
  });

  it("rejects bytes that are not a zip at all", () => {
    const files = collectZipFiles(strToU8("not a zip"));
    expect(files.ok).toBe(false);
    if (!files.ok) expect(files.error.code).toBe("mod-unreadable");
  });
});

describe("writeModFiles", () => {
  it("replaces a previous install instead of merging into it", async () => {
    await writeModFiles(dir, "onsen-festival", { "mod.yml": MANIFEST, "old.md": "gone" });
    const written = await writeModFiles(dir, "onsen-festival", { "mod.yml": MANIFEST });
    expect(written.ok).toBe(true);
    await expect(readFile(join(dir, "onsen-festival", "old.md"), "utf8")).rejects.toThrow();
  });
});
