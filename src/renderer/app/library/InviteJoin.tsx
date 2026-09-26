// Join a world by an invite link (rev 6 phase 3, D8, D11): the world the link leads to, as main
// read and verified it (writing nothing), then join: main redeems the invite, fetches and checks
// the world, makes the save, and Play opens it. A save of that world already here (restored from
// its owner) is joined in place; a device already in the world just opens its save. No service
// address is shown: the player sees who made the world, who may come in, and the invite.

import { formatDateTime, translate, useT } from "@renderer/i18n";
import { playerName, setPlayerName } from "@renderer/net/room";
import { useSessionStore } from "@renderer/state";
import { Button, ErrorBlock, Surface, space, Text, TextField } from "@renderer/ui";
import type { InvitePreview, WorldJoined } from "@shared/worldApi";
import { type JSX, useState } from "react";
import { shortKey, useAction } from "../land/worldDoor";
import { openInstance } from "../useInstanceLoader";
import { plainSaveName } from "./rows";

const column = { display: "flex", flexDirection: "column", gap: space.xs } as const;

const POLICY = {
  private: "world.accessPrivate",
  friends: "world.accessFriends",
  public: "world.accessPublic",
} as const;

function PreviewCard({ world }: { world: InvitePreview }): JSX.Element {
  const t = useT();
  return (
    <Surface variant="inset" padding="md" style={column}>
      <Text variant="title" as="h3">
        {plainSaveName(world.name)}
      </Text>
      <Text variant="body">
        {t("world.joinOwner", { owner: world.ownerName ?? shortKey(world.owner) })}
      </Text>
      <Text variant="caption" tone="muted">
        {t("world.joinSize", { members: world.members })}
      </Text>
      <Text variant="caption" tone="muted">
        {t("world.joinDoor", { policy: t(POLICY[world.access]) })}
      </Text>
      <Text variant="caption" tone="dim">
        {t("world.joinInvite", { left: world.left, exp: formatDateTime(world.exp) })}
      </Text>
      {world.member ? (
        <Text variant="caption" tone="success">
          {t("world.joinMember")}
        </Text>
      ) : world.restored === null ? null : (
        <Text variant="caption" tone="accent">
          {t("world.joinRestored", { name: world.restored.name })}
        </Text>
      )}
    </Surface>
  );
}

export function InviteJoin({
  link,
  world,
  refresh,
}: {
  link: string;
  world: InvitePreview;
  refresh(): Promise<void>;
}): JSX.Element {
  const t = useT();
  const [name, setName] = useState(playerName);
  const join = useAction<WorldJoined>();
  const trimmed = name.trim();
  const restored = world.restored;

  const go = (): void => {
    void join
      .run(() => window.seed.world.join(link, trimmed, restored?.instanceId))
      .then((result) => {
        if (result === null || !result.ok) return;
        setPlayerName(trimmed);
        useSessionStore
          .getState()
          .toast("success", translate("world.joined", { name: world.name }));
        const { instanceId } = result.value;
        void refresh().then(() => openInstance(instanceId));
      });
  };

  return (
    <div style={{ ...column, gap: space.sm }}>
      <PreviewCard world={world} />
      {world.member && restored !== null ? (
        <div className="row-actions">
          <Button variant="primary" onClick={() => void openInstance(restored.instanceId)}>
            {t("world.joinOpen", { name: restored.name })}
          </Button>
        </div>
      ) : (
        <>
          <TextField
            label={t("world.joinName")}
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <div className="row-actions">
            <Button
              variant="primary"
              disabled={trimmed === "" || join.state.status === "loading"}
              onClick={go}
            >
              {t("world.joinGo")}
            </Button>
          </div>
        </>
      )}
      {join.state.status === "loading" ? (
        <Text variant="caption" tone="muted">
          {t("world.joining")}
        </Text>
      ) : join.state.status === "error" ? (
        <ErrorBlock error={join.state.error} />
      ) : null}
    </div>
  );
}
