// Chat in a shared world (@shared/worldProtocol → Chat): the service relays what friends say and
// keeps nothing — no file, no log line, no snapshot. `hear` marks a session that can read `chat`
// frames (an older app never sends it, so it never gets one); `chat` is a line from the world's
// owner or a member, cleaned with `readChatText`, at most CHAT_BURST a session per CHAT_WINDOW_MS,
// and sent to every other reader of the world that said `hear`. A visitor to a public world reads
// the world but does not talk in it.

import { readChatText } from "@shared/continentHello";
import type { ToService } from "@shared/worldProtocol";
import type { Hub, Session } from "./hub";

type Frame<T extends ToService["t"]> = Extract<ToService, { t: T }>;

/** Lines a session may say per window; the continent gate uses the same numbers. */
export const CHAT_BURST = 5;
export const CHAT_WINDOW_MS = 5_000;

/** Which worlds each session hears chat in, and when it last spoke (real clock, ms). */
const hearing = new WeakMap<Session, Set<string>>();
const spoke = new WeakMap<Session, number[]>();

export function hears(session: Session, world: string): boolean {
  return hearing.get(session)?.has(world) === true;
}

export function handleHear(hub: Hub, session: Session, frame: Frame<"hear">): void {
  if (hub.openedWorld(session, frame.world) === null) return;
  const worlds = hearing.get(session) ?? new Set<string>();
  worlds.add(frame.world);
  hearing.set(session, worlds);
}

export function handleChat(hub: Hub, session: Session, frame: Frame<"chat">): void {
  if (hub.openedWorld(session, frame.world) === null) return;
  const role = session.worlds.get(frame.world)?.role;
  if (role !== "owner" && role !== "member") {
    hub.refuse(session, frame.world, {
      code: "chat-members-only",
      message: "Only the world's owners and members talk in it.",
      hint: "Ask the owner for an invite to talk here.",
    });
    return;
  }
  const text = readChatText(frame.text);
  if (text === null) {
    hub.refuse(session, frame.world, {
      code: "chat-invalid",
      message: "That line is empty or longer than a chat line may be.",
    });
    return;
  }
  const now = hub.clock.real();
  const recent = (spoke.get(session) ?? []).filter((at) => now - at < CHAT_WINDOW_MS);
  if (recent.length >= CHAT_BURST) {
    spoke.set(session, recent);
    hub.refuse(session, frame.world, {
      code: "quota-chat",
      message: `At most ${CHAT_BURST} lines every ${CHAT_WINDOW_MS / 1000} s.`,
      hint: "Wait a moment; lines over the limit are dropped.",
    });
    return;
  }
  recent.push(now);
  spoke.set(session, recent);
  const from = session.key ?? "";
  for (const reader of hub.readers(frame.world)) {
    if (reader === session || !hears(reader, frame.world)) continue;
    hub.send(reader, { t: "chat", world: frame.world, from, text });
  }
}

/** A session that closes a world stops hearing it. */
export function stopHearing(session: Session, world: string): void {
  hearing.get(session)?.delete(world);
}
