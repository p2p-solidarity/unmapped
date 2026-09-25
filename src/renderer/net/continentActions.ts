// What the door and the HUD can do with continents: open this world's door (start a continent under
// its own door number), walk through a friend's door number (bring this world into theirs), and
// leave. Each returns a Result so the panel can say what went wrong (Rule 5).

import { useLandStore, useSessionStore } from "@renderer/state";
import { err, ok, type Result } from "@shared/result";
import { isValidRoomCode, normalizeRoomCode, plateOf, ROOM_CODE_LENGTH } from "./codes";
import { getActiveContinent, openContinent, setActiveContinent } from "./continent";
import { playerName } from "./room";

/** This world's door number, or null when no open-land world is loaded. */
export function myPlate(): string | null {
  const instanceId = useLandStore.getState().instanceId;
  return instanceId === null ? null : plateOf(instanceId);
}

function openHere(code: string): Result<string> {
  const session = useSessionStore.getState();
  const worldId = useLandStore.getState().instanceId;
  if (worldId === null || useLandStore.getState().progress === null) {
    return err(
      "continent-no-land",
      "Only a world with open land can join a continent.",
      "Open a saved world and step out onto its land first.",
    );
  }
  if (session.networkRole !== "solo") {
    return err(
      "continent-in-room",
      "This world is already in a shared room.",
      "Leave the room in Console → Multiplayer first.",
    );
  }
  const current = getActiveContinent();
  if (current?.code === normalizeRoomCode(code)) return ok(current.code);
  const opened = openContinent({
    code,
    worldId,
    name: session.playerProfile?.displayName ?? playerName(),
  });
  if (!opened.ok) return opened;
  setActiveContinent(opened.value);
  return ok(opened.value.code);
}

/** Opens this world's door: a continent named by its own door number, which friends can dial. */
export function openMyDoor(): Result<string> {
  const plate = myPlate();
  if (plate === null) {
    return err(
      "continent-no-land",
      "Only a world with open land can open its door.",
      "Open a saved world and step out onto its land first.",
    );
  }
  return openHere(plate);
}

/** Brings this world onto the continent behind a friend's door number. */
export function joinContinentByCode(code: string): Result<string> {
  const normalized = normalizeRoomCode(code);
  if (!isValidRoomCode(normalized)) {
    return err(
      "room-bad-code",
      `"${code}" is not a door number.`,
      `Door numbers are ${ROOM_CODE_LENGTH} characters, as a friend's door shows them.`,
    );
  }
  return openHere(normalized);
}

/** Takes this world back off the continent; its land stays exactly as it is on this disk. */
export function leaveContinent(): void {
  setActiveContinent(null);
}
