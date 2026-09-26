// Worlds → Join a world (rev 6 phase 3, D8, D11, WP8): paste the invite link a friend sent, look at
// the world it leads to (main reads and verifies its history on the service the invite names,
// writing nothing), then join: main redeems the invite, fetches and checks the cartridge, makes the
// save, and Play opens it. A save of that world already on this device (restored from its owner)
// is joined in place; a device that already belongs to the world just opens its save. Every refusal
// (a damaged or revoked link, an unreachable service, newer physics…) shows its own hint. A move
// link (`unmapped://world?w=…&svc=…`, rev 6 phase 4 D5) pasted here follows a world this device
// holds to the service an owner moved it to — only when that service's log extends this device's.

import { formatDateTime, translate, useT } from "@renderer/i18n";
import { playerName, setPlayerName } from "@renderer/net/room";
import { serviceLabel } from "@renderer/net/worldServices";
import { useSessionStore } from "@renderer/state";
import { Button, ErrorBlock, Surface, space, Text, TextField } from "@renderer/ui";
import type { InvitePreview, WorldJoined } from "@shared/worldApi";
import { isMoveLink, type WorldMoved } from "@shared/worldBundle";
import { type JSX, useState } from "react";
import { shortKey, useAction } from "../land/worldDoor";
import { useKeys } from "../shell/useKeys";
import { openInstance } from "../useInstanceLoader";
import { AUTOFOCUS } from "./focus";
import type { SectionProps } from "./sections";

const column = { display: "flex", flexDirection: "column", gap: space.xs } as const;
const row = { display: "flex", flexWrap: "wrap", gap: space.xs, alignItems: "center" } as const;

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
        {world.name}
      </Text>
      <Text variant="body">
        {t("world.joinOwner", { owner: world.ownerName ?? shortKey(world.owner) })}
      </Text>
      <Text variant="caption" tone="muted">
        {t("world.joinService", { service: serviceLabel(world.service) })}
      </Text>
      <Text variant="caption" tone="muted">
        {t("world.joinDoor", { policy: t(POLICY[world.access]) })}
      </Text>
      <Text variant="caption" tone="muted">
        {t("world.joinSize", { members: world.members, head: world.head })}
      </Text>
      <Text variant="caption" tone="dim">
        {t("world.joinInvite", {
          left: world.left,
          uses: world.uses,
          exp: formatDateTime(world.exp),
        })}
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

export function JoinWorld({ refresh, onClose }: SectionProps): JSX.Element {
  const t = useT();
  const [link, setLink] = useState("");
  const [name, setName] = useState(playerName);
  const look = useAction<InvitePreview>();
  const join = useAction<WorldJoined>();
  // A move link (phase 4, D5): a world this device holds moved to another service.
  const move = useAction<WorldMoved>();
  const moving = isMoveLink(link);

  const reset = (): void => {
    setLink("");
    look.clear();
    join.clear();
    move.clear();
  };
  // Esc first puts a looked-at link away, then leaves for the title.
  useKeys({ Escape: () => (look.state.status === "idle" ? onClose() : reset()) });

  const world = look.state.status === "ready" ? look.state.value : null;
  const trimmed = name.trim();
  const busy =
    look.state.status === "loading" ||
    join.state.status === "loading" ||
    move.state.status === "loading";

  const enter = (joined: WorldJoined, title: string): void => {
    useSessionStore.getState().toast("success", translate("world.joined", { name: title }));
    void refresh().then(() => openInstance(joined.instanceId));
  };

  return (
    <>
      <h2 className="g-heading">{t("world.sectionJoin")}</h2>
      <Text variant="caption" tone="dim">
        {t("world.joinIntro")}
      </Text>
      <div style={column}>
        <TextField
          className={AUTOFOCUS}
          label={t("world.inviteLink")}
          mono
          spellCheck={false}
          autoComplete="off"
          value={link}
          onChange={(event) => {
            setLink(event.target.value);
            look.clear();
            join.clear();
            move.clear();
          }}
        />
        {moving ? (
          <Text variant="caption" tone="accent">
            {t("bundle.moveDetected")}
          </Text>
        ) : null}
        <div style={row}>
          {moving ? (
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => {
                void move
                  .run(() => window.seed.bundle.move(link.trim()))
                  .then((result) => {
                    if (result === null || !result.ok) return;
                    const { url, added } = result.value;
                    const text = translate("bundle.moveFollowed", {
                      service: serviceLabel(url),
                      added,
                    });
                    useSessionStore.getState().toast("success", text);
                    void refresh();
                  });
              }}
            >
              {t("bundle.moveFollow")}
            </Button>
          ) : (
            <Button
              variant={world === null ? "primary" : "secondary"}
              disabled={link.trim() === "" || busy}
              onClick={() => {
                join.clear();
                void look.run(() => window.seed.world.preview(link.trim()));
              }}
            >
              {t("world.joinLook")}
            </Button>
          )}
          {look.state.status === "idle" ? null : (
            <Button variant="ghost" disabled={busy} onClick={reset}>
              {t("world.joinOther")}
            </Button>
          )}
        </div>
      </div>

      {move.state.status === "loading" ? (
        <Text variant="caption" tone="muted">
          {t("bundle.moveFollowing")}
        </Text>
      ) : move.state.status === "error" ? (
        <ErrorBlock error={move.state.error} />
      ) : move.state.status === "ready" ? (
        <Text variant="caption" tone="success">
          {t("bundle.moveFollowed", {
            service: serviceLabel(move.state.value.url),
            added: move.state.value.added,
          })}
        </Text>
      ) : null}

      {look.state.status === "loading" ? (
        <Text variant="caption" tone="muted">
          {t("world.joinLooking")}
        </Text>
      ) : look.state.status === "error" ? (
        <ErrorBlock error={look.state.error} />
      ) : null}

      {world === null ? null : (
        <div style={{ ...column, gap: space.sm }}>
          <PreviewCard world={world} />
          {world.member && world.restored !== null ? (
            <div style={row}>
              <Button
                variant="primary"
                onClick={() => {
                  if (world.restored !== null) void openInstance(world.restored.instanceId);
                }}
              >
                {t("world.joinOpen", { name: world.restored.name })}
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
              <div style={row}>
                <Button
                  variant="primary"
                  disabled={trimmed === "" || busy}
                  onClick={() => {
                    const into = world.restored?.instanceId;
                    void join
                      .run(() => window.seed.world.join(link.trim(), trimmed, into))
                      .then((result) => {
                        if (result === null || !result.ok) return;
                        setPlayerName(trimmed);
                        enter(result.value, world.name);
                      });
                  }}
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
      )}
    </>
  );
}
