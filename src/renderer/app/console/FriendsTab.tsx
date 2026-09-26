// F12 → Friends (simplify-together; the console's first tab, replacing the old room): bring
// friends in (the same invite block as the door), join a friend's world (the same one field), and
// every friend on this land right now with where they stand.

import { useT } from "@renderer/i18n";
import { Text } from "@renderer/ui";
import { FriendsOnline } from "../friends/FriendsOnline";
import { InviteFriends } from "../friends/InviteFriends";
import { JoinWorldField } from "../friends/JoinWorldField";

export function FriendsTab() {
  const t = useT();
  return (
    <>
      <Text variant="label" tone="muted">
        {t("together.bringFriends")}
      </Text>
      <InviteFriends />
      <Text variant="label" tone="muted">
        {t("together.joinTitle")}
      </Text>
      <JoinWorldField />
      <Text variant="label" tone="muted">
        {t("together.friendsOnline")}
      </Text>
      <FriendsOnline />
    </>
  );
}
