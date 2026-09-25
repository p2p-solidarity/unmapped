import type { ModuleLock } from "./capabilities";
import type { CartridgeRef, ContentHash, RuntimePin } from "./cartridge";
import type { NearbyTarget } from "./events";
import type { ModLock } from "./mods";
import { physicsOf } from "./physics";
import type { PartyState, PlayerState } from "./player";
import { type AppError, err, fail, ok, type Result } from "./result";
import type { Inventory, KarmaEntry, WorldMutation } from "./world";

export interface SessionHello {
  sessionId: string;
  authority: "host" | "peer";
  cartridge: CartridgeRef;
  contentHash: ContentHash;
  profileHash: ContentHash;
  effectiveHash: ContentHash;
  moduleLock: ModuleLock;
  modLock: ModLock;
  engineApiVersion: number;
  networkProtocolVersion: number;
  /** The physics the world was made on; two worlds on different physics see different land. */
  physicsVersion: number;
  playerProfileId: string;
}

export interface RuntimeSnapshot {
  /** Host-monotonic sequence. Peers ignore snapshots older than the last one they applied. */
  sequence: number;
  currentSceneId: string;
  flags: Record<string, string | number | boolean>;
  inventory: Inventory;
  karma: KarmaEntry[];
  mutation: WorldMutation | null;
  player: PlayerState | null;
  party: PartyState | null;
  completedSceneIds: string[];
  /** The host's world seed; a visitor's terrain must be the host's land, not its own save's. */
  seed?: string;
  updatedAt: string;
}

export type SessionInput =
  | { kind: "transition"; targetSceneId: string }
  | { kind: "complete" }
  | { kind: "interact"; target: NearbyTarget }
  | { kind: "action"; action: string; value?: string | number | boolean };

export interface SessionEvent {
  id: string;
  kind: string;
  payload: Record<string, string | number | boolean | null>;
}

export type SessionMessage =
  | { type: "hello"; hello: SessionHello }
  | { type: "reject"; error: AppError }
  | { type: "input"; input: SessionInput }
  | { type: "snapshot"; snapshot: RuntimeSnapshot }
  | { type: "event"; sequence: number; event: SessionEvent }
  | { type: "transition"; snapshot: RuntimeSnapshot };

export interface CreateSessionHelloInput {
  sessionId: string;
  authority: "host" | "peer";
  runtimePin: RuntimePin;
  engineApiVersion: number;
  networkProtocolVersion: number;
  playerProfileId: string;
}

export function createSessionHello(input: CreateSessionHelloInput): SessionHello {
  return {
    sessionId: input.sessionId,
    authority: input.authority,
    cartridge: input.runtimePin.cartridge,
    contentHash: input.runtimePin.cartridge.contentHash,
    profileHash: input.runtimePin.profileHash,
    effectiveHash: input.runtimePin.effectiveHash,
    moduleLock: input.runtimePin.moduleLock,
    modLock: input.runtimePin.modLock,
    engineApiVersion: input.engineApiVersion,
    networkProtocolVersion: input.networkProtocolVersion,
    physicsVersion: physicsOf(input.runtimePin),
    playerProfileId: input.playerProfileId,
  };
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => sameValue(value, right[index]));
  }
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") {
    return false;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    sameValue(leftKeys, rightKeys) &&
    leftKeys.every((key) => sameValue(leftRecord[key], rightRecord[key]))
  );
}

function mismatch(code: string, field: string): Result<void> {
  return err(
    code,
    `This room uses a different ${field}.`,
    "Open an instance pinned to the host's exact cartridge revision and runtime profile.",
  );
}

