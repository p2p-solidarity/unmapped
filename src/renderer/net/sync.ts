import { hydrateInstance } from "@renderer/app/useInstanceLoader";
import { checkpointCurrentInstance } from "@renderer/app/usePersistWorld";
import { useEngineStore, useSessionStore, useWorldStore } from "@renderer/state";
import type { ResolvedInstance } from "@shared/cartridge";
import type { NearbyTarget } from "@shared/events";
import { fail, ok, type Result } from "@shared/result";
import type { RuntimeSnapshot, SessionInput } from "@shared/session";
import { useEffect } from "react";
import { getActiveRoom, setActiveRoom } from "./lifecycle";
import type { Room } from "./room";

function snapshotOf(room: Room, sequence: number): RuntimeSnapshot {
  const world = useWorldStore.getState();
  const save = room.instance.instance.save;
  return {
    sequence,
    currentSceneId: save.currentSceneId,
    flags: { ...(world.meta?.flags ?? save.flags) },
    inventory: world.inventory,
    karma: world.karma,
    mutation: world.meta?.mutation ?? save.mutation,
    player: save.player,
    party: save.party,
    completedSceneIds: [...save.completedSceneIds],
    ...(save.seed === undefined ? {} : { seed: save.seed }),
    updatedAt: world.meta?.updatedAt ?? save.updatedAt,
  };
}

function resolvedFromSnapshot(room: Room, snapshot: RuntimeSnapshot): ResolvedInstance {
  const current = room.instance;
  // The visitor walks the host's land: never keep this machine's own world seed.
  const { seed: _ownSeed, ...ownSave } = current.instance.save;
  return {
    cartridge: current.cartridge,
    instance: {
      meta: { ...current.instance.meta, updatedAt: snapshot.updatedAt },
      karma: snapshot.karma,
      save: {
        ...ownSave,
        currentSceneId: snapshot.currentSceneId,
        flags: { ...snapshot.flags },
        inventory: snapshot.inventory,
        mutation: snapshot.mutation,
        player: snapshot.player,
        party: snapshot.party,
        completedSceneIds: [...snapshot.completedSceneIds],
        ...(snapshot.seed === undefined ? {} : { seed: snapshot.seed }),
        updatedAt: snapshot.updatedAt,
      },
    },
  };
}

type AppliedInput = "event" | "snapshot" | "transition";

async function applyHostInput(room: Room, input: SessionInput): Promise<Result<AppliedInput>> {
  if (!room.host) {
    return fail({ code: "session-authority-violation", message: "Only the host can apply input." });
  }
  if (input.kind === "interact") {
    useEngineStore.getState().interact(input.target);
    return ok("snapshot");
  }
  if (input.kind === "action") return ok("event");
  const checkpoint = await checkpointCurrentInstance();
  if (!checkpoint.ok) return fail(checkpoint.error);
  const instanceId = room.instance.instance.meta.instanceId;
  const transitioned =
    input.kind === "complete"
      ? await window.seed.instances.complete(instanceId)
      : await window.seed.instances.transition(instanceId, input.targetSceneId);
  if (!transitioned.ok) return fail(transitioned.error);
  room.instance = transitioned.value;
  const hydrated = hydrateInstance(transitioned.value);
  if (!hydrated.ok) return fail(hydrated.error);
  return ok("transition");
}

/** App-owned bridge between an active room and the running instance. */
export function useRoomSync(room: Room | null): void {
  useEffect(() => {
    if (room === null) return;
    const session = useSessionStore.getState();
    let sequence = 0;
    let applyingRemote = false;
    session.setRoomCode(room.code);
    session.setNetworkRole(room.host ? "host" : "peer");
    session.setPlayerProfile(room.profile);
    session.setActiveInstance(room.instance);

    const publish = (transition = false) => {
      if (!room.host || applyingRemote) return;
      const snapshot = snapshotOf(room, ++sequence);
      if (transition) room.broadcastTransition(snapshot);
      else room.broadcastSnapshot(snapshot);
    };
    const offVerified = room.onVerified(() => {
      session.setPeerCount(room.verifiedPeerCount());
      if (room.host) publish();
    });
    const offError = room.onError((error) => {
      session.toast("danger", `${error.message}${error.hint ? ` — ${error.hint}` : ""}`);
    });
    const offInput = room.onInput((input) => {
      void applyHostInput(room, input).then((applied) => {
        if (!applied.ok) {
          session.toast("danger", applied.error.message);
          return;
        }
        if (applied.value === "event" && input.kind === "action") {
          room.broadcastEvent(
            {
              id: crypto.randomUUID(),
              kind: input.action,
              payload: { value: input.value ?? null },
            },
            ++sequence,
          );
        } else publish(applied.value === "transition");
      });
    });
    const offSnapshot = room.onSnapshot((snapshot) => {
      if (room.host) return;
      applyingRemote = true;
      const resolved = resolvedFromSnapshot(room, snapshot);
      const hydrated = hydrateInstance(resolved);
      if (hydrated.ok) {
        room.instance = resolved;
        useSessionStore.getState().setBusy(null);
        useSessionStore.getState().setScreen("play");
      } else {
        session.toast("danger", hydrated.error.message);
      }
      applyingRemote = false;
    });
    const offPeers = room.onPeers(() => session.setPeerCount(room.verifiedPeerCount()));
    const unsubscribeWorld = useWorldStore.subscribe((state, previous) => {
      room.provider.awareness.setLocalStateField("floor", state.floor);
      if (room.host && state.sceneSource !== previous.sceneSource) {
        const active = useSessionStore.getState().activeInstance;
        if (active !== null) room.instance = active;
        publish(true);
      } else if (
        room.host &&
        (state.inventory !== previous.inventory ||
          state.karma !== previous.karma ||
          state.meta?.flags !== previous.meta?.flags ||
          state.meta?.mutation !== previous.meta?.mutation)
      ) {
        publish();
      }
    });

    return () => {
      offVerified();
      offError();
      offInput();
      offSnapshot();
      offPeers();
      unsubscribeWorld();
      session.setRoomCode(null);
      session.setNetworkRole("solo");
    };
  }, [room]);
}

export function requestRoomTransition(targetSceneId: string | null): boolean {
  const room = getActiveRoom();
  if (room === null || room.host) return false;
  const result = room.sendInput(
    targetSceneId === null ? { kind: "complete" } : { kind: "transition", targetSceneId },
  );
  if (!result.ok) useSessionStore.getState().toast("danger", result.error.message);
  return true;
}

export function sendRoomInteraction(target: NearbyTarget): boolean {
  const room = getActiveRoom();
  if (room === null || room.host) return false;
  const result = room.sendInput({ kind: "interact", target });
  if (!result.ok) useSessionStore.getState().toast("danger", result.error.message);
  return true;
}

/** Host departure is gated on a durable checkpoint; peers can disconnect immediately. */
export async function leaveActiveRoom(): Promise<Result<void>> {
  const room = getActiveRoom();
  if (room === null) return ok(undefined);
  if (room.host) {
    const checkpoint = await checkpointCurrentInstance();
    if (!checkpoint.ok) return checkpoint;
  }
  if (getActiveRoom() === room) setActiveRoom(null);
  return ok(undefined);
}
