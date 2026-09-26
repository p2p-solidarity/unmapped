// Commercial mode and picture licences (rev 6 phase 4, D4). Isolated because E2E can reach each
// flow once, but not an edited images.json or every way a revision can smuggle a picture in.
// Written before `src/main/images/{registry,choice,cartridgeLicences,workLicences}.ts`; each test
// names the failure it guards:
//
//  1. A non-commercial provider chosen in commercial mode — the choice is stored, and every later
//     picture is drawn under a licence that forbids selling it.
//  2. A non-commercial provider called in commercial mode — a choice made before the switch was
//     turned on (or by the gateway) still draws.
//  3. images.json tampering — an edited file injects a server address or key, names a provider the
//     build does not have, or cannot be parsed, and main uses it (or crashes) instead of falling
//     back to the default and saying so.
//  4. A published revision adding an unknown-licence picture in commercial mode — Create's publish
//     (or a crafted `cartridges:publish`) lands a picture nobody can vouch for.
//  5. An inherited picture refused — a revision that keeps its parent's picture unchanged is
//     blocked, so a world made before phase 4 can never get a new revision.
//  6. A renderer-supplied licences.json trusted — the untrusted renderer claims `cc0` for a
//     picture and main publishes the claim.
//  7. An AI world publishing a new non-commercial picture in commercial mode, or an edited
//     licences.json beside a published revision laundering a picture's licence.

import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256 } from "@main/cartridges/integrity";
import { publishCartridgeRevision, readCartridgeRevision } from "@main/cartridges/store";
import { licenseCartridge } from "@main/images/cartridgeLicences";
import { imageChoicePath, readImageChoice } from "@main/images/choice";
import { setGatewayCommercialSource } from "@main/images/commercial";
import { drawnRecord, writeDrawnRecord } from "@main/images/drawn";
import { chooseImageProvider, initImages, selectImageProvider } from "@main/images/registry";
import { readWorkLicences, recordWorkPicture, workLicensing } from "@main/images/workLicences";
import { createDraft, publishDraft, settleCandidate, writeCandidate } from "@main/works/drafts";
import type { WorkDirs } from "@main/works/store";
import type { PublishCartridgeInput } from "@shared/cartridge";
import { LICENCES_FILE, parseLicenceFile } from "@shared/images";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tinyPng } from "../fixtures/images/fakeQwen";
import { v2CartridgeInput } from "../fixtures/v2";

const COMMERCIAL = { UNMAPPED_COMMERCIAL: "1" };
const OFF = {};

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "licence-"));
  initImages(root);
});

afterEach(async () => {
  setGatewayCommercialSource(null);
  await rm(root, { recursive: true, force: true });
});

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.value;
}

function code(result: { ok: boolean; error?: { code: string } }): string | null {
  return result.ok ? null : (result.error?.code ?? null);
}

describe("which provider may draw", () => {
  it("[1] refuses to store a non-commercial choice in commercial mode", async () => {
    expect(code(await chooseImageProvider("qwen-image-2.1", COMMERCIAL))).toBe(
      "image-licence-noncommercial",
    );
    expect((await readImageChoice(root)).choice.provider).toBe("openai");
    expect(code(await chooseImageProvider("qwen-image-2512", COMMERCIAL))).toBeNull();
    expect((await readImageChoice(root)).choice.provider).toBe("qwen-image-2512");
  });

  it("[2] refuses to draw with a non-commercial choice made before the switch", async () => {
    unwrap(await chooseImageProvider("qwen-image-2.1", OFF));
    expect(unwrap(await selectImageProvider({ env: OFF })).id).toBe("qwen-image-2.1");
    expect(code(await selectImageProvider({ env: COMMERCIAL }))).toBe(
      "image-licence-noncommercial",
    );
  });

  it("[2] applies the gateway's commercial switch as the build's", async () => {
    unwrap(await chooseImageProvider("qwen-image-2.1", OFF));
    setGatewayCommercialSource(async () => true);
    const refused = await selectImageProvider({ env: OFF });
    expect(code(refused)).toBe("image-licence-noncommercial");
    if (!refused.ok) expect(refused.error.message).toContain("(gateway)");
    setGatewayCommercialSource(async () => null);
    expect(unwrap(await selectImageProvider({ env: OFF })).id).toBe("qwen-image-2.1");
  });

  it("[3] ignores an edited images.json that adds an address or key, and says so", async () => {
    await writeFile(
      imageChoicePath(root),
      JSON.stringify({
        v: 1,
        provider: "openai",
        baseUrl: "https://collector.example/v1",
        key: "x",
      }),
    );
    const read = await readImageChoice(root);
    expect(read.choice.provider).toBe("openai");
    expect(read.problem?.code).toBe("image-choice-invalid");
    const provider = unwrap(await selectImageProvider({ env: OFF }));
    expect(provider.endpoint).toBe("https://api.openai.com/v1");
  });

  it("[3] falls back from an unknown provider or a broken file", async () => {
    for (const text of ['{"v":1,"provider":"dall-e-free"}', "{not json", '{"v":2}']) {
      await writeFile(imageChoicePath(root), text);
      const read = await readImageChoice(root);
      expect(read.choice.provider, text).toBe("openai");
      expect(read.problem?.code, text).toBe("image-choice-invalid");
    }
  });

  it("[3] still refuses an edited file that names a non-commercial provider", async () => {
    await writeFile(imageChoicePath(root), '{"v":1,"provider":"qwen-image-2.1"}');
    expect(code(await selectImageProvider({ env: COMMERCIAL }))).toBe(
      "image-licence-noncommercial",
    );
  });
});

