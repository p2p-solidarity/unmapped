// Chat in a shared world (docs/plans/simplify-together.md → Chat): a line goes up through main to
// the world's service, which relays it to every friend there that hears chat and keeps nothing.
// Main cleans each line it hears; here it is read as untrusted once more (the world it names, a
// well-formed author key, `readChatText`), and the sender's name comes from the world's fold
// (`writerName`), never from the line. Lines live in the memory-only chat store, emptied when this
// player leaves the world. On a continent the chat box talks through continentChat.ts instead.

import { type PlayedWorld, subscribeOpenWorld, writerName } from "@renderer/app/land/together";
import { sampleRemotePlayers } from "@renderer/engine/remoteRoster";
import { useChatStore } from "@renderer/state";
import { readChatText } from "@shared/continentHello";
import { AUTHOR_KEY } from "@shared/history/ids";
import { err, ok, type Result } from "@shared/result";
import { useEffect, useState } from "react";
import { getActiveContinent } from "./continent";
import { sendChat } from "./continentChat";
import { presenceWorld } from "./worldPresence";

/** A chat event as main relayed it, or null when it is not a line of `worldId` from a real key. */
export function readWorldChat(
  event: unknown,
  worldId: string,
): { from: string; text: string } | null {
  if (typeof event !== "object" || event === null) return null;
  const { world, from, text } = event as Record<string, unknown>;
  if (world !== worldId || typeof from !== "string" || !AUTHOR_KEY.test(from)) return null;
  const clean = readChatText(text);
  return clean === null ? null : { from, text: clean };
}

async function sendWorldChat(open: PlayedWorld, text: string): Promise<Result<void>> {
  const sent = await window.seed.world.sendChat(open.worldId, text);
  if (!sent.ok) return sent;
  const clean = readChatText(text) ?? text;
  useChatStore.getState().push({ name: null, mine: true, text: clean, at: Date.now() });
  return ok(undefined);
}

/** Says one line to the friends this player is with: on a continent, else in the shared world. */
export async function sayLine(text: string): Promise<Result<void>> {
  if (getActiveContinent() !== null) {
    const sent = sendChat(text);
    return sent.ok ? ok(undefined) : sent;
  }
  const open = presenceWorld();
  if (open === null) {
    return err(
      "chat-no-friends",
      "Chat works only while you play with friends.",
      "Invite friends or join a friend's world first.",
    );
  }
  return sendWorldChat(open, text);
}

/** How many other players stand in this shared world right now (presence), re-read each second. */
export function useWorldFriendsHere(live: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!live) {
      setCount(0);
      return;
    }
    const read = (): void => setCount(sampleRemotePlayers(performance.now()).length);
    read();
    const timer = setInterval(read, 1_000);
    return () => clearInterval(timer);
  }, [live]);
  return count;
}

/** Files every line a friend says in the shared world being played; forgets them on leaving it. */
export function useWorldChat(): void {
  useEffect(() => {
    let world: string | null = presenceWorld()?.worldId ?? null;
    const off = window.seed.world.onChat((event) => {
      const open = presenceWorld();
      const heard = open === null ? null : readWorldChat(event, open.worldId);
      if (open === null || heard === null) return;
      useChatStore.getState().push({
        name: writerName(heard.from, open.now),
        mine: false,
        text: heard.text,
        at: Date.now(),
      });
    });
    const offWorld = subscribeOpenWorld(() => {
      const now = presenceWorld()?.worldId ?? null;
      if (now === world) return;
      // Another world (or none): what was said in the last one stays with it.
      if (world !== null && getActiveContinent() === null) useChatStore.getState().clear();
      world = now;
    });
    return () => {
      off();
      offWorld();
    };
  }, []);
}
