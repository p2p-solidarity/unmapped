// The continent's land crosses only between verified worlds (rev 6 §3.10). The room's y-webrtc
// document stays empty; each machine keeps its continent Y.Doc to itself and this gate copies its
// entries to peers over the namespaced data channel — but only to, and only from, a peer whose
// hello passed `validateContinentHello`. Before that a peer gets our hello and nothing else, and
// anything it sends besides a hello is dropped. Every entry is checked by `readContinentEntry` and
// `mayWrite`: a peer writes only its own world and chunks, and never overwrites a chunk or a note.
//
// Chat lines cross the same way: sent only to verified peers, taken only from them, cleaned by
// `readChatText`, at most CHAT_BURST per peer per CHAT_WINDOW_MS (the rest dropped). They never
// touch the document; listeners get the sender's verified world and the cleaned text, nothing more.
//
// Pure over a Y.Doc and a transport, so the handshake is tested with two documents and no network.

import {
  type ContinentEntry,
  type ContinentHello,
  type ContinentMessage,
  MAX_ENTRIES,
  mayWrite,
  readChatText,
  readContinentEntry,
  validateContinentHello,
} from "@shared/continentHello";
import { type AppError, err, ok, type Result } from "@shared/result";
import type * as Y from "yjs";
import { continentMaps } from "./continentDoc";

/** The origin of transactions that apply a verified peer's entries; they are never echoed. */
const REMOTE = Symbol("continent-remote");

/** Payload bytes per entries message, well under the channel's frame limit. */
const BATCH_BYTES = 192 * 1024;

/** A peer may say at most CHAT_BURST lines in any CHAT_WINDOW_MS; more are dropped, not queued. */
export const CHAT_BURST = 5;
export const CHAT_WINDOW_MS = 5000;

export interface ContinentTransport {
  send(peerId: string, message: ContinentMessage): boolean;
  onPeer(listener: (peerId: string) => void): () => void;
  onPeerLeft(listener: (peerId: string) => void): () => void;
  onMessage(listener: (peerId: string, message: ContinentMessage) => void): () => void;
}

export interface ContinentGate {
  /** The worlds of peers whose hello passed; only they see this world's land. */
  verifiedWorlds(): Set<string>;
  /** Peers turned away, with why — shown so a mismatch is never silent. */
  rejected(): AppError[];
  onChange(listener: () => void): () => void;
  /**
   * Sends one chat line to every verified peer, cleaned first; the line as sent and how many peers
   * it went to. Refused when it is blank or too long, or this player already said CHAT_BURST lines
   * in the window (the others would drop it anyway).
   */
  sendChat(text: string): Result<{ text: string; peers: number }>;
  /** Chat lines from verified peers only: the sender's world (its hello's) and the cleaned text. */
  onChat(listener: (worldId: string, text: string) => void): () => void;
  close(): void;
}

/** Keeps the times inside the window; whether one more fits. */
function withinBurst(times: number[], now: number): boolean {
  while (times.length > 0 && now - (times[0] ?? now) >= CHAT_WINDOW_MS) times.shift();
  return times.length < CHAT_BURST;
}

