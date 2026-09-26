// One door action's Result under the control that ran it (rev 6 phase 3, WP8; Rule 2): nothing
// while idle, its progress line while loading, then the success line or the error. Shared by the
// door's sections (./WorldDoorSection, ./DoorPeople, ./DoorChain).

import { ErrorBlock, Text } from "@renderer/ui";
import type { Loadable } from "@shared/result";
import type { JSX } from "react";

export function Outcome<T>({
  state,
  busy,
  done,
}: {
  state: Loadable<T>;
  busy: string;
  done: (value: T) => string;
}): JSX.Element | null {
  if (state.status === "idle") return null;
  if (state.status === "loading") {
    return (
      <Text variant="caption" tone="muted">
        {busy}
      </Text>
    );
  }
  if (state.status === "error") return <ErrorBlock error={state.error} />;
  return (
    <Text variant="caption" tone="success">
      {done(state.value)}
    </Text>
  );
}
