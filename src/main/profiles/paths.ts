import { join } from "node:path";

const PROFILE_ID = /^[a-z0-9][a-z0-9-]{0,95}$/;

export function isProfileId(value: string): boolean {
  return PROFILE_ID.test(value);
}

export function profileDir(profilesDir: string, profileId: string): string {
  return join(profilesDir, profileId);
}

export function profilePath(profilesDir: string, profileId: string): string {
  return join(profileDir(profilesDir, profileId), "profile.json");
}