function batches(entries: readonly ContinentEntry[]): ContinentEntry[][] {
  const out: ContinentEntry[][] = [];
  let batch: ContinentEntry[] = [];
  let bytes = 0;
  for (const entry of entries) {
    const size = JSON.stringify(entry).length;
    if (batch.length > 0 && (bytes + size > BATCH_BYTES || batch.length >= MAX_ENTRIES)) {
      out.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(entry);
    bytes += size;
  }
  if (batch.length > 0) out.push(batch);
  return out;
}

/**
 * What a newly verified peer takes from us: this world's entry and chunks, and every note (a note
 * on someone's land is filed under that land). Other worlds' land it takes from their owners.
 */
function ours(doc: Y.Doc, worldId: string): ContinentEntry[] {
  const maps = continentMaps(doc);
  const out: ContinentEntry[] = [];
  for (const map of ["worlds", "chunks", "notes"] as const) {
    maps[map].forEach((value, key) => {
      const entry = { map, key, value };
      if (mayWrite(entry, worldId, false)) out.push(entry);
    });
  }
  return out;
}

export function gateContinent(
  doc: Y.Doc,
  local: ContinentHello,
  transport: ContinentTransport,
  clock: () => number = Date.now,
): ContinentGate {
  const introduced = new Set<string>();
  const verified = new Map<string, ContinentHello>();
  const turnedAway: AppError[] = [];
  /** Peers already turned away here: their own reject of us says nothing new. */
  const refused = new Set<string>();
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  const chatListeners = new Set<(worldId: string, text: string) => void>();
  /** When each peer's recent chat frames arrived (every frame counts, readable or not). */
  const heard = new Map<string, number[]>();
  /** When this player's own recent lines went out. */
  const said: number[] = [];

  const sendAll = (peerId: string, entries: readonly ContinentEntry[]): void => {
    for (const batch of batches(entries))
      transport.send(peerId, { type: "entries", entries: batch });
  };
  const introduce = (peerId: string): void => {
    if (introduced.has(peerId)) return;
    introduced.add(peerId);
    transport.send(peerId, { type: "hello", hello: local });
  };

  const receive = (peerId: string, message: ContinentMessage): void => {
    if (message.type === "hello") {
      const checked = validateContinentHello(local, message.hello);
      if (!checked.ok) {
        verified.delete(peerId);
        introduce(peerId);
        if (refused.has(peerId)) return;
        refused.add(peerId);
        turnedAway.push(checked.error);
        transport.send(peerId, { type: "reject", error: checked.error });
        notify();
        return;
      }
      if (verified.has(peerId)) return;
      // Verified before answering: the peer's land may follow our hello immediately.
      verified.set(peerId, message.hello);
      introduce(peerId);
      sendAll(peerId, ours(doc, local.worldId));
      notify();
      return;
    }
    if (message.type === "reject") {
      if (refused.has(peerId)) return;
      refused.add(peerId);
      turnedAway.push(message.error);
      notify();
      return;
    }
    if (message.type === "chat") {
      // Words from a peer that never proved itself are dropped like its land.
      const from = verified.get(peerId)?.worldId;
      if (from === undefined) return;
      const times = heard.get(peerId) ?? [];
      heard.set(peerId, times);
      const now = clock();
      if (!withinBurst(times, now)) return;
      times.push(now);
      const text = readChatText(message.text);
      if (text === null) return;
      for (const listener of chatListeners) listener(from, text);
      return;
    }
    // Land from a peer that never proved itself is dropped, whatever it claims to be.
    const sender = verified.get(peerId)?.worldId;
    if (sender === undefined) return;
    const maps = continentMaps(doc);
    const entries = message.entries.flatMap((raw) => {
      const entry = readContinentEntry(raw);
      if (entry === null) return [];
      return mayWrite(entry, sender, maps[entry.map].has(entry.key)) ? [entry] : [];
    });
    if (entries.length === 0) return;
    doc.transact(() => {
      for (const entry of entries) {
        if (entry.value === null) maps[entry.map].delete(entry.key);
        else maps[entry.map].set(entry.key, entry.value);
      }
    }, REMOTE);
  };

  // This world's own changes go to every verified peer, and to nobody else.
  const maps = continentMaps(doc);
  const observers = (["worlds", "chunks", "notes"] as const).map((name) => {
    const map = maps[name];
    const observer = (event: Y.YMapEvent<unknown>): void => {
      if (event.transaction.origin === REMOTE || verified.size === 0) return;
      const entries: ContinentEntry[] = [...event.keysChanged].map((key) => ({
        map: name,
        key,
        value: map.has(key) ? map.get(key) : null,
      }));
      for (const peerId of verified.keys()) sendAll(peerId, entries);
    };
    map.observe(observer);
    return () => map.unobserve(observer);
  });

  const offs = [
    transport.onPeer(introduce),
    transport.onPeerLeft((peerId) => {
      introduced.delete(peerId);
      refused.delete(peerId);
      heard.delete(peerId);
      if (verified.delete(peerId)) notify();
    }),
    transport.onMessage(receive),
  ];

  return {
    verifiedWorlds: () => new Set([...verified.values()].map((hello) => hello.worldId)),
    rejected: () => [...turnedAway],
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    sendChat(raw) {
      const text = readChatText(raw);
      if (text === null) {
        return err(
          "chat-unreadable",
          "That line is empty or too long to send.",
          "Write up to 200 characters.",
        );
      }
      const now = clock();
      if (!withinBurst(said, now)) {
        return err(
          "chat-too-fast",
          "That is a lot of lines at once.",
          "Wait a few seconds, then say it again.",
        );
      }
      said.push(now);
      let peers = 0;
      for (const peerId of verified.keys()) {
        if (transport.send(peerId, { type: "chat", text })) peers += 1;
      }
      return ok({ text, peers });
    },
    onChat(listener) {
      chatListeners.add(listener);
      return () => chatListeners.delete(listener);
    },
    close() {
      for (const off of [...offs, ...observers]) off();
      listeners.clear();
      chatListeners.clear();
      verified.clear();
      heard.clear();
    },
  };
}
