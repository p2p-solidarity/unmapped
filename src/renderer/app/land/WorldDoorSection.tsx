// The door's Advanced group (進階, rev 6 phase 3, D8, WP8; folded by default so the door stays
// short): where this world lives, invite links, who may come in, the people (./DoorPeople: remove a
// friend, make a co-owner, phase 4 D5), the light chain (./DoorChain, D6), redeeming an invite for a
// save restored from someone else's world (D7), and the world's own records (./WorldRecordsSection).
// "Owner" is the maker or any co-owner (`status.role`). A problem with the world (a refusal, a
// stopped sync, an error) stays visible above the fold.
//
// No service address is ever shown here: "Make an invite link" shares a local world on the first
// service Settings → Advanced settings → Shared worlds lists, without naming it, then makes the link; with no service
// listed, a local world offers no invite link at all. Invite rows show uses and expiry, not their
// nonce. Every action goes through `window.seed.world.*` and shows its Result; the door reads
// itself again when main says the world changed (./worldDoor).

import { formatDateTime, translate, useT } from "@renderer/i18n";
import { playerName } from "@renderer/net/room";
import { worldServices } from "@renderer/net/worldServices";
import { useLandStore, useSessionStore } from "@renderer/state";
import { Button, ErrorBlock, StatePanel, Surface, space, Text, TextField } from "@renderer/ui";
import { ACCESS_POLICIES, type AccessPolicy } from "@shared/history/types";
import type { IssuedInvite, IssuedInviteState, WorldDoor } from "@shared/worldApi";
import { type JSX, useMemo, useState } from "react";
import { ChainSection } from "./DoorChain";
import { Outcome } from "./DoorOutcome";
import { People } from "./DoorPeople";
import { WorldRecords } from "./WorldRecordsSection";
import { shortKey, useAction, useSaveWorldId, useWorldDoor } from "./worldDoor";

const column = { display: "flex", flexDirection: "column", gap: space.xs } as const;
const row = { display: "flex", flexWrap: "wrap", gap: space.xs, alignItems: "center" } as const;

/** What stops this world working as it should: shown even while Advanced is folded. */
function Problems({ door }: { door: WorldDoor }): JSX.Element | null {
  const t = useT();
  const { status } = door;
  const removed = status.role === "removed" || status.error?.code === "access-removed";
  const lines = [
    status.link === "diverged" ? t("world.linkDiverged") : null,
    status.link === "refused" ? t("world.linkRefused") : null,
    removed ? t("world.roleRemoved") : null,
  ].filter((line) => line !== null);
  if (lines.length === 0 && status.error === null) return null;
  return (
    <div style={column}>
      {lines.map((line) => (
        <Text key={line} variant="caption" tone="danger">
          {line}
        </Text>
      ))}
      {status.error === null ? null : <ErrorBlock error={status.error} />}
    </div>
  );
}

