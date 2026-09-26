// Chat on a continent (docs/plans/simplify-together.md → Chat): what the chat box calls to say a
// line, and how a friend's line is filed. The gate (continentGate.ts) decides who may speak and how
// often; this file only names the sender — from awareness, never the message — and keeps the line in
// the memory-only chat store. Nothing here is saved.

import { useChatStore, useContinentStore } from "@renderer/state";
import { chatSenderName } from "@shared/continentHello";
import { err, ok, type Result } from "@shared/result";
import { type Continent, getActiveContinent } from "./continent";

/** Says one line to every friend on the continent, and shows it here as this player's own. */
export function sendChat(text: string): Result<number> {
  const continent = getActiveContinent();
  if (continent === null) {
    return err(
      "chat-no-friends",
      "Chat works only while you play with friends.",
      "Invite friends or join a friend's world first.",
    );
  }
  const sent = continent.gate.sendChat(text);
  if (!sent.ok) return sent;
  useChatStore.getState().push({ name: null, mine: true, text: sent.value.text, at: Date.now() });
  return ok(sent.value.peers);
}

/** Files every line a verified friend says on `continent`; returns the unsubscribe. */
export function listenToChat(continent: Continent): () => void {
  return continent.gate.onChat((worldId, text) => {
    const owner =
      useContinentStore.getState().worlds.find((world) => world.worldId === worldId)?.owner ?? null;
    const states = continent.provider.awareness.getStates().values();
    useChatStore.getState().push({
      name: chatSenderName(states, worldId, owner),
      mine: false,
      text,
      at: Date.now(),
    });
  });
}
