import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createDraft,
  publishDraft,
  readDraft,
  revertDraft,
  settleCandidate,
  writeCandidate,
} from "@main/works/drafts";
import { changePlay, createPlay, readPlay, readRevision, type WorkDirs } from "@main/works/store";
import type { WorkText } from "@shared/works";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let dirs: WorkDirs;
let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "works-"));
  dirs = {
    worksDir: join(root, "works"),
    playsDir: join(root, "work-plays"),
    draftsDir: join(root, "work-drafts"),
  };
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.value;
}

const TEXT: WorkText = {
  main: "host.root.textContent = 'one';",
  style: "",
  assets: '{"hero": {"src": "library/heart.png", "note": "life"}}',
};

async function playableDraft() {
  const draft = unwrap(await createDraft(dirs, "Test world"));
  const { candidate } = unwrap(
    await writeCandidate(dirs, {
      draftId: draft.draftId,
      parent: null,
      kind: "generate",
      request: "a world",
      summary: "one",
      text: TEXT,
      changed: ["main.js", "style.css", "assets.json"],
      metrics: null,
    }),
  );
  return unwrap(
    await settleCandidate(dirs, {
      draftId: draft.draftId,
      candidateId: candidate.id,
      outcome: "playable",
      error: null,
      expectedHead: null,
    }),
  );
}

describe("work drafts", () => {
  it("only moves head for a checked candidate whose base is still head", async () => {
    const draft = await playableDraft();
    expect(draft.head).toBe("c001");

    // Two edits start from c001; the first to pass wins, the late one is kept but not current.
    const edit = (main: string) =>
      writeCandidate(dirs, {
        draftId: draft.draftId,
        parent: "c001",
        kind: "edit",
        request: "change",
        summary: main,
        text: { ...TEXT, main },
        changed: ["main.js"],
        metrics: null,
      });
    const first = unwrap(await edit("host.root.textContent = 'two';")).candidate;
    const late = unwrap(await edit("host.root.textContent = 'three';")).candidate;
    const settle = (candidateId: string) =>
      settleCandidate(dirs, {
        draftId: draft.draftId,
        candidateId,
        outcome: "playable",
        error: null,
        expectedHead: "c001",
      });
    expect(unwrap(await settle(first.id)).head).toBe(first.id);
    const stale = await settle(late.id);
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe("draft-stale");
    const after = unwrap(await readDraft(dirs, draft.draftId));
    expect(after.head).toBe(first.id);
    expect(after.candidates.find((c) => c.id === late.id)?.status).toBe("stale");

    // A failed attempt never becomes current; an earlier playable one can be restored.
    const broken = unwrap(await edit("throw new Error('x');")).candidate;
    await settleCandidate(dirs, {
      draftId: draft.draftId,
      candidateId: broken.id,
      outcome: "failed",
      error: "main.js:1 Error: x",
      expectedHead: first.id,
    });
    expect(unwrap(await readDraft(dirs, draft.draftId)).head).toBe(first.id);
    expect(unwrap(await revertDraft(dirs, draft.draftId, "c001")).head).toBe("c001");
    expect((await revertDraft(dirs, draft.draftId, broken.id)).ok).toBe(false);
  });

  it("rejects candidates that point at images the world does not have", async () => {
    const draft = unwrap(await createDraft(dirs, "x"));
    const written = await writeCandidate(dirs, {
      draftId: draft.draftId,
      parent: null,
      kind: "generate",
      request: "x",
      summary: "",
      text: { ...TEXT, assets: '{"hero": {"src": "assets/hero.png", "note": ""}}' },
      changed: ["main.js"],
      metrics: null,
    });
    expect(written.ok).toBe(false);
  });
});

