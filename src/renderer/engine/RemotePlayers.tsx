// Everyone else in the room, walking the same land: a figure and a name, eased toward the last
// position the network reported.

import { useFrame } from "@react-three/fiber";
import { type JSX, useRef, useSyncExternalStore } from "react";
import type * as THREE from "three";
import { Label } from "./Entities/Label";
import { PLAYER_CAPSULE, standardMaterial } from "./geometry";
import { ENTITY_PALETTE } from "./palette";
import { getRemotePlayers, type RemotePlayer, subscribeRemotePlayers } from "./remoteRoster";

export function RemotePlayers(): JSX.Element {
  const players = useSyncExternalStore(subscribeRemotePlayers, getRemotePlayers, getRemotePlayers);
  return (
    <>
      {players.map((player) => (
        <Remote key={player.clientId} player={player} />
      ))}
    </>
  );
}

function Remote({ player }: { player: RemotePlayer }): JSX.Element {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    const node = group.current;
    if (node === null) return;
    const k = Math.min(1, delta * 8);
    node.position.x += (player.x - node.position.x) * k;
    node.position.y += (player.y - node.position.y) * k;
    node.position.z += (player.z - node.position.z) * k;
  });
  return (
    <group ref={group} position={[player.x, player.y, player.z]}>
      <mesh
        geometry={PLAYER_CAPSULE}
        material={standardMaterial(ENTITY_PALETTE.playerBody, 0.1)}
        castShadow
      />
      <Label text={player.name} y={1.4} />
    </group>
  );
}
