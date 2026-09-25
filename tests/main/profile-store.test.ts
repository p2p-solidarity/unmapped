import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { upsertPlayerProfile } from "@main/profiles/store";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let root = "";
let profilesDir = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aether-profiles-"));
  profilesDir = join(root, "profiles");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("player profiles", () => {
  it("rejects traversal ids and does not invent an update target", async () => {
    const traversal = await upsertPlayerProfile(profilesDir, {
      profileId: "../outside",
      displayName: "Bad",
      appearance: {},
      controlPreferences: {},
    });
    expect(traversal.ok).toBe(false);
    if (!traversal.ok) expect(traversal.error.code).toBe("profile-id-invalid");

    const missing = await upsertPlayerProfile(profilesDir, {
      profileId: "missing-profile",
      displayName: "Missing",
      appearance: {},
      controlPreferences: {},
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe("profile-missing");
  });
});
