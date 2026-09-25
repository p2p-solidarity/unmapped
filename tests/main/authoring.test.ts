import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAuthoring, readAuthoring, writeAuthoring } from "@main/workspaces/authoring";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("authoring workspace", () => {
  it("persists definition and gallery and can resume them", async () => {
    const root = await mkdtemp(join(tmpdir(), "aether-authoring-"));
    roots.push(root);
    const created = await createAuthoring(
      root,
      { name: "Factory", author: "Maker" },
      new Date("2026-01-01T00:00:00Z"),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    created.value.draft.selection.genres = ["first_person_shooter"];
    const saved = await writeAuthoring(root, created.value);
    expect(saved.ok).toBe(true);

    const resumed = await readAuthoring(root, created.value.workspaceId);
    expect(resumed.ok).toBe(true);
    if (resumed.ok) expect(resumed.value.draft.selection.genres).toEqual(["first_person_shooter"]);
  });
});
