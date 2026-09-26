// Bringing a world along (My worlds → 邀請朋友, Join a world → a join code): the chosen save is
// opened first, so it keeps its own land and progress, and only if it really is the world now in
// Play is the continent action run (`openMyDoor`, or `joinContinentByCode` behind a friend's code).
// With no save to bring, a new adventure on the built-in world is started first. Once Play has the
// screen this panel is gone, so what the action says afterwards is a toast.

import { errorLine, translate } from "@renderer/i18n";
import { useSessionStore } from "@renderer/state";
import { ok, type Result } from "@shared/result";
import { openInstance } from "../useInstanceLoader";
import { newBuiltInAdventure } from "./startWorld";

/** Resolves with an error only when no world could be made or opened (the panel still shows). */
export async function bringWorld(
  instanceId: string | null,
  act: () => Result<string>,
  said: (code: string) => string | null = () => null,
): Promise<Result<void>> {
  let id = instanceId;
  if (id === null) {
    const made = await newBuiltInAdventure();
    if (!made.ok) return made;
    id = made.value;
  }
  await openInstance(id);
  const session = useSessionStore.getState();
  if (session.screen !== "play" || session.activeInstance?.instance.meta.instanceId !== id) {
    return ok(undefined);
  }
  const done = act();
  if (!done.ok) session.toast("danger", errorLine(done.error));
  else {
    const line = said(done.value);
    if (line !== null) session.toast("success", line);
  }
  return ok(undefined);
}

/** Opens this world's door to friends and says the join code they type. */
export function inviteLine(code: string): string {
  return translate("library.inviteOpened", { code });
}
