// A friend's door by ENS name. A save's name (`<save>.<cartridge>.<root>`, held by its player's
// passkey account) carries the save's door number (門牌) in its `description`, written by main when
// the save is recorded (@shared/doorCode `doorDescription`). The friend's-door fields take either
// the six-symbol number or such a name; a name is followed back to its door, then the continent is
// joined by that number as usual. Reading a name is public and needs no key.

import { looksLikeEnsName, lookupEnsName } from "@renderer/identity";
import { err, ok, type Result } from "@shared/result";
import { normalizeRoomCode, ROOM_CODE_LENGTH } from "./codes";

/** What a friend's-door field holds: a door number to join, or an ENS name to follow first. */
export type DoorInput = { kind: "code"; code: string } | { kind: "name"; name: string };

/** The field as it is typed: a name stays whole (lowercase, as ENS reads it), a number uppercase. */
export function typedDoor(raw: string): string {
  return looksLikeEnsName(raw.trim()) ? raw.toLowerCase() : raw.toUpperCase();
}

/** The field's words → a full-length door number, an ENS name, or null while it is neither. */
export function readDoorInput(raw: string): DoorInput | null {
  const trimmed = raw.trim();
  if (looksLikeEnsName(trimmed)) return { kind: "name", name: trimmed.toLowerCase() };
  const code = normalizeRoomCode(trimmed);
  return code.length === ROOM_CODE_LENGTH ? { kind: "code", code } : null;
}

/** A save's ENS name → the door number it carries (errors are values: Rule 5). */
export async function resolveDoor(name: string): Promise<Result<string>> {
  const normalized = name.trim().toLowerCase();
  const found = await lookupEnsName(normalized);
  if (!found.ok) return found;
  if (found.value === null) {
    return err(
      "continent-name-not-found",
      `${normalized} names no save or cartridge.`,
      "Check the spelling with your friend: a save's name is its own label followed by its cartridge's name.",
    );
  }
  if (found.value.save === null) {
    return err(
      "continent-name-not-save",
      `${normalized} names a cartridge, not a save, so it has no door.`,
      "Ask your friend for their save's name (Worlds → Saves) or their door number.",
    );
  }
  if (found.value.door === null) {
    return err(
      "continent-name-no-door",
      `${normalized} carries no door number.`,
      "Its holder records the save again from Worlds → Saves, which adds the door; or ask them for the door number.",
    );
  }
  return ok(found.value.door);
}

/** The door to walk through: the number as typed, or the one the name carries. */
export function doorOf(input: DoorInput): Promise<Result<string>> {
  return input.kind === "code" ? Promise.resolve(ok(input.code)) : resolveDoor(input.name);
}