describe("publishing a cartridge's pictures", () => {
  const cartridgesDir = () => join(root, "cartridges");
  const workspacesDir = () => join(root, "workspaces");
  const dirs = () => ({ cartridgesDir: cartridgesDir(), workspacesDir: workspacesDir() });
  const LOOK = tinyPng(false);
  const EXTRA = tinyPng(true);

  async function parent(): Promise<PublishCartridgeInput & { hash: `sha256:${string}` }> {
    const input = { ...v2CartridgeInput("2.0.0"), assets: { "look.png": LOOK } };
    const licensed = unwrap(await licenseCartridge(dirs(), input, OFF));
    const manifest = unwrap(await publishCartridgeRevision(cartridgesDir(), licensed));
    return { ...licensed, hash: manifest.contentHash };
  }

  function child(
    base: PublishCartridgeInput & { hash: `sha256:${string}` },
    assets: Record<string, Uint8Array>,
  ): PublishCartridgeInput {
    const fresh = v2CartridgeInput("2.0.1");
    return {
      ...fresh,
      manifest: {
        ...fresh.manifest,
        lineage: {
          kind: "revision",
          parent: { cartridgeId: "v2-world", version: "2.0.0", contentHash: base.hash },
        },
      },
      assets,
    };
  }

  function licencesOf(input: PublishCartridgeInput) {
    const bytes = input.assets?.[LICENCES_FILE];
    return bytes === undefined ? null : parseLicenceFile(new TextDecoder().decode(bytes));
  }

  it("[4] names a picture nobody recorded `unknown`, and refuses it in commercial mode", async () => {
    const input = { ...v2CartridgeInput("2.0.0"), assets: { "look.png": LOOK } };
    const refused = await licenseCartridge(dirs(), input, COMMERCIAL);
    expect(code(refused)).toBe("image-licence-redraw");
    if (!refused.ok) expect(refused.error.message).toContain("look.png");
    const off = unwrap(await licenseCartridge(dirs(), input, OFF));
    expect(licencesOf(off)?.pictures["look.png"]).toEqual({
      sha256: sha256(LOOK),
      licence: "unknown",
      inherited: false,
    });
  });

  it("[4] publishes a look this device drew under a commercial licence", async () => {
    const looks = join(workspacesDir(), "create.abcdefgh", "looks");
    const record = drawnRecord(LOOK, { licence: "openai-terms", provider: "openai", model: "m" });
    await writeDrawnRecord(looks, "0123456789abcdef", record);
    const input = { ...v2CartridgeInput("2.0.0"), assets: { "look.png": LOOK } };
    const licensed = unwrap(await licenseCartridge(dirs(), input, COMMERCIAL));
    expect(licencesOf(licensed)?.pictures["look.png"]?.licence).toBe("openai-terms");
    const manifest = unwrap(await publishCartridgeRevision(cartridgesDir(), licensed));
    const read = unwrap(await readCartridgeRevision(cartridgesDir(), "v2-world", "2.0.0"));
    expect(manifest.files.map((file) => file.path)).toContain(`assets/${LICENCES_FILE}`);
    expect(read.assets[LICENCES_FILE]).toBeDefined();
  });

  it("[4] refuses a new unknown picture beside an inherited one, naming only the new one", async () => {
    const base = await parent();
    const refused = await licenseCartridge(
      dirs(),
      child(base, { "look.png": LOOK, "extra.png": EXTRA }),
      COMMERCIAL,
    );
    expect(code(refused)).toBe("image-licence-redraw");
    if (!refused.ok) {
      expect(refused.error.message).toContain("extra.png");
      expect(refused.error.message).not.toContain("look.png");
    }
  });

  it("[5] lets an inherited unknown picture through, listed as inherited", async () => {
    const base = await parent();
    const licensed = unwrap(
      await licenseCartridge(dirs(), child(base, { "look.png": LOOK }), COMMERCIAL),
    );
    expect(licencesOf(licensed)?.pictures["look.png"]).toEqual({
      sha256: sha256(LOOK),
      licence: "unknown",
      inherited: true,
    });
    unwrap(await publishCartridgeRevision(cartridgesDir(), licensed));
  });

  it("[6] replaces a licences.json the renderer sent", async () => {
    const claim = new TextEncoder().encode(
      JSON.stringify({
        v: 1,
        pictures: { "look.png": { sha256: sha256(LOOK), licence: "cc0", inherited: false } },
      }),
    );
    const input = {
      ...v2CartridgeInput("2.0.0"),
      assets: { "look.png": LOOK, [LICENCES_FILE]: claim },
    };
    expect(code(await licenseCartridge(dirs(), input, COMMERCIAL))).toBe("image-licence-redraw");
    const off = unwrap(await licenseCartridge(dirs(), input, OFF));
    expect(licencesOf(off)?.pictures["look.png"]?.licence).toBe("unknown");
  });
});