function WhereLine({ door }: { door: WorldDoor }): JSX.Element {
  const t = useT();
  const { status } = door;
  const owner = door.people.find((person) => person.kind === "owner")?.name ?? shortKey(door.owner);
  const where =
    status.link === "local"
      ? t("world.whereLocal")
      : status.role === "owner"
        ? t("world.whereShared")
        : t("world.whereJoined", { owner });
  const link =
    status.link === "online"
      ? { text: t("world.linkOnline"), tone: "success" as const }
      : status.link === "connecting"
        ? { text: t("world.linkConnecting"), tone: "muted" as const }
        : status.link === "offline"
          ? { text: t("world.linkOffline"), tone: "muted" as const }
          : null;
  const role = {
    owner: "world.roleOwner",
    member: "world.roleMember",
    visitor: "world.roleVisitor",
    removed: null,
  } as const;
  const roleKey = role[status.role];
  return (
    <div style={column}>
      <Text variant="body">{where}</Text>
      {link === null ? null : (
        <Text variant="caption" tone={link.tone}>
          {link.text}
        </Text>
      )}
      {roleKey === null ? null : (
        <Text variant="caption" tone="dim">
          {t(roleKey)}
        </Text>
      )}
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
      <Text variant="caption" style={{ flex: 1 }}>
        {`${t("world.inviteRow", {
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

/**
 * Invite links (owners). A local world is shared on `service` first (the first one this device
 * lists, never named); the same component stays mounted across that change, so the link it made
 * is still on screen when the door reads itself again as shared.
 */
function InviteLinks({
  door,
  service,
  onChanged,
}: {
  door: WorldDoor;
  service: string | null;
  onChanged(): void;
}): JSX.Element {
  const t = useT();
  const [uses, setUses] = useState("1");
  const [days, setDays] = useState("7");
  const make = useAction<{ link: string }>();
  const revoke = useAction<unknown>();
  const count = wholeIn(uses, 1, 20);
  const length = wholeIn(days, 1, 30);
  const local = door.status.link === "local";
  const create = (): void => {
    if (count === null || length === null) return;
    void make
      .run(async () => {
        if (local && service !== null) {
          const shared = await window.seed.world.attach(door.world, service);
          if (!shared.ok) return shared;
          onChanged();
        }
        return window.seed.world.invite(door.world, { uses: count, days: length });
      })
      .then(onChanged);
  };
  return (
    <div style={column}>
      <Text variant="label" tone="muted">
        {t("world.invitesHeading")}
      </Text>
      {local ? (
        <Text variant="caption" tone="dim">
          {t("world.shareIntro")}
        </Text>
      ) : null}
      <div style={{ ...row, alignItems: "flex-end" }}>
        <TextField
          label={t("world.inviteUses")}
          inputMode="numeric"
          value={uses}
          onChange={(event) => setUses(event.target.value)}
          style={{ width: 150 }}
        />
        <TextField
          label={t("world.inviteDays")}
          inputMode="numeric"
          value={days}
          onChange={(event) => setDays(event.target.value)}
          style={{ width: 150 }}
        />
        <Button
          variant="primary"
          disabled={count === null || length === null || make.state.status === "loading"}
          onClick={create}
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
        <Outcome
          state={make.state}
          busy={local ? t("world.sharing") : t("world.inviteCreating")}
          done={() => ""}
        />
      )}
      {local ? null : door.invites.length === 0 ? (
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
  // Read once per opening of the group: Settings → Advanced settings → Shared worlds is where the list changes.
  const service = useMemo(() => worldServices()[0] ?? null, []);
  const owner = door.status.role === "owner";
  const local = door.status.link === "local";
  // A local world with no service listed offers nothing about invite links (no error, no pointer).
  const invites = owner && (!local || service !== null);
  return (
    <>
      <WhereLine door={door} />
      {invites ? <InviteLinks door={door} service={service} onChanged={refresh} /> : null}
      {owner && !local ? <AccessChooser door={door} onChanged={refresh} /> : null}
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
  const [open, setOpen] = useState(false);
  if (instanceId === null) return null;
  return (
    <section style={{ ...column, gap: space.sm }}>
      {door.status === "ready" ? <Problems door={door.value} /> : null}
      <Button variant="ghost" fullWidth onClick={() => setOpen((was) => !was)}>
        {`${open ? "▾" : "▸"} ${t("world.doorSection")}`}
      </Button>
      {!open ? null : (
        <div style={{ ...column, gap: space.md }}>
          {worldId.status === "ready" ? (
            <StatePanel state={door} loadingText={t("world.doorReading")}>
              {(value) => <DoorBody door={value} instanceId={instanceId} refresh={refresh} />}
            </StatePanel>
          ) : (
            <StatePanel state={worldId} loadingText={t("world.doorReading")}>
              {() => null}
            </StatePanel>
          )}
          <WorldRecords />
        </div>
      )}
    </section>
  );
}
