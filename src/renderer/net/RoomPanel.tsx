import { hydrateInstance } from "@renderer/app/useInstanceLoader";
import { type StringKey, translate, useT } from "@renderer/i18n";
import { useSessionStore } from "@renderer/state";
import { Button, ErrorBlock, StatePanel, Surface, space, Text, TextField } from "@renderer/ui";
import type { InstanceMeta, ResolvedInstance } from "@shared/cartridge";
import type { PlayerProfile } from "@shared/player";
import { errored, idle, type Loadable, loading, ready } from "@shared/result";
import { type ChangeEvent, type CSSProperties, useCallback, useEffect, useState } from "react";
import { normalizeRoomCode, ROOM_CODE_LENGTH } from "./codes";
import { setActiveRoom, useActiveRoom } from "./lifecycle";
import type { PeerInfo } from "./peers";
import { createRoom, joinRoom, playerName, type SignalingStatus, setPlayerName } from "./room";
import { leaveActiveRoom } from "./sync";

const rowStyle: CSSProperties = { display: "flex", gap: space.sm, alignItems: "stretch" };

function statusLabel(status: SignalingStatus): StringKey {
  if (status.connected) return "identity.statusConnected";
  return status.unsuccessfulReconnects > 0
    ? "identity.statusUnreachable"
    : "identity.statusConnecting";
}

function PeerList({ peers }: { peers: PeerInfo[] }) {
  const t = useT();
  if (peers.length === 0) {
    return <Text tone="dim">{t("identity.waitingPeer")}</Text>;
  }
  return (
    <>
      {peers.map((peer) => (
        <Text key={peer.clientId}>
          {t("identity.peerLine", { name: peer.name, floor: peer.floor })}
        </Text>
      ))}
    </>
  );
}

interface JoinData {
  instances: InstanceMeta[];
  profiles: PlayerProfile[];
}

async function loadJoinData(): Promise<Loadable<JoinData>> {
  const [instances, profiles] = await Promise.all([
    window.seed.instances.list(),
    window.seed.profiles.list(),
  ]);
  if (!instances.ok) return errored(instances.error);
  if (!profiles.ok) return errored(profiles.error);
  return ready({ instances: instances.value, profiles: profiles.value });
}

