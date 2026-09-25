import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listPlayerProfiles,
  readPlayerProfile,
  removePlayerProfile,
  upsertPlayerProfile,
} from "@main/profiles/store";
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

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.value;
}

describe("player profiles", () => {
  it("creates a reusable profile under the profiles root and reads it back", async () => {
    const created = unwrap(
      await upsertPlayerProfile(
        profilesDir,
        {
          displayName: "Mina",
          appearance: { color: "cyan" },
          controlPreferences: { invertY: false, sensitivity: 0.8 },
        },
        new Date("2026-09-26T10:00:00.000Z"),
      ),
    );

    expect(created.profileId).toMatch(/^mina-[a-z0-9]+$/);
    expect(unwrap(await readPlayerProfile(profilesDir, created.profileId))).toEqual(created);
    expect(unwrap(await listPlayerProfiles(profilesDir))).toEqual([created]);

    const stored = JSON.parse(
      await readFile(join(profilesDir, created.profileId, "profile.json"), "utf8"),
    );
    expect(stored).toEqual(created);
  });

  it("updates only an existing exact profile and removes it", async () => {
    const created = unwrap(
      await upsertPlayerProfile(
        profilesDir,
        { displayName: "Mina", appearance: {}, controlPreferences: {} },
        new Date("2026-09-26T10:00:00.000Z"),
      ),
    );
    const updated = unwrap(
      await upsertPlayerProfile(
        profilesDir,
        {
          profileId: created.profileId,
          displayName: "Mina K.",
          appearance: { color: "gold" },
          controlPreferences: {},
        },
        new Date("2026-09-26T11:00:00.000Z"),
      ),
    );
    expect(updated.updatedAt).toBe("2026-09-26T11:00:00.000Z");
    expect(updated.displayName).toBe("Mina K.");

    unwrap(await removePlayerProfile(profilesDir, created.profileId));
    const missing = await readPlayerProfile(profilesDir, created.profileId);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe("profile-missing");
  });

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
