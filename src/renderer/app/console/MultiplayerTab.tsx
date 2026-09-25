// Rooms are owned by src/renderer/net; this tab only frames the panel and says what is shared.

import { RoomPanel } from "@renderer/net";
import { Text } from "@renderer/ui";

export function MultiplayerTab() {
  return (
    <>
      <Text variant="label" tone="muted">
        ROOM
      </Text>
      <Text variant="caption" tone="dim">
        A room compares the locally verified cartridge and runtime hashes before gameplay starts.
        The host owns progress and scene transitions; published scene files never travel through the
        room.
      </Text>
      <RoomPanel />
    </>
  );
}
