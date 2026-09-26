// Join a world from inside Play: the same block in the door at home and in F12 → Friends
// (simplify-together). One field — a friend's ENS name (looked up first) or their join code — and
// one Join button. A name is followed back to the join code it carries (../land/useFriendDoor);
// the code brings this world onto the friend's shared land (`joinContinentByCode`). Every failure is
// said under the field in plain words (errorLine).

import { errorLine, translate, useT } from "@renderer/i18n";
import { joinContinentByCode } from "@renderer/net/continentActions";
import { useSessionStore } from "@renderer/state";
import { Button, space, Text, TextField } from "@renderer/ui";
import type { AppError } from "@shared/result";
import { type JSX, useState } from "react";
import { useFriendDoor } from "../land/useFriendDoor";

export function JoinWorldField({ onJoined }: { onJoined?: () => void }): JSX.Element {
  const t = useT();
  const friend = useFriendDoor();
  const [error, setError] = useState<AppError | null>(null);
  const shown = error ?? friend.error;

  const join = async (): Promise<void> => {
    setError(null);
    const code = await friend.resolve("join");
    if (code === null) return;
    const joined = joinContinentByCode(code);
    if (!joined.ok) {
      setError(joined.error);
      return;
    }
    friend.clear();
    useSessionStore.getState().toast("success", translate("together.joined"));
    onJoined?.();
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (friend.input !== null && friend.resolving === null) void join();
      }}
      style={{ display: "flex", flexDirection: "column", gap: space.sm }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: space.sm, alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <TextField
            label={t("together.joinField")}
            value={friend.value}
            maxLength={friend.maxLength}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            onChange={(event) => {
              setError(null);
              friend.onChange(event);
            }}
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          disabled={friend.input === null || friend.resolving !== null}
        >
          {friend.resolving === null ? t("together.join") : t("together.joinLooking")}
        </Button>
      </div>
      {shown === null ? null : (
        <Text variant="caption" tone="danger">
          {errorLine(shown)}
        </Text>
      )}
    </form>
  );
}
