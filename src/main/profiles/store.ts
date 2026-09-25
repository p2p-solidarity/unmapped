import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import type { PlayerProfile, PlayerProfileInput } from "@shared/player";
import { err, fail, ok, type Result, toError } from "@shared/result";
import { isProfileId, profileDir, profilePath } from "./paths";
import { playerProfileInputSchema, playerProfileSchema } from "./schemas";

function slug(value: string): string {
  return (
    value
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/g, "") || "player"
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function createProfileId(displayName: string): string {
  return `${slug(displayName)}-${randomBytes(5).toString("hex")}`;
}

export async function readPlayerProfile(
  profilesDir: string,
  profileId: string,
): Promise<Result<PlayerProfile>> {
  if (!isProfileId(profileId)) return err("profile-id-invalid", `Invalid profile id: ${profileId}`);
  try {
    const parsed = playerProfileSchema.safeParse(
      JSON.parse(await readFile(profilePath(profilesDir, profileId), "utf8")),
    );
    if (!parsed.success) {
      return err("profile-invalid", parsed.error.issues[0]?.message ?? "Invalid profile.json");
    }
    if (parsed.data.profileId !== profileId) {
      return err("profile-identity-mismatch", "The profile identity does not match its directory.");
    }
    return ok(parsed.data);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ENOENT"
      ? err("profile-missing", `Player profile ${profileId} is not installed.`)
      : fail(toError(error, "profile-read-failed"));
  }
}

export async function listPlayerProfiles(profilesDir: string): Promise<Result<PlayerProfile[]>> {
  if (!(await exists(profilesDir))) return ok([]);
  try {
    const profiles: PlayerProfile[] = [];
    for (const entry of await readdir(profilesDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !isProfileId(entry.name)) continue;
      const profile = await readPlayerProfile(profilesDir, entry.name);
      if (!profile.ok) return profile;
      profiles.push(profile.value);
    }
    profiles.sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) ||
        left.profileId.localeCompare(right.profileId),
    );
    return ok(profiles);
  } catch (error) {
    return fail(toError(error, "profile-list-failed"));
  }
}

export async function upsertPlayerProfile(
  profilesDir: string,
  input: PlayerProfileInput,
  now: Date = new Date(),
): Promise<Result<PlayerProfile>> {
  const parsed = playerProfileInputSchema.safeParse(input);
  if (!parsed.success) {
    const invalidId = input.profileId !== undefined && !isProfileId(input.profileId);
    return err(
      invalidId ? "profile-id-invalid" : "profile-invalid",
      parsed.error.issues[0]?.message ?? "Invalid player profile.",
    );
  }
  const profileId = parsed.data.profileId ?? createProfileId(parsed.data.displayName);
  const destination = profileDir(profilesDir, profileId);
  if (parsed.data.profileId !== undefined && !(await exists(destination))) {
    return err("profile-missing", `Player profile ${profileId} is not installed.`);
  }
  const profile: PlayerProfile = {
    profileId,
    displayName: parsed.data.displayName,
    appearance: parsed.data.appearance,
    controlPreferences: parsed.data.controlPreferences,
    updatedAt: now.toISOString(),
  };
  const path = profilePath(profilesDir, profileId);
  const temporary = `${path}.${process.pid}-${Date.now()}.tmp`;
  try {
    if (parsed.data.profileId === undefined) await mkdir(destination, { recursive: true });
    await writeFile(temporary, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
    await rename(temporary, path);
    return ok(profile);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    return fail(toError(error, "profile-write-failed"));
  }
}

export async function removePlayerProfile(
  profilesDir: string,
  profileId: string,
): Promise<Result<void>> {
  if (!isProfileId(profileId)) return err("profile-id-invalid", `Invalid profile id: ${profileId}`);
  if (!(await exists(profileDir(profilesDir, profileId)))) {
    return err("profile-missing", `Player profile ${profileId} is not installed.`);
  }
  try {
    await rm(profileDir(profilesDir, profileId), { recursive: true });
    return ok(undefined);
  } catch (error) {
    return fail(toError(error, "profile-remove-failed"));
  }
}
