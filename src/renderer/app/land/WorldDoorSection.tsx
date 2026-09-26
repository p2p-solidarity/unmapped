// The door's sharing section (rev 6 phase 3, D8, WP8): where this world lives (local, shared on a
// service, or joined from its owner) and, for its owners, the door itself — share it on one of this
// device's world services, choose who may come in, make and revoke invites, and the people
// (./DoorPeople: remove a member, make a co-owner, phase 4 D5). "Owner" is the maker or any
// co-owner (`status.role`). A shared world also shows the light chain (./DoorChain, D6): the
// owners' opt-in and what the chain says about this copy. A save restored from someone else's
// shared world redeems an invite here (D7). Every action goes through `window.seed.world.*` and
// shows its Result; the door reads itself again when main says the world changed (./worldDoor).

import { formatDateTime, translate, useT } from "@renderer/i18n";
import { playerName } from "@renderer/net/room";
import { serviceLabel, worldServices } from "@renderer/net/worldServices";
import { useLandStore, useSessionStore } from "@renderer/state";
import { Button, ErrorBlock, StatePanel, Surface, space, Text, TextField } from "@renderer/ui";
import { ACCESS_POLICIES, type AccessPolicy } from "@shared/history/types";
import { type AppError, ok } from "@shared/result";
import type { IssuedInvite, IssuedInviteState, WorldDoor } from "@shared/worldApi";
import { type JSX, useMemo, useState } from "react";
import { ChainSection } from "./DoorChain";
import { Outcome } from "./DoorOutcome";
import { People } from "./DoorPeople";
import { badgeText, shortKey, useAction, useSaveWorldId, useWorldDoor } from "./worldDoor";

const column = { display: "flex", flexDirection: "column", gap: space.xs } as const;
const row = { display: "flex", flexWrap: "wrap", gap: space.xs, alignItems: "center" } as const;

const NO_SERVICES: AppError = {
  code: "world-services-none",
  message: "This device lists no world service.",
  hint: "Add one in Settings → Shared worlds, then open the door again.",
};

function WhereLine({ door }: { door: WorldDoor }): JSX.Element {
  const t = useT();
  const { status } = door;
  const kind = status.link === "local" ? "local" : status.role === "owner" ? "shared" : "joined";
  const owner = door.people.find((person) => person.kind === "owner")?.name ?? shortKey(door.owner);
  const link =
    status.link === "online"
      ? { text: t("world.linkOnline"), tone: "success" as const }
      : status.link === "connecting"
        ? { text: t("world.linkConnecting"), tone: "muted" as const }
        : status.link === "offline"
          ? { text: t("world.linkOffline"), tone: "muted" as const }
          : status.link === "diverged"
            ? { text: t("world.linkDiverged"), tone: "danger" as const }
            : status.link === "refused"
              ? { text: t("world.linkRefused"), tone: "danger" as const }
              : null;
  // A removed member's own copy ends before its removal (the service stops sending): the refusal
  // is what says so.
  const removed = status.role === "removed" || status.error?.code === "access-removed";
  const role = {
    owner: "world.roleOwner",
    member: "world.roleMember",
    visitor: "world.roleVisitor",
    removed: "world.roleRemoved",
  } as const;
  return (
    <div style={column}>
      <Text variant="body">{badgeText(t, kind, status.url, owner)}</Text>
      {link === null ? null : (
        <Text variant="caption" tone={link.tone}>
          {link.text}
        </Text>
      )}
      <Text variant="caption" tone={removed ? "danger" : "dim"}>
        {t(role[removed ? "removed" : status.role])}
      </Text>
      {status.pending > 0 ? (
        <Text variant="caption" tone="muted">
          {t("world.pendingCount", { n: status.pending })}
        </Text>
      ) : null}
      {status.refused > 0 ? (
        <Text variant="caption" tone="danger">
          {t("world.refusedCount", { n: status.refused })}
        </Text>
      ) : null}
      {status.error === null ? null : <ErrorBlock error={status.error} />}
    </div>
  );
}

function ShareStep({ door, onShared }: { door: WorldDoor; onShared(): void }): JSX.Element {
  const t = useT();
  // Read once per opening of the door: Settings → Shared worlds is where the list changes.
  const services = useMemo(worldServices, []);
  const attach = useAction<{ url: string }>();
  return (
    <div style={column}>
      <Text variant="label" tone="muted">
        {t("world.shareHeading")}
      </Text>
      <Text variant="caption" tone="dim">
        {t("world.shareIntro")}
      </Text>
      <Text variant="caption" tone="dim">
        {t("world.shareCoOwnerTip")}
      </Text>
      {services.length === 0 ? (
        <ErrorBlock error={NO_SERVICES} />
      ) : (
        <div style={row}>
          {services.map((url) => (
            <Button
              key={url}
              variant="secondary"
              disabled={attach.state.status === "loading"}
              onClick={() => {
                void attach
                  .run(async () => {
                    const done = await window.seed.world.attach(door.world, url);
                    return done.ok ? ok({ url }) : done;
                  })
                  .then((result) => {
                    if (result?.ok) onShared();
                  });
              }}
            >
              {t("world.shareOn", { service: serviceLabel(url) })}
            </Button>
          ))}
        </div>
      )}
      <Outcome
        state={attach.state}
        busy={t("world.sharing")}
        done={({ url }) => t("world.badgeShared", { service: serviceLabel(url) })}
      />
    </div>
  );
}

