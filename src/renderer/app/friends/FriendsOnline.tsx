// F12 → Friends → Friends online: every other player drawn on this land (`sampleRemotePlayers`: a
// continent's awareness and a shared world's presence), with their tile position, whose land they
// stand on and how many steps (tiles) from this player. Positions are per-frame data, so they are
// sampled four times a second into this component's own state, never a store (Rule 4).

import { samplePlayer } from "@renderer/engine/playerProbe";
import { sampleRemotePlayers } from "@renderer/engine/remoteRoster";
import { useT } from "@renderer/i18n";
import { foreignAt, useContinentStore } from "@renderer/state";
import { Surface, space, Text } from "@renderer/ui";
import { chunkOf } from "@shared/chunks";
import { type JSX, useEffect, useState } from "react";

const SAMPLE_MS = 250;

type Land = { kind: "friend"; owner: string } | { kind: "yours" } | { kind: "world" };

interface Friend {
  clientId: number;
  name: string;
  x: number;
  z: number;
  land: Land;
  /** Tiles from this player, or null while this player's own spot is unknown. */
  steps: number | null;
}

/** Everyone drawn on the land right now, nearest first. */
function sampleFriends(onContinent: boolean): Friend[] {
  const me = samplePlayer();
  const friends = sampleRemotePlayers(performance.now()).map((player): Friend => {
    const x = Math.round(player.x);
    const z = Math.round(player.z);
    const host = onContinent ? foreignAt(chunkOf(player.x, player.z)) : null;
    const land: Land =
      host !== null
        ? { kind: "friend", owner: host.owner }
        : { kind: onContinent ? "yours" : "world" };
    const steps = me === null ? null : Math.round(Math.hypot(player.x - me.x, player.z - me.z));
    return { clientId: player.clientId, name: player.name, x, z, land, steps };
  });
  return friends.sort((a, b) => (a.steps ?? 0) - (b.steps ?? 0));
}

const same = (a: Friend[], b: Friend[]): boolean => JSON.stringify(a) === JSON.stringify(b);

export function FriendsOnline(): JSX.Element {
  const t = useT();
  const onContinent = useContinentStore((state) => state.status.kind !== "off");
  const [friends, setFriends] = useState<Friend[]>(() => sampleFriends(onContinent));

  useEffect(() => {
    const read = (): void => {
      const next = sampleFriends(onContinent);
      setFriends((before) => (same(before, next) ? before : next));
    };
    read();
    const timer = setInterval(read, SAMPLE_MS);
    return () => clearInterval(timer);
  }, [onContinent]);

  if (friends.length === 0) {
    return (
      <Text variant="body" tone="dim">
        {t("together.friendsNone")}
      </Text>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
      {friends.map((friend) => (
        <Surface key={friend.clientId} variant="inset" padding="sm" style={{ gap: 2 }}>
          <Text variant="body">
            {friend.name.trim() === "" ? t("together.chatFriend") : friend.name}
          </Text>
          <Text variant="caption" tone="muted">
            {friend.steps === null
              ? t("together.friendPosition", { x: friend.x, z: friend.z })
              : t("together.friendPlace", { x: friend.x, z: friend.z, n: friend.steps })}
          </Text>
          <Text variant="caption" tone="dim">
            {friend.land.kind === "friend"
              ? t("together.friendOnLand", { owner: friend.land.owner })
              : t(
                  friend.land.kind === "yours"
                    ? "together.friendOnYours"
                    : "together.friendInWorld",
                )}
          </Text>
        </Surface>
      ))}
    </div>
  );
}