export function RoomPanel() {
  const active = useActiveRoom();
  const currentInstance = useSessionStore((state) => state.activeInstance);
  const [data, setData] = useState<Loadable<JoinData>>(idle());
  const [localError, setLocalError] = useState<Loadable<never>>(idle());
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [status, setStatus] = useState<SignalingStatus[]>([]);
  const [name, setName] = useState(playerName);
  const [code, setCode] = useState("");
  const [selectedInstanceId, setSelectedInstanceId] = useState(
    currentInstance?.instance.meta.instanceId ?? "",
  );
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [busy, setBusy] = useState(false);
  const t = useT();

  useEffect(() => {
    if (active !== null) return;
    setData(loading());
    void loadJoinData().then((next) => {
      setData(next);
      if (next.status !== "ready") return;
      setSelectedInstanceId((value) => value || next.value.instances[0]?.instanceId || "");
      const profile = next.value.profiles[0];
      if (profile !== undefined) {
        setSelectedProfileId((value) => value || profile.profileId);
        setName(profile.displayName);
      }
    });
  }, [active]);

  useEffect(() => {
    if (active === null) return;
    const publish = (list: PeerInfo[]) => setPeers(list);
    publish(active.peers());
    setStatus(active.signalingStatus());
    const offPeers = active.onPeers(publish);
    const offStatus = active.onStatus(setStatus);
    const offError = active.onError((error) => {
      setLocalError(errored(error));
      if (!active.host) setActiveRoom(null);
    });
    return () => {
      offPeers();
      offStatus();
      offError();
    };
  }, [active]);

  const onName = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setName(event.target.value);
  }, []);
  const onCode = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setCode(normalizeRoomCode(event.target.value));
  }, []);

  const prepare = useCallback(async (): Promise<{
    instance: ResolvedInstance;
    profile: PlayerProfile;
  } | null> => {
    if (selectedInstanceId === "") {
      setLocalError(
        errored({
          code: "room-instance-required",
          message: "Choose a saved game before opening a room.",
          hint: "Both players must choose an instance pinned to the same cartridge revision.",
        }),
      );
      return null;
    }
    setBusy(true);
    const existingProfile =
      data.status === "ready"
        ? data.value.profiles.find((profile) => profile.profileId === selectedProfileId)
        : undefined;
    const [instance, profile] = await Promise.all([
      window.seed.instances.resolve(selectedInstanceId),
      window.seed.profiles.upsert({
        ...(selectedProfileId === "" ? {} : { profileId: selectedProfileId }),
        displayName: name,
        appearance: existingProfile?.appearance ?? {},
        controlPreferences: existingProfile?.controlPreferences ?? {},
      }),
    ]);
    setBusy(false);
    if (!instance.ok) {
      setLocalError(errored(instance.error));
      return null;
    }
    if (!profile.ok) {
      setLocalError(errored(profile.error));
      return null;
    }
    setPlayerName(profile.value.displayName);
    useSessionStore.getState().setPlayerProfile(profile.value);
    return { instance: instance.value, profile: profile.value };
  }, [data, name, selectedInstanceId, selectedProfileId]);

  const create = useCallback(() => {
    void prepare().then((prepared) => {
      if (prepared === null) return;
      const opened = createRoom(prepared);
      if (!opened.ok) return setLocalError(errored(opened.error));
      const hydrated = hydrateInstance(prepared.instance);
      if (!hydrated.ok) return setLocalError(errored(hydrated.error));
      setActiveRoom(opened.value);
      useSessionStore.getState().setScreen("play");
    });
  }, [prepare]);

  const join = useCallback(() => {
    void prepare().then((prepared) => {
      if (prepared === null) return;
      const opened = joinRoom(code, prepared);
      if (!opened.ok) return setLocalError(errored(opened.error));
      setActiveRoom(opened.value);
    });
  }, [code, prepare]);

  const copy = useCallback(() => {
    if (active === null) return;
    void navigator.clipboard
      .writeText(active.code)
      .then(() => useSessionStore.getState().toast("success", translate("identity.codeCopied")))
      .catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : String(cause);
        useSessionStore.getState().toast("danger", translate("identity.copyFailed", { reason }));
      });
  }, [active]);

  if (active !== null) {
    const unreachable =
      status.length > 0 &&
      status.every((entry) => !entry.connected && entry.unsuccessfulReconnects > 0);
    return (
      <Surface padding="lg">
        <Text variant="label" tone="muted">
          {t("identity.roomCode")}
        </Text>
        <Text variant="titleLarge" mono tone="accent">
          {active.code}
        </Text>
        <Text tone="dim">
          {active.instance.cartridge.manifest.name} ·{" "}
          {active.host ? t("identity.roleHost") : t("identity.roleJoined")} ·{" "}
          {active.profile.displayName}
        </Text>
        <div style={rowStyle}>
          <Button variant="secondary" onClick={copy}>
            {t("identity.copyCode")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              void leaveActiveRoom().then((result) => {
                if (!result.ok) setLocalError(errored(result.error));
              });
            }}
          >
            {t("common.leave")}
          </Button>
        </div>
        {status.map((entry) => (
          <Text key={entry.url} variant="caption" tone="dim" mono>
            {entry.url} — {t(statusLabel(entry))}
          </Text>
        ))}
        {unreachable ? (
          <ErrorBlock
            error={{
              code: "signaling-unreachable",
              message: "No signaling server answered.",
              hint: "Check the network connection and try again.",
            }}
          />
        ) : null}
        <Text variant="label" tone="muted">
          {t("identity.players")}
        </Text>
        <PeerList peers={peers} />
        {localError.status === "error" ? <ErrorBlock error={localError.error} /> : null}
      </Surface>
    );
  }

  return (
    <Surface padding="lg">
      <Text variant="title">{t("identity.chooseTitle")}</Text>
      <Text tone="dim">{t("identity.chooseNote")}</Text>
      <StatePanel
        state={data}
        idleText={t("identity.loadingGames")}
        loadingText={t("identity.loadingGames")}
      >
        {(value) => (
          <>
            <Text variant="label" tone="muted">
              {t("identity.savedGame")}
            </Text>
            {value.instances.length === 0 ? (
              <Text tone="dim">{t("identity.noInstances")}</Text>
            ) : (
              value.instances.map((instance) => (
                <Button
                  key={instance.instanceId}
                  variant="secondary"
                  active={selectedInstanceId === instance.instanceId}
                  onClick={() => setSelectedInstanceId(instance.instanceId)}
                  fullWidth
                >
                  {instance.name} · {instance.cartridge.version}
                </Button>
              ))
            )}
            <Text variant="label" tone="muted">
              {t("identity.playerProfile")}
            </Text>
            {value.profiles.map((profile) => (
              <Button
                key={profile.profileId}
                variant="secondary"
                active={selectedProfileId === profile.profileId}
                onClick={() => {
                  setSelectedProfileId(profile.profileId);
                  setName(profile.displayName);
                }}
                fullWidth
              >
                {profile.displayName}
              </Button>
            ))}
          </>
        )}
      </StatePanel>
      <TextField
        label={t("identity.displayName")}
        value={name}
        onChange={onName}
        spellCheck={false}
        mono
      />
      <Button
        variant="primary"
        fullWidth
        disabled={busy || selectedInstanceId === "" || name.trim() === ""}
        onClick={create}
      >
        {t("identity.hostGame")}
      </Button>
      <Text variant="label" tone="muted">
        {t("identity.orJoin")}
      </Text>
      <div style={rowStyle}>
        <TextField
          type="text"
          value={code}
          onChange={onCode}
          placeholder={"X".repeat(ROOM_CODE_LENGTH)}
          spellCheck={false}
          autoCapitalize="characters"
          autoCorrect="off"
          maxLength={ROOM_CODE_LENGTH}
          mono
        />
        <Button
          variant="secondary"
          disabled={busy || code.length !== ROOM_CODE_LENGTH || selectedInstanceId === ""}
          onClick={join}
        >
          {t("identity.join")}
        </Button>
      </div>
      {localError.status === "error" ? <ErrorBlock error={localError.error} /> : null}
    </Surface>
  );
}