const POLICY_LABEL = {
  private: "world.accessPrivate",
  friends: "world.accessFriends",
  public: "world.accessPublic",
} as const satisfies Record<AccessPolicy, string>;

const POLICY_NOTE = {
  private: "world.accessPrivateNote",
  friends: "world.accessFriendsNote",
  public: "world.accessPublicNote",
} as const satisfies Record<AccessPolicy, string>;

function AccessChooser({ door, onChanged }: { door: WorldDoor; onChanged(): void }): JSX.Element {
  const t = useT();
  const set = useAction<unknown>();
  return (
    <div style={column}>
      <Text variant="label" tone="muted">
        {t("world.accessHeading")}
      </Text>
      <div style={row}>
        {ACCESS_POLICIES.map((policy) => (
          <Button
            key={policy}
            variant="chip"
            active={door.access === policy}
            disabled={door.access === policy || set.state.status === "loading"}
            onClick={() => {
              void set.run(() => window.seed.world.setAccess(door.world, policy)).then(onChanged);
            }}
          >
            {t(POLICY_LABEL[policy])}
          </Button>
        ))}
      </div>
      <Text variant="caption" tone="dim">
        {door.accessPending
          ? `${t(POLICY_NOTE[door.access])} ${t("world.accessWaiting")}`
          : t(POLICY_NOTE[door.access])}
      </Text>
      <Outcome
        state={set.state}
        busy={t("world.working")}
        done={() => t("world.accessSet", { policy: t(POLICY_LABEL[door.access]) })}
      />
    </div>
  );
}

const INVITE_STATE = {
  open: "world.inviteOpen",
  "used-up": "world.inviteUsedUp",
  expired: "world.inviteExpired",
  revoked: "world.inviteRevoked",
} as const satisfies Record<IssuedInviteState, string>;

/** A whole number within [min, max], or null. */
function wholeIn(text: string, min: number, max: number): number | null {
  if (!/^\d{1,3}$/.test(text.trim())) return null;
  const value = Number(text.trim());
  return value >= min && value <= max ? value : null;
}

function copyLink(link: string): void {
  void navigator.clipboard
    .writeText(link)
    .then(() => useSessionStore.getState().toast("success", translate("world.inviteCopied")))
    .catch((cause: unknown) => {
      const reason = cause instanceof Error ? cause.message : String(cause);
      useSessionStore.getState().toast("danger", translate("world.inviteCopyFailed", { reason }));
    });
}

function InviteRow({
  invite,
  busy,
  onRevoke,
}: {
  invite: IssuedInvite;
  busy: boolean;
  onRevoke(): void;
}): JSX.Element {
  const t = useT();
  return (
    <div style={row}>
      <Text variant="caption" mono style={{ flex: 1 }}>
        {`${t("world.inviteRow", {
          nonce: invite.nonce.slice(0, 8),
          used: invite.used,
          uses: invite.uses,
          exp: formatDateTime(invite.exp),
        })} · ${t(INVITE_STATE[invite.state])}`}
      </Text>
      {invite.state === "open" ? (
        <Button variant="ghost" disabled={busy} onClick={onRevoke}>
          {t("world.inviteRevoke")}
        </Button>
      ) : null}
    </div>
  );
}

