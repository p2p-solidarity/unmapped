// The door at home (plan.md §7): four dials, each pinned to a place the player has witnessed or to a
// friend's door code. Turning to a place walks through to it; turning to a code joins that friend's
// world (their room code is their door number). Keepsakes carried home are set on the shelf here.

import { normalizeRoomCode, ROOM_CODE_LENGTH } from "@renderer/net/codes";
import { setActiveRoom, useActiveRoom } from "@renderer/net/lifecycle";
import { joinRoom, playerName } from "@renderer/net/room";
import { useEngineStore, useLandStore, useSessionStore, useWorldStore } from "@renderer/state";
import { Button, Surface, space, Text, TextField, zIndex } from "@renderer/ui";
import { CHUNK_SIZE, type ChunkCoord, chunkKey } from "@shared/chunks";
import type { DoorSlot } from "@shared/land";
import { type JSX, useState } from "react";

/** A walkable spot in a witnessed place: beside its first resident, else the chunk centre. */
function arrival(coord: ChunkCoord): [number, number] {
  const chunk = useLandStore.getState().chunks[chunkKey(coord)];
  const npc = chunk?.status === "written" ? chunk.scene.npcs[0] : undefined;
  const local = npc === undefined ? [CHUNK_SIZE / 2, CHUNK_SIZE / 2] : [npc.x + 1.5, npc.z + 0.5];
  return [coord.cx * CHUNK_SIZE + (local[0] ?? 0), coord.cz * CHUNK_SIZE + (local[1] ?? 0)];
}

/** A friend's door: join their room with this save, which must be the same cartridge revision. */
async function visit(code: string): Promise<void> {
  const session = useSessionStore.getState();
  const instance = session.activeInstance;
  if (instance === null) {
    session.toast("danger", "Open a saved game of this cartridge before visiting a friend.");
    return;
  }
  let profile = session.playerProfile;
  if (profile === null) {
    const listed = await window.seed.profiles.list();
    const existing = listed.ok ? listed.value[0] : undefined;
    const made =
      existing === undefined
        ? await window.seed.profiles.upsert({
            displayName: playerName(),
            appearance: {},
            controlPreferences: {},
          })
        : null;
    profile = existing ?? (made?.ok ? made.value : null);
  }
  if (profile === null) {
    session.toast("danger", "No player profile could be made for the visit.");
    return;
  }
  const opened = joinRoom(code, { instance, profile });
  if (!opened.ok) {
    session.toast(
      "danger",
      `${opened.error.message}${opened.error.hint ? ` — ${opened.error.hint}` : ""}`,
    );
    return;
  }
  session.closeDoor();
  setActiveRoom(opened.value);
}

function travel(slot: DoorSlot): void {
  if (slot.kind === "room") {
    void visit(slot.code);
    return;
  }
  const [x, z] = arrival(slot);
  useSessionStore.getState().closeDoor();
  useEngineStore.getState().requestTeleport(x, z);
}

