// Invite friends: the same block in the door at home and in F12 → Friends (simplify-together; "a
// 70-year-old can play it"). Before: one big button. After: ONE thing to tell the friend — this
// world's ENS name when that name carries its join code, else the join code in large type — a copy
// button, how many friends are here, and a way to close. A world shared through a world service says
// so and points to the door's Advanced part for invite links; no service address is ever shown.
//
// In code this is `openMyDoor` / `leaveContinent` (a continent under this world's join code, `plateOf`);
// in a friend's world it shows that world's code, which other friends can join with too.

import { readSaveEns } from "@renderer/app/hud/saveEns";
import { describeError, errorLine, translate, useT } from "@renderer/i18n";
import { plateOf } from "@renderer/net/codes";
import { leaveContinent, openMyDoor } from "@renderer/net/continentActions";
import {
  type ContinentStatus,
  useContinentStore,
  useLandStore,
  useSessionStore,
} from "@renderer/state";
import { Button, font, HIT_TARGET, Surface, space, Text } from "@renderer/ui";
import type { AppError } from "@shared/result";
import { type CSSProperties, type JSX, useEffect, useState } from "react";
import { useAttached } from "./useAttached";

const BIG: CSSProperties = {
  minHeight: Math.round(HIT_TARGET * 1.5),
  fontSize: font.size.title,
  textAlign: "center",
};

/**
 * This save's ENS name when it carries this world's join code (so a friend can join by it), else
 * null. Only read when a lineage market is set up; the join code always works, so a name that
 * cannot be read now is simply not offered.
 */
function useJoinName(instanceId: string | null): string | null {
  const [found, setFound] = useState<{ instanceId: string; name: string } | null>(null);
  useEffect(() => {
    if (instanceId === null) return;
    let live = true;
    const read = async (): Promise<void> => {
      const config = await window.seed.market.config();
      if (!live || config.parent === null) return;
      const view = await readSaveEns(instanceId);
      if (!live || !view.ok) return;
      const { save, local } = view.value;
      const carries =
        save !== null &&
        (save.state === "current" || save.state === "outdated") &&
        save.door === local.door;
      setFound(carries ? { instanceId, name: save.name } : null);
    };
    void read();
    return () => {
      live = false;
    };
  }, [instanceId]);
  return found !== null && found.instanceId === instanceId ? found.name : null;
}

async function copyText(text: string): Promise<void> {
  const session = useSessionStore.getState();
  try {
    await navigator.clipboard.writeText(text);
    session.toast("success", translate("together.copied"));
  } catch {
    // No clipboard here (or no permission): say so, the words are on screen to copy by hand.
    session.toast("danger", translate("together.copyFailed"));
  }
}

function StatusLine({ status, own }: { status: ContinentStatus; own: boolean }): JSX.Element {
  const t = useT();
  if (status.kind === "error") {
    // Plain words for the player: the translated message and what to do, no code or source text
    // (ErrorBlock elsewhere and the logs keep those).
    const { message, hint } = describeError(status.error);
    return (
      <>
        <Text variant="body" tone="danger">
          {message}
        </Text>
        {hint === null ? null : (
          <Text variant="caption" tone="muted">
            {hint}
          </Text>
        )}
      </>
    );
  }
  if (status.kind !== "live") {
    return (
      <Text variant="body" tone="muted">
        {t("together.inviteConnecting")}
      </Text>
    );
  }
  if (status.peers === 0) {
    return (
      <Text variant="body" tone="muted">
        {t(own ? "together.inviteWaiting" : "together.friendWaiting")}
      </Text>
    );
  }
  return (
    <Text variant="body" tone="success">
      {own
        ? t("together.inviteLive", { n: status.peers })
        : t("together.friendsHere", { n: status.peers })}
    </Text>
  );
}

/** `inDoor`: shown in the door itself, where the Advanced part is just below. */
export function InviteFriends({ inDoor = false }: { inDoor?: boolean }): JSX.Element {
  const t = useT();
  const status = useContinentStore((state) => state.status);
  const instanceId = useLandStore((state) => state.instanceId);
  const hasLand = useLandStore((state) => state.progress !== null);
  const attached = useAttached();
  const name = useJoinName(instanceId);
  const [error, setError] = useState<AppError | null>(null);
  const plate = instanceId === null || !hasLand ? null : plateOf(instanceId);

  if (status.kind === "off") {
    if (plate === null) {
      return (
        <Text variant="body" tone="muted">
          {t("together.inviteNoLand")}
        </Text>
      );
    }
    if (attached) {
      return (
        <Text variant="body">
          {t(inDoor ? "together.inviteSharedHere" : "together.inviteShared")}
        </Text>
      );
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
        <Button
          variant="primary"
          fullWidth
          style={BIG}
          onClick={() => {
            const opened = openMyDoor();
            setError(opened.ok ? null : opened.error);
          }}
        >
          {t("together.invite")}
        </Button>
        <Text variant="caption" tone="muted">
          {t("together.inviteHint")}
        </Text>
        {error === null ? null : (
          <Text variant="caption" tone="danger">
            {errorLine(error)}
          </Text>
        )}
      </div>
    );
  }

  const own = status.code === plate;
  const byName = own && name !== null;
  const tell = byName ? name : status.code;
  return (
    <Surface variant="inset" padding="md" style={{ gap: space.sm }}>
      <Text variant="body">{t(own ? "together.tellFriend" : "together.tellMoreFriends")}</Text>
      <Text variant="caption" tone="dim">
        {t(byName ? "together.ensName" : "together.joinCode")}
      </Text>
      <div style={{ display: "flex", alignItems: "center", gap: space.md, flexWrap: "wrap" }}>
        <Text
          variant={byName ? "title" : "headline"}
          mono={!byName}
          style={{ letterSpacing: byName ? undefined : 6, wordBreak: "break-all" }}
        >
          {tell}
        </Text>
        <Button variant="secondary" onClick={() => void copyText(tell)}>
          {t("together.copy")}
        </Button>
      </div>
      <StatusLine status={status} own={own} />
      <Button variant="ghost" onClick={() => leaveContinent()}>
        {t(own ? "together.inviteClose" : "together.leaveFriend")}
      </Button>
    </Surface>
  );
}
