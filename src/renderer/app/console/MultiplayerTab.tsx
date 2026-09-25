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
        A room mirrors world.oui, the saved atmosphere overlay and karma.jsonl over WebRTC data
        channels. It uses a public signaling service; this is a shared document room, not live
        avatar gameplay.
      </Text>
      <RoomPanel />
    </>
  );
}
