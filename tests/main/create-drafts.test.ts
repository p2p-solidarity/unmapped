// Create a game drafts and their look pictures, in main (rev 6 phase 2, D1). What could go wrong
// that an E2E run would not reach:
//   1. A draft saved before the look step (no `look`, no `world.locked`, a basis with a name, step
//      "story") no longer reads after the schema grew: the player's draft shows as broken (loss).
//   2. A draft file whose `look.chosen` names a picture it does not hold is accepted (untrusted
//      file): Build would publish no picture, or the wrong one, for the one the player chose.
//   3. A file in looks/ that is not a PNG, or whose name is not a picture id, is read back out to
//      the renderer (and from there into a published cartridge).
//   4. A picture that lands after its draft was deleted brings the draft's folder back.
//   5. Discarding before a redraw deletes the chosen picture.
//   6. The model's reply to "rewrite the unlocked cards" carries a part that was not asked for (a
//      locked card) and it is read back, or a missing asked part passes as if written.

import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createCreateDraft,
  readCreateDraft,
  removeCreateDraft,
  saveCreateDraft,
} from "@main/workspaces/createDrafts";
import { discardLooks, readLooks, storeLook } from "@main/workspaces/createLooks";
import { parseBibleCards } from "@shared/bible";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const IDEA = {
  name: "",
  intent: "A desert city of clocks",
  story: "",
  language: "en-US",
  play: { fights: "none" as const, weapon: "" },
};
const FIELDS = {
  premise: "Clocks everywhere.",
  tone: "Dry and warm.",
  rules: ["Time is sold by the hour.", "Sand is swept at dawn.", "Bells mean noon."],
  taboos: ["Magic", "Monsters"],
  naming: "Two-word names.",
  voice: "Short sentences.",
  look: "Sandstone towers with brass faces.",
};

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aether-create-drafts-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.value;
}

describe("a Create draft", () => {
  it("still reads when it was saved before the look step and card locks (1)", async () => {
    const draft = unwrap(await createCreateDraft(root, IDEA));
    const old = {
      ...draft,
      step: "story",
      world: {
        fields: FIELDS,
        edited: [],
        basis: {
          name: "Clockwork",
          intent: IDEA.intent,
          material: "",
          language: "en-US",
          fights: "none",
        },
        rev: 1,
      },
    };
    await writeFile(join(root, `create.${draft.draftId}`, "draft.json"), JSON.stringify(old));
    const read = unwrap(await readCreateDraft(root, draft.draftId));
    expect(read.step).toBe("story");
    expect(read.look).toBeUndefined();
    expect(read.world?.locked).toBeUndefined();
  });

  it("refuses a chosen picture the draft does not hold (2)", async () => {
    const draft = unwrap(await createCreateDraft(root, IDEA));
    const saved = await saveCreateDraft(root, {
      ...draft,
      look: { pictures: ["0123456789abcdef"], chosen: "fedcba9876543210" },
    });
    expect(saved.ok).toBe(false);
  });
});

describe("the look pictures of a draft", () => {
  it("reads back only sound PNGs under picture ids (3)", async () => {
    const draft = unwrap(await createCreateDraft(root, IDEA));
    const kept = unwrap(await storeLook(root, draft.draftId, PNG));
    const looks = join(root, `create.${draft.draftId}`, "looks");
    await writeFile(join(looks, "aaaaaaaaaaaaaaaa.png"), "not a png");
    await writeFile(join(looks, "notanid.png"), PNG);
    const read = unwrap(await readLooks(root, draft.draftId));
    expect(read.map((one) => one.id)).toEqual([kept.id]);
    expect(read[0]?.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect((await storeLook(root, draft.draftId, new Uint8Array([1, 2, 3]))).ok).toBe(false);
  });

  it("does not bring a deleted draft back (4)", async () => {
    const draft = unwrap(await createCreateDraft(root, IDEA));
    const removal = removeCreateDraft(root, draft.draftId);
    const late = storeLook(root, draft.draftId, PNG);
    unwrap(await removal);
    expect((await late).ok).toBe(false);
    expect((await readdir(root)).filter((name) => name.includes(draft.draftId))).toEqual([]);
  });

  it("keeps the chosen picture when the rest are discarded (5)", async () => {
    const draft = unwrap(await createCreateDraft(root, IDEA));
    const chosen = unwrap(await storeLook(root, draft.draftId, PNG));
    unwrap(await storeLook(root, draft.draftId, PNG));
    unwrap(await discardLooks(root, draft.draftId, [chosen.id]));
    expect(unwrap(await readLooks(root, draft.draftId)).map((one) => one.id)).toEqual([chosen.id]);
  });
});

describe("rewriting the unlocked cards", () => {
  it("reads only the asked parts, and every one of them must be there (6)", () => {
    const reply =
      "@@premise\nA new premise.\n@@tone\nBright.\n@@rules\n- One.\n- Two.\n- Three.\n@@end";
    const parts = unwrap(parseBibleCards(["tone", "rules"], reply));
    expect(Object.keys(parts).sort()).toEqual(["rules", "tone"]);
    expect(parseBibleCards(["tone", "look"], reply).ok).toBe(false);
  });
});
