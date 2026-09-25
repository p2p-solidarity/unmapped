// The install directory end to end: a mod folder becomes a bundle, a `.mod` archive installs and
// reads back identically, and a mod that does not validate never reaches disk.
//
// These exercise `parseModManifest` / `validateModBundle` from `@harness`, so they fail to resolve
// until `src/harness` lands.

import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  installFromDir,
  installFromZip,
  listMods,
  readModBundle,
  removeMod,
  skillFiles,
} from "@main/mods/store";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const MANIFEST = `name: onsen-festival
version: 0.1.0
author: kidney.eth
description: Every floor gets a hot-spring undercurrent and a lantern ritual.
inject: []
prompt:
  - { name: onsen-lore, order: 420, file: prompt/lore.md }
tools:
  - name: light_lanterns
    description: Light the festival lanterns; the sky warms.
    parameters:
      color: { type: string, required: true }
    effect:
      kind: mutate_world
      skyColor: "{{color}}"
      fogDensity: 0.01
      biome: onsen_town
skills: [skills]
`;

const TREE: Record<string, string> = {
  "mod.yml": MANIFEST,
  "prompt/lore.md": "# Onsen lore\n",
  "skills/lantern-rite/SKILL.md": "---\nname: lantern-rite\ndescription: The rite.\n---\n",
  "skills/kettle.md": "---\nname: kettle\ndescription: Tea.\n---\n",
};

let root = "";
let modsDir = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aether-modstore-"));
  modsDir = join(root, "mods");
  await mkdir(modsDir, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function writeTree(dir: string, files: Record<string, string>): Promise<string> {
  for (const [relative, content] of Object.entries(files)) {
    const target = join(dir, ...relative.split("/"));
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, content, "utf8");
  }
  return dir;
}

function zipOf(files: Record<string, string>, prefix = ""): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) {
    entries[`${prefix}${name}`] = strToU8(content);
  }
  return zipSync(entries, { level: 6 });
}

describe("installFromDir + readModBundle", () => {
  it("installs a folder and reads back the manifest with its referenced files", async () => {
    const src = await writeTree(join(root, "src"), TREE);
    const installed = await installFromDir(src, modsDir);
    expect(installed.ok).toBe(true);
    if (!installed.ok) return;
    expect(installed.value).toMatchObject({
      name: "onsen-festival",
      version: "0.1.0",
      toolCount: 1,
      sectionCount: 1,
      skillCount: 2,
    });

    const bundle = await readModBundle(modsDir, "onsen-festival");
    expect(bundle.ok).toBe(true);
    if (!bundle.ok) return;
    expect(bundle.value.manifest.name).toBe("onsen-festival");
    expect(bundle.value.files["prompt/lore.md"]).toBe("# Onsen lore\n");
    expect(skillFiles(bundle.value.manifest, bundle.value.files)).toEqual([
      "skills/kettle.md",
      "skills/lantern-rite/SKILL.md",
    ]);
  });

  it("lists exactly what is installed, and an empty directory is a legitimate empty list", async () => {
    expect(await listMods(modsDir)).toEqual({ ok: true, value: [] });
    await installFromDir(await writeTree(join(root, "src"), TREE), modsDir);
    const listed = await listMods(modsDir);
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.value.map((mod) => mod.name)).toEqual(["onsen-festival"]);
  });

  it("removes a mod and then reports it missing", async () => {
    await installFromDir(await writeTree(join(root, "src"), TREE), modsDir);
    expect(await removeMod(modsDir, "onsen-festival")).toEqual({ ok: true, value: undefined });
    const gone = await readModBundle(modsDir, "onsen-festival");
    expect(gone.ok).toBe(false);
    if (!gone.ok) expect(gone.error.code).toBe("mod-missing");
  });

  it("refuses a mod name that is really a path", async () => {
    const escaped = await readModBundle(modsDir, "../../etc");
    expect(escaped.ok).toBe(false);
    if (!escaped.ok) expect(escaped.error.code).toBe("mod-name-invalid");
  });

  it("never creates an install when a referenced prompt file is missing", async () => {
    const broken = { "mod.yml": MANIFEST };
    const src = await writeTree(join(root, "broken"), broken);
    const installed = await installFromDir(src, modsDir);
    expect(installed.ok).toBe(false);
    if (!installed.ok) expect(installed.error.code).toBe("mod-file-missing");
    expect(await readdir(modsDir)).toEqual([]);
  });
});

describe("installFromZip", () => {
  it("round-trips a .mod whose contents sit at the archive root", async () => {
    const installed = await installFromZip(zipOf(TREE), modsDir);
    expect(installed.ok).toBe(true);
    const bundle = await readModBundle(modsDir, "onsen-festival");
    expect(bundle.ok).toBe(true);
    if (bundle.ok) expect(bundle.value.manifest.tools[0]?.name).toBe("light_lanterns");
  });

  it("round-trips a .mod wrapped in one top-level folder", async () => {
    const installed = await installFromZip(zipOf(TREE, "onsen-festival/"), modsDir);
    expect(installed.ok).toBe(true);
    if (installed.ok) expect(installed.value.name).toBe("onsen-festival");
  });

  it("refuses a traversal entry and installs nothing", async () => {
    const hostile = await installFromZip(zipOf({ ...TREE, "../escape.md": "no" }), modsDir);
    expect(hostile.ok).toBe(false);
    if (!hostile.ok) expect(hostile.error.code).toBe("mod-path-unsafe");
    expect(await readdir(modsDir)).toEqual([]);
  });

  it("refuses an archive carrying executable code and installs nothing", async () => {
    const hostile = await installFromZip(zipOf({ ...TREE, "payload.js": "boom" }), modsDir);
    expect(hostile.ok).toBe(false);
    if (!hostile.ok) expect(hostile.error.code).toBe("mod-file-rejected");
    expect(await readdir(modsDir)).toEqual([]);
  });

  it("refuses a manifest whose name is not a safe directory name", async () => {
    const bad = MANIFEST.replace("name: onsen-festival", "name: ../escape");
    const installed = await installFromZip(zipOf({ ...TREE, "mod.yml": bad }), modsDir);
    expect(installed.ok).toBe(false);
    expect(await readdir(modsDir)).toEqual([]);
  });
});
