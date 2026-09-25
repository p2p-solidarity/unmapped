// Rooms are owned by src/renderer/net; this tab only frames the panel and says what is shared.

import { useT } from "@renderer/i18n";
import { RoomPanel } from "@renderer/net";
import { Text } from "@renderer/ui";

export function MultiplayerTab() {
  const t = useT();
  return (
    <>
      <Text variant="label" tone="muted">
        {t("console.room")}
      </Text>
      <Text variant="caption" tone="dim">
        {t("console.roomNote")}
      </Text>
      <RoomPanel />
    </>
  );
}