export function DoorPanel(): JSX.Element | null {
  const open = useSessionStore((state) => state.doorOpen);
  const progress = useLandStore((state) => state.progress);
  const chunks = useLandStore((state) => state.chunks);
  const items = useWorldStore((state) => state.inventory.items);
  const [dial, setDial] = useState(0);
  const [code, setCode] = useState("");
  const room = useActiveRoom();
  if (!open || progress === null) return null;

  const places = Object.entries(chunks).flatMap(([key, chunk]) => {
    if (chunk.status !== "written") return [];
    const [cx = 0, cz = 0] = key.split(",").map(Number);
    if (cx === progress.home.cx && cz === progress.home.cz) return [];
    return [{ kind: "place" as const, cx, cz, label: chunk.scene.name }];
  });
  const keepsakeIds = new Set(
    Object.values(chunks).flatMap((chunk) =>
      chunk.status === "written" ? (chunk.errands?.keepsakes.map((item) => item.id) ?? []) : [],
    ),
  );
  const carried = items.filter((item) => keepsakeIds.has(item.id));

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: zIndex.overlay,
        pointerEvents: "none",
      }}
    >
      <Surface
        variant="card"
        padding="lg"
        style={{
          width: "min(640px, 92%)",
          maxHeight: "86%",
          overflowY: "auto",
          pointerEvents: "auto",
        }}
      >
        <Text variant="title" as="h2">
          Door
        </Text>
        <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
          {progress.door.map((slot, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: the four dials are positions
              key={index}
              style={{ display: "flex", alignItems: "center", gap: space.sm }}
            >
              <Button variant={dial === index ? "primary" : "ghost"} onClick={() => setDial(index)}>
                {`Dial ${index + 1}`}
              </Button>
              <Text variant="body" style={{ flex: 1 }}>
                {slot === null
                  ? "— empty —"
                  : `${slot.label} (${slot.kind === "place" ? `${slot.cx} · ${slot.cz}` : slot.code})`}
              </Text>
              {slot !== null ? (
                <>
                  <Button variant="secondary" onClick={() => travel(slot)}>
                    Go
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => useLandStore.getState().setDoorSlot(index, null)}
                  >
                    Clear
                  </Button>
                </>
              ) : null}
            </div>
          ))}
        </div>

        <Text variant="label" tone="muted">
          {`Pin a witnessed place to dial ${dial + 1}`}
        </Text>
        {places.length === 0 ? (
          <Text variant="caption" tone="dim">
            No other place has been witnessed yet. Walk out and see somewhere first.
          </Text>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: space.xs }}>
            {places.map((place) => (
              <Button
                key={`${place.cx},${place.cz}`}
                variant="secondary"
                onClick={() => useLandStore.getState().setDoorSlot(dial, place)}
              >
                {`${place.label} (${place.cx} · ${place.cz})`}
              </Button>
            ))}
          </div>
        )}

        <Text variant="label" tone="muted">
          Door codes
        </Text>
        {room === null ? (
          <Text variant="caption" tone="dim">
            Host this game from the room panel and its code becomes your door number.
          </Text>
        ) : (
          <Text variant="body">
            {room.host
              ? `Your door number: ${room.code} — friends pin it to a dial to visit.`
              : `Visiting through door ${room.code}.`}
          </Text>
        )}
        <div style={{ display: "flex", gap: space.sm, alignItems: "flex-end" }}>
          <TextField
            label="a friend's door code"
            value={code}
            maxLength={ROOM_CODE_LENGTH}
            mono
            onChange={(event) => setCode(normalizeRoomCode(event.target.value))}
          />
          <Button
            variant="secondary"
            disabled={code.length !== ROOM_CODE_LENGTH}
            onClick={() =>
              useLandStore
                .getState()
                .setDoorSlot(dial, { kind: "room", code, label: `Door ${code}` })
            }
          >
            {`Pin to dial ${dial + 1}`}
          </Button>
        </div>

        <Text variant="label" tone="muted">
          Keepsakes you carry
        </Text>
        {carried.length === 0 ? (
          <Text variant="caption" tone="dim">
            Nothing to set on the shelf. Residents hand keepsakes over when an errand is done.
          </Text>
        ) : (
          carried.map((item, index) => (
            <Button
              // biome-ignore lint/suspicious/noArrayIndexKey: the same keepsake can be carried twice
              key={`${item.id}-${index}`}
              variant="secondary"
              fullWidth
              onClick={() => {
                const world = useWorldStore.getState();
                const remaining = [...world.inventory.items];
                remaining.splice(remaining.indexOf(item), 1);
                world.setInventory({ ...world.inventory, items: remaining });
                useLandStore.getState().placeKeepsake(item);
              }}
            >
              {`Set ${item.name} on the shelf`}
            </Button>
          ))
        )}
        <Button variant="ghost" onClick={() => useSessionStore.getState().closeDoor()}>
          Close
        </Button>
      </Surface>
    </div>
  );
}
