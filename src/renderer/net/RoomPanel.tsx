// Room UI: create or join, then show the code, the signaling servers in use and who is present.
// Zero peers is a real ready state, not an empty placeholder — you are simply the only one here.

import { useSessionStore, useWorldStore } from "@renderer/state";
import { Button, ErrorBlock, StatePanel, Surface, space, Text, TextField } from "@renderer/ui";
import { errored, idle, type Loadable, ready } from "@shared/result";
import { type ChangeEvent, type CSSProperties, useCallback, useEffect, useState } from "react";
import { normalizeRoomCode, ROOM_CODE_LENGTH } from "./codes";
import type { PeerInfo } from "./peers";
import {
  createRoom,
  joinRoom,
  playerName,
  type Room,
  type SignalingStatus,
  setPlayerName,
} from "./room";
import { useRoomSync } from "./sync";

const rowStyle: CSSProperties = { display: "flex", gap: space.sm, alignItems: "stretch" };

function statusLabel(status: SignalingStatus): string {
  if (status.connected) return "connected";
  return status.unsuccessfulReconnects > 0 ? "unreachable" : "connecting…";
}

function PeerList({ peers }: { peers: PeerInfo[] }) {
  if (peers.length === 0) {
    return (
      <Text variant="body" tone="dim">
        Waiting for peers — share the code.
      </Text>
    );
  }
  return (
    <>
      {peers.map((peer) => (
        <Text key={peer.clientId} variant="body">
          {peer.name} — floor {peer.floor}
        </Text>
      ))}
    </>
  );
}

export function RoomPanel() {
  const worldId = useWorldStore((s) => s.meta?.id ?? null);
  const [room, setRoom] = useState<Loadable<Room>>(idle());
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [status, setStatus] = useState<SignalingStatus[]>([]);
  const [name, setName] = useState(playerName);
  const [code, setCode] = useState("");

  const active = room.status === "ready" ? room.value : null;
  useRoomSync(active);

  // Publish room code + peer count to the session store so the HUD can show them (never faked:
  // both are cleared on leave, and the HUD hides the peer count while no room is active).
  useEffect(() => {
    if (active === null) return;
    const session = useSessionStore.getState();
    const publish = (list: PeerInfo[]) => {
      setPeers(list);
      session.setPeerCount(list.length);
    };
    session.setRoomCode(active.code);
    publish(active.peers());
    setStatus(active.signalingStatus());
    const offPeers = active.onPeers(publish);
    const offStatus = active.onStatus(setStatus);
    return () => {
      offPeers();
      offStatus();
      useSessionStore.getState().setRoomCode(null);
    };
  }, [active]);

  // Leaving is not optional: an abandoned provider keeps a signaling socket and peers open.
  useEffect(() => {
    if (active === null) return;
    return () => active.leave();
  }, [active]);

  const onName = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setName(event.target.value);
  }, []);
  const onCode = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setCode(normalizeRoomCode(event.target.value));
  }, []);

  const create = useCallback(() => {
    setPlayerName(name);
    if (worldId === null) {
      setRoom(
        errored({
          code: "room-no-world",
          message: "No world is open.",
          hint: "Open a world first — the host publishes its world.oui to the room.",
        }),
      );
      return;
    }
    const result = createRoom(worldId);
    setRoom(result.ok ? ready(result.value) : errored(result.error));
  }, [name, worldId]);

  const join = useCallback(() => {
    setPlayerName(name);
    const result = joinRoom(code);
    setRoom(result.ok ? ready(result.value) : errored(result.error));
  }, [code, name]);

  const copy = useCallback(() => {
    if (active === null) return;
    void navigator.clipboard
      .writeText(active.code)
      .then(() => useSessionStore.getState().toast("success", "Room code copied"))
      .catch((cause: unknown) => {
        const message = cause instanceof Error ? cause.message : String(cause);
        useSessionStore.getState().toast("danger", `Could not copy: ${message}`);
      });
  }, [active]);

  const leave = useCallback(() => {
    if (active !== null) active.leave();
    setPeers([]);
    setStatus([]);
    setRoom(idle());
  }, [active]);

  if (active !== null) {
    const unreachable =
      status.length > 0 &&
      status.every((entry) => !entry.connected && entry.unsuccessfulReconnects > 0);
    return (
      <Surface padding="lg">
        <Text variant="label" tone="muted">
          room code
        </Text>
        <Text variant="titleLarge" mono tone="accent">
          {active.code}
        </Text>
        <div style={rowStyle}>
          <Button variant="secondary" onClick={copy}>
            Copy code
          </Button>
          <Button variant="destructive" onClick={leave}>
            Leave
          </Button>
        </div>
        {status.map((entry) => (
          <Text key={entry.url} variant="caption" tone="dim" mono>
            {entry.url} — {statusLabel(entry)}
          </Text>
        ))}
        {unreachable ? (
          <ErrorBlock
            error={{
              code: "signaling-unreachable",
              message: "No signaling server answered.",
              hint: "Peers can only find each other through a signaling server. Check your network, or pass your own server to createRoom/joinRoom.",
            }}
          />
        ) : null}
        <Text variant="label" tone="muted">
          peers
        </Text>
        <StatePanel state={ready(peers)}>{(list) => <PeerList peers={list} />}</StatePanel>
      </Surface>
    );
  }

  return (
    <Surface padding="lg">
      <Text variant="title">Play together</Text>
      <TextField label="your name" value={name} onChange={onName} spellCheck={false} mono />
      <Button variant="primary" fullWidth onClick={create}>
        Create room
      </Button>
      <Text variant="label" tone="muted">
        or join with a code
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
        <Button variant="secondary" disabled={code.length === 0} onClick={join}>
          Join
        </Button>
      </div>
      {room.status === "error" ? <ErrorBlock error={room.error} /> : null}
    </Surface>
  );
}
