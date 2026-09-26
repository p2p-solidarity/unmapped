// A friend's world by ENS name. A save's name (`<save>.<cartridge>.<root>`, held by its player's
// passkey account) carries the save's join code (its door number) in its `description`, written by
// main when the save is recorded (@shared/doorCode `doorDescription`). The "join a world" fields take
// either the six-symbol join code or such a name; a name is followed back to its code, then the
// continent is joined by that code as usual. Reading a name is public and needs no key.

import { looksLikeEnsName, lookupEnsName } from "@renderer/identity";
import { err, ok, type Result } from "@shared/result";
import { normalizeRoomCode, ROOM_CODE_LENGTH } from "./codes";

/** What a "join a world" field holds: a join code, or an ENS name to follow first. */
export type DoorInput = { kind: "code"; code: string } | { kind: "name"; name: string };

/** The field as it is typed: a name stays whole (lowercase, as ENS reads it), a code uppercase. */
export function typedDoor(raw: string): string {
  return looksLikeEnsName(raw.trim()) ? raw.toLowerCase() : raw.toUpperCase();
}

/** The field's words → a full-length join code, an ENS name, or null while it is neither. */
export function readDoorInput(raw: string): DoorInput | null {
  const trimmed = raw.trim();
  if (looksLikeEnsName(trimmed)) return { kind: "name", name: trimmed.toLowerCase() };
  const code = normalizeRoomCode(trimmed);
  return code.length === ROOM_CODE_LENGTH ? { kind: "code", code } : null;
}

/** A save's ENS name → the join code it carries (errors are values: Rule 5). */
export async function resolveDoor(name: string): Promise<Result<string>> {
  const normalized = name.trim().toLowerCase();
  const found = await lookupEnsName(normalized);
  if (!found.ok) return found;
  if (found.value === null) {
    return err(
      "continent-name-not-found",
      `${normalized} is not the name of any world.`,
      "Check the spelling with your friend, or ask them for their join code.",
    );
  }
  if (found.value.save === null) {
    return err(
      "continent-name-not-save",
      `${normalized} names a world anyone can start, not your friend's own world, so it has no join code.`,
      "Ask your friend for the name or the join code shown under Invite friends.",
    );
  }
  if (found.value.door === null) {
    return err(
      "continent-name-no-door",
      `${normalized} carries no join code yet.`,
      "Its owner records it again from Worlds → My worlds, which adds the join code; or ask them for the join code.",
    );
  }
  return ok(found.value.door);
}

/** The join code to use: the code as typed, or the one the name carries. */
export function doorOf(input: DoorInput): Promise<Result<string>> {
  return input.kind === "code" ? Promise.resolve(ok(input.code)) : resolveDoor(input.name);
}