function Invites({ door, onChanged }: { door: WorldDoor; onChanged(): void }): JSX.Element {
  const t = useT();
  const [uses, setUses] = useState("1");
  const [days, setDays] = useState("7");
  const make = useAction<{ link: string }>();
  const revoke = useAction<unknown>();
  const count = wholeIn(uses, 1, 20);
  const length = wholeIn(days, 1, 30);
  return (
    <div style={column}>
      <Text variant="label" tone="muted">
        {t("world.invitesHeading")}
      </Text>
      <div style={{ ...row, alignItems: "flex-end" }}>
        <TextField
          label={t("world.inviteUses")}
          inputMode="numeric"
          value={uses}
          onChange={(event) => setUses(event.target.value)}
          style={{ width: 120 }}
        />
        <TextField
          label={t("world.inviteDays")}
          inputMode="numeric"
          value={days}
          onChange={(event) => setDays(event.target.value)}
          style={{ width: 120 }}
        />
        <Button
          variant="primary"
          disabled={count === null || length === null || make.state.status === "loading"}
          onClick={() => {
            if (count === null || length === null) return;
            void make
              .run(() => window.seed.world.invite(door.world, { uses: count, days: length }))
              .then(onChanged);
          }}
        >
          {t("world.inviteCreate")}
        </Button>
      </div>
      {make.state.status === "ready" ? (
        <Surface variant="inset" padding="md" style={column}>
          <Text variant="caption" tone="success">
            {t("world.inviteReady")}
          </Text>
          <TextField
            label={t("world.inviteLink")}
            mono
            readOnly
            spellCheck={false}
            value={make.state.value.link}
            onFocus={(event) => event.target.select()}
          />
          <div style={row}>
            <Button
              variant="secondary"
              onClick={() => {
                if (make.state.status === "ready") copyLink(make.state.value.link);
              }}
            >
              {t("world.inviteCopy")}
            </Button>
          </div>
        </Surface>
      ) : (
        <Outcome state={make.state} busy={t("world.inviteCreating")} done={() => ""} />
      )}
      {door.invites.length === 0 ? (
        <Text variant="caption" tone="dim">
          {t("world.invitesNone")}
        </Text>
      ) : (
        door.invites.map((invite) => (
          <InviteRow
            key={invite.nonce}
            invite={invite}
            busy={revoke.state.status === "loading"}
            onRevoke={() => {
              void revoke
                .run(() => window.seed.world.revoke(door.world, invite.nonce))
                .then(onChanged);
            }}
          />
        ))
      )}
      <Outcome
        state={revoke.state}
        busy={t("world.working")}
        done={() => t("world.inviteRevokedDone")}
      />
    </div>
  );
}

function Redeem({
  instanceId,
  onRedeemed,
}: {
  instanceId: string;
  onRedeemed(): void;
}): JSX.Element {
  const t = useT();
  const [link, setLink] = useState("");
  const join = useAction<unknown>();
  return (
    <div style={column}>
      <Text variant="label" tone="muted">
        {t("world.redeemHeading")}
      </Text>
      <Text variant="caption" tone="dim">
        {t("world.redeemIntro")}
      </Text>
      <TextField
        label={t("world.inviteLink")}
        mono
        spellCheck={false}
        autoComplete="off"
        value={link}
        onChange={(event) => setLink(event.target.value)}
      />
      <div style={row}>
        <Button
          variant="primary"
          disabled={link.trim() === "" || join.state.status === "loading"}
          onClick={() => {
            void join
              .run(() => window.seed.world.join(link.trim(), playerName(), instanceId))
              .then((result) => {
                if (result?.ok) onRedeemed();
              });
          }}
        >
          {t("world.redeem")}
        </Button>
      </div>
      <Outcome state={join.state} busy={t("world.redeeming")} done={() => t("world.redeemed")} />
    </div>
  );
}

function DoorBody({
  door,
  instanceId,
  refresh,
}: {
  door: WorldDoor;
  instanceId: string;
  refresh(): void;
}): JSX.Element {
  const owner = door.status.role === "owner";
  const local = door.status.link === "local";
  return (
    <>
      <WhereLine door={door} />
      {owner && local ? <ShareStep door={door} onShared={refresh} /> : null}
      {owner && !local ? <AccessChooser door={door} onChanged={refresh} /> : null}
      {owner && !local ? <Invites door={door} onChanged={refresh} /> : null}
      {local ? null : <People door={door} owner={owner} onChanged={refresh} />}
      {local ? null : (
        <ChainSection
          world={door.world}
          owner={owner}
          recording={door.recording}
          pending={door.recordingPending}
          onChanged={refresh}
        />
      )}
      {!local && door.status.role === "visitor" ? (
        <Redeem instanceId={instanceId} onRedeemed={refresh} />
      ) : null}
    </>
  );
}

export function WorldDoorSection(): JSX.Element | null {
  const t = useT();
  const instanceId = useLandStore((state) => state.instanceId);
  const worldId = useSaveWorldId(instanceId);
  const { door, refresh } = useWorldDoor(worldId.status === "ready" ? worldId.value : null);
  if (instanceId === null) return null;
  return (
    <section style={{ ...column, gap: space.sm }}>
      <Text variant="label" tone="muted">
        {t("world.doorSection")}
      </Text>
      {worldId.status === "ready" ? (
        <StatePanel state={door} loadingText={t("world.doorReading")}>
          {(value) => <DoorBody door={value} instanceId={instanceId} refresh={refresh} />}
        </StatePanel>
      ) : (
        <StatePanel state={worldId} loadingText={t("world.doorReading")}>
          {() => null}
        </StatePanel>
      )}
    </section>
  );
}
