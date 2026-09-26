// Join a world's one field: what the player pasted decides what happens. An invite link
// (`unmapped://join?…`) is previewed and joined; a move link (`unmapped://world?…`) is followed; an
// ENS name is looked up first — a save's name leads to its join code, a world's name to that world;
// a six-symbol join code walks straight over. Anything else is none of these yet (null).

import { looksLikeEnsName, lookupCartridgeName } from "@renderer/identity";
import { resolveDoor } from "@renderer/net/doorByName";
import { isValidRoomCode, normalizeRoomCode } from "@shared/doorCode";
import type { CartridgePointer } from "@shared/ensNames";
import { err, ok, type Result } from "@shared/result";
import { isMoveLink } from "@shared/worldBundle";

export type JoinInput =
  | { kind: "invite"; link: string }
  | { kind: "move"; link: string }
  | { kind: "name"; name: string }
  | { kind: "code"; code: string };

export function readJoinInput(raw: string): JoinInput | null {
  const text = raw.trim();
  if (text === "") return null;
  if (isMoveLink(text)) return { kind: "move", link: text };
  if (text.startsWith("unmapped://join?")) return { kind: "invite", link: text };
  if (looksLikeEnsName(text)) return { kind: "name", name: text.toLowerCase() };
  const code = normalizeRoomCode(text);
  return isValidRoomCode(code) ? { kind: "code", code } : null;
}

/** Where a name leads: a friend's join code (a save's name), or a world to play (a world's name). */
export type NameTarget =
  | { kind: "code"; code: string }
  | { kind: "world"; name: string; pointer: CartridgePointer };

/** A save's name is followed back to its join code; failing that, the name may be a world's. */
export async function lookupJoinName(name: string): Promise<Result<NameTarget>> {
  const door = await resolveDoor(name);
  if (door.ok) return ok({ kind: "code", code: door.value });
  if (door.error.code !== "continent-name-not-save") return door;
  const world = await lookupCartridgeName(name);
  if (!world.ok) return world;
  if (world.value === null) {
    return err(
      "continent-name-not-found",
      `${name} names no world.`,
      "Check the spelling with your friend, or ask them for their join code.",
    );
  }
  return ok({ kind: "world", name, pointer: world.value });
}