/** Checks every immutable/runtime identity field before any snapshot or event is accepted. */
export function validateSessionHello(local: SessionHello, remote: SessionHello): Result<void> {
  if (remote.contentHash !== remote.cartridge.contentHash) {
    return err("session-hello-invalid", "The peer sent an inconsistent cartridge identity.");
  }
  if (local.sessionId !== remote.sessionId) return mismatch("session-id-mismatch", "session id");
  if (local.authority === remote.authority) {
    return err(
      "session-authority-mismatch",
      local.authority === "host"
        ? "A session can have only one host."
        : "Only the host can synchronize runtime state.",
    );
  }
  if (!sameValue(local.cartridge, remote.cartridge)) {
    return mismatch("session-cartridge-mismatch", "cartridge revision");
  }
  if (local.contentHash !== remote.contentHash) {
    return mismatch("session-content-mismatch", "content hash");
  }
  if (!sameValue(local.moduleLock, remote.moduleLock)) {
    return mismatch("session-module-lock-mismatch", "ordered module lock");
  }
  if (!sameValue(local.modLock, remote.modLock)) {
    return mismatch("session-mod-lock-mismatch", "ordered mod lock");
  }
  if (local.profileHash !== remote.profileHash) {
    return mismatch("session-profile-mismatch", "runtime profile hash");
  }
  if (local.effectiveHash !== remote.effectiveHash) {
    return mismatch("session-effective-mismatch", "effective hash");
  }
  if (local.engineApiVersion !== remote.engineApiVersion) {
    return mismatch("session-engine-version-mismatch", "engine API version");
  }
  if (local.networkProtocolVersion !== remote.networkProtocolVersion) {
    return mismatch("session-network-version-mismatch", "network protocol version");
  }
  if (local.physicsVersion !== remote.physicsVersion) {
    return mismatch("session-physics-mismatch", "physics version");
  }
  if (remote.playerProfileId.trim().length === 0) {
    return err("session-profile-invalid", "The peer did not identify a player profile.");
  }
  return ok(undefined);
}

export interface SessionHandlers {
  onVerified?(): void;
  onRejected?(error: AppError): void;
  onInput?(input: SessionInput): void;
  onSnapshot?(snapshot: RuntimeSnapshot): void;
  onEvent?(event: SessionEvent, sequence: number): void;
  onTransition?(snapshot: RuntimeSnapshot): void;
}

export interface SessionPeer {
  start(): void;
  verified(): boolean;
  receive(message: SessionMessage): Result<void>;
  sendInput(input: SessionInput): Result<void>;
  sendSnapshot(snapshot: RuntimeSnapshot): Result<void>;
  sendEvent(event: SessionEvent, sequence: number): Result<void>;
  sendTransition(snapshot: RuntimeSnapshot): Result<void>;
}

export interface CreateSessionPeerOptions {
  role: "host" | "peer";
  localHello: SessionHello;
  send(message: SessionMessage): void;
  handlers: SessionHandlers;
}

/** Authority gate around one reliable ordered DataChannel peer. */
export function createSessionPeer(options: CreateSessionPeerOptions): SessionPeer {
  let accepted = false;
  let lastSequence = -1;

  const sendAfterVerified = (message: SessionMessage, allowedRole: "host" | "peer") => {
    if (!accepted) return err("session-not-verified", "The runtime handshake is not complete.");
    if (options.role !== allowedRole) {
      return err("session-authority-violation", `${options.role} cannot send ${message.type}.`);
    }
    options.send(message);
    return ok(undefined);
  };

  return {
    start: () => options.send({ type: "hello", hello: options.localHello }),
    verified: () => accepted,
    receive(message) {
      if (message.type === "reject") {
        options.handlers.onRejected?.(message.error);
        return fail(message.error);
      }
      if (message.type === "hello") {
        const checked = validateSessionHello(options.localHello, message.hello);
        if (!checked.ok) {
          options.send({ type: "reject", error: checked.error });
          options.handlers.onRejected?.(checked.error);
          return checked;
        }
        if (!accepted) {
          accepted = true;
          options.handlers.onVerified?.();
        }
        return ok(undefined);
      }
      if (!accepted)
        return err("session-not-verified", "Runtime sync arrived before the handshake.");

      if (message.type === "input") {
        if (options.role !== "host") {
          return err("session-authority-violation", "A peer cannot accept another peer's input.");
        }
        options.handlers.onInput?.(message.input);
        return ok(undefined);
      }
      if (options.role !== "peer") {
        return err("session-authority-violation", `A host cannot accept peer ${message.type}.`);
      }
      const sequence = message.type === "event" ? message.sequence : message.snapshot.sequence;
      if (!Number.isSafeInteger(sequence) || sequence < 0) {
        return err("session-sequence-invalid", "The host sent an invalid runtime sequence.");
      }
      if (sequence <= lastSequence) return ok(undefined);
      lastSequence = sequence;
      if (message.type === "snapshot") options.handlers.onSnapshot?.(message.snapshot);
      else if (message.type === "event") {
        options.handlers.onEvent?.(message.event, message.sequence);
      } else options.handlers.onTransition?.(message.snapshot);
      return ok(undefined);
    },
    sendInput: (input) => sendAfterVerified({ type: "input", input }, "peer"),
    sendSnapshot: (snapshot) => sendAfterVerified({ type: "snapshot", snapshot }, "host"),
    sendEvent: (event, sequence) => sendAfterVerified({ type: "event", event, sequence }, "host"),
    sendTransition: (snapshot) => sendAfterVerified({ type: "transition", snapshot }, "host"),
  };
}