describe("publishing an AI world's pictures", () => {
  let dirs: WorkDirs;
  beforeEach(() => {
    dirs = {
      worksDir: join(root, "works"),
      playsDir: join(root, "work-plays"),
      draftsDir: join(root, "work-drafts"),
    };
  });

  async function draftWith(images: Record<string, Uint8Array>) {
    const draft = unwrap(await createDraft(dirs, "Licensed world"));
    const { candidate } = unwrap(
      await writeCandidate(dirs, {
        draftId: draft.draftId,
        parent: null,
        kind: "generate",
        request: "a world",
        summary: "one",
        text: { main: "host.root.textContent = 'one';", style: "", assets: "{}" },
        changed: ["main.js", "style.css", "assets.json"],
        metrics: null,
        images,
      }),
    );
    unwrap(
      await settleCandidate(dirs, {
        draftId: draft.draftId,
        candidateId: candidate.id,
        outcome: "playable",
        error: null,
        expectedHead: null,
      }),
    );
    return draft.draftId;
  }

  const BOAT = tinyPng(true);

  it("[7] refuses a new non-commercial picture in commercial mode, and writes nothing", async () => {
    const draftId = await draftWith({ "assets/boat.png": BOAT });
    unwrap(
      await recordWorkPicture(dirs, draftId, BOAT, {
        licence: "qwen-research",
        provider: "qwen-image-2.1",
        model: "Qwen/Qwen-Image-2.1",
      }),
    );
    const commercial = workLicensing(dirs, draftId, COMMERCIAL);
    const refused = await publishDraft(dirs, draftId, new Date(), commercial);
    expect(code(refused)).toBe("image-licence-redraw");
    expect(await readdir(dirs.worksDir).catch(() => [])).toEqual([]);
    const published = unwrap(
      await publishDraft(dirs, draftId, new Date(), workLicensing(dirs, draftId, OFF)),
    );
    const file = unwrap(
      await readWorkLicences(dirs, published.manifest.workId, published.manifest.version),
    );
    expect(file.pictures["assets/boat.png"]?.licence).toBe("qwen-research");
  });

  it("[7] lets a player-supplied picture through and lists an inherited one", async () => {
    const draftId = await draftWith({ "assets/boat.png": BOAT });
    unwrap(
      await recordWorkPicture(dirs, draftId, BOAT, {
        licence: "player-supplied",
        provider: null,
        model: null,
      }),
    );
    const first = unwrap(
      await publishDraft(dirs, draftId, new Date(), workLicensing(dirs, draftId, COMMERCIAL)),
    );
    const again = unwrap(
      await publishDraft(dirs, draftId, new Date(), workLicensing(dirs, draftId, COMMERCIAL)),
    );
    expect(again.manifest.version).not.toBe(first.manifest.version);
    const file = unwrap(
      await readWorkLicences(dirs, again.manifest.workId, again.manifest.version),
    );
    expect(file.pictures["assets/boat.png"]).toMatchObject({
      licence: "player-supplied",
      inherited: true,
    });
  });

  it("[7] reads an edited licences.json entry as unknown", async () => {
    const draftId = await draftWith({ "assets/boat.png": BOAT });
    const published = unwrap(
      await publishDraft(dirs, draftId, new Date(), workLicensing(dirs, draftId, OFF)),
    );
    const { workId, version } = published.manifest;
    const path = join(dirs.worksDir, workId, version, LICENCES_FILE);
    await mkdir(join(dirs.worksDir, workId, version), { recursive: true });
    await writeFile(
      path,
      JSON.stringify({
        v: 1,
        pictures: {
          "assets/boat.png": { sha256: sha256(EXTRA_BYTES), licence: "cc0", inherited: false },
        },
      }),
    );
    const file = unwrap(await readWorkLicences(dirs, workId, version));
    expect(file.pictures["assets/boat.png"]?.licence).toBe("unknown");
  });
});

const EXTRA_BYTES = tinyPng(false);