describe("published worlds and journeys", () => {
  it("publishes immutable revisions with lineage and detects tampering", async () => {
    const draft = await playableDraft();
    const one = unwrap(await publishDraft(dirs, draft.draftId)).manifest;
    const two = unwrap(await publishDraft(dirs, draft.draftId)).manifest;
    expect([one.version, two.version]).toEqual(["1.0.0", "1.0.1"]);
    expect(two.lineage.parent?.contentHash).toBe(one.contentHash);
    expect(unwrap(await readRevision(dirs, one.workId, one.version)).content.text).toEqual(TEXT);

    await writeFile(join(dirs.worksDir, one.workId, one.version, "main.js"), "alert(1)");
    const tampered = await readRevision(dirs, one.workId, one.version);
    expect(tampered.ok).toBe(false);
    if (!tampered.ok) expect(tampered.error.code).toBe("work-tampered");
    expect((await readRevision(dirs, "../etc", "1.0.0")).ok).toBe(false);
  });

  it("merges what a world hands back over the carry it was given", async () => {
    const draft = await playableDraft();
    const manifest = unwrap(await publishDraft(dirs, draft.draftId)).manifest;
    const ref = {
      workId: manifest.workId,
      version: manifest.version,
      contentHash: manifest.contentHash,
    };
    const play = unwrap(
      await createPlay(dirs, { title: "Story", worlds: [ref], carry: { coins: 3, wins: 3 } }),
    );
    // The world passes only what it earned (the maze in the acceptance run replaced everything).
    const done = unwrap(
      await changePlay(dirs, play.playId, {
        kind: "complete",
        world: 0,
        summary: "escaped",
        carry: { keys: 3, coins: 4 },
      }),
    );
    expect(done.carry).toEqual({ coins: 4, wins: 3, keys: 3 });
  });

  it("pins exact revisions, carries state between worlds and bounds sizes", async () => {
    const draft = await playableDraft();
    const manifest = unwrap(await publishDraft(dirs, draft.draftId)).manifest;
    const ref = {
      workId: manifest.workId,
      version: manifest.version,
      contentHash: manifest.contentHash,
    };
    const wrongHash = await createPlay(dirs, {
      title: "x",
      worlds: [{ ...ref, contentHash: `sha256:${"0".repeat(64)}` }],
    });
    expect(wrongHash.ok).toBe(false);

    const play = unwrap(await createPlay(dirs, { title: "Journey", worlds: [ref, ref] }));
    unwrap(await changePlay(dirs, play.playId, { kind: "save", world: 0, state: { hp: 3 } }));
    unwrap(
      await changePlay(dirs, play.playId, {
        kind: "complete",
        world: 0,
        summary: "won",
        carry: { coins: 5 },
      }),
    );
    unwrap(await changePlay(dirs, play.playId, { kind: "goto", world: 1 }));
    const reopened = unwrap(await readPlay(dirs, play.playId));
    expect(reopened.current).toBe(1);
    expect(reopened.states[0]).toEqual({ hp: 3 });
    expect(reopened.carry).toEqual({ coins: 5 });

    // A world saves constantly; a completion racing those saves must not be lost.
    await Promise.all([
      changePlay(dirs, play.playId, { kind: "save", world: 1, state: { step: 1 } }),
      changePlay(dirs, play.playId, {
        kind: "complete",
        world: 1,
        summary: "done",
        carry: { coins: 9 },
      }),
      changePlay(dirs, play.playId, { kind: "save", world: 1, state: { step: 2 } }),
    ]);
    const raced = unwrap(await readPlay(dirs, play.playId));
    expect(raced.completions.map((entry) => entry.world)).toEqual([0, 1]);
    expect(raced.carry).toEqual({ coins: 9 });
    expect(raced.states[1]).toEqual({ step: 2 });

    const huge = await changePlay(dirs, play.playId, {
      kind: "save",
      world: 1,
      state: "x".repeat(300_000),
    });
    expect(huge.ok).toBe(false);
    expect((await changePlay(dirs, play.playId, { kind: "goto", world: 5 })).ok).toBe(false);
  });
});
