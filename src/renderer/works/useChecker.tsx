// The player check a candidate must pass before it may become playable: a fresh start with keys and
// a click replayed, then — if the world saved anything — a second session resumed from that save.
// Shared by the workshop and story episodes; the returned element must be on screen while a check
// runs (hidden frames get no animation frames).

import { useT } from "@renderer/i18n";
import { Surface, Text } from "@renderer/ui";
import type { Json } from "@shared/works";
import { type JSX, useCallback, useState } from "react";
import type { CheckOutcome } from "./frameGuard";
import { type FrameEvent, WorkFrame } from "./WorkFrame";

interface PendingCheck {
  draftId: string;
  candidateId: string;
  /** null for a fresh start; otherwise the state saved by the first pass (resume check). */
  state: Json | null;
  resolve: (outcome: CheckOutcome) => void;
}

export interface Checker {
  checkCandidate(draftId: string, candidateId: string): Promise<CheckOutcome>;
  /** Render this while `checking`; null otherwise. */
  checker: JSX.Element | null;
  checking: boolean;
}

export function useChecker(height = 220): Checker {
  const t = useT();
  const [check, setCheck] = useState<PendingCheck | null>(null);

  const runCheck = useCallback(
    (draftId: string, candidateId: string, state: Json | null) =>
      new Promise<CheckOutcome>((resolve) => {
        setCheck({ draftId, candidateId, state, resolve });
      }),
    [],
  );

  // Worlds often save only part of what their loop needs, which breaks every later resume.
  const checkCandidate = useCallback(
    async (draftId: string, candidateId: string): Promise<CheckOutcome> => {
      const fresh = await runCheck(draftId, candidateId, null);
      if (!fresh.passed || fresh.savedState === null) {
        setCheck(null);
        return fresh;
      }
      const resumed = await runCheck(draftId, candidateId, fresh.savedState);
      setCheck(null);
      if (resumed.passed) return fresh;
      return {
        ...resumed,
        problems: resumed.problems.map((problem) => ({
          ...problem,
          message: `After reloading the state it saved with host.save: ${problem.message}. Resume with host.load(newGame()) so whatever the save lacks comes from a fresh game.`,
        })),
      };
    },
    [runCheck],
  );

  const onEvent = (event: FrameEvent): void => {
    if (event.kind !== "checked" || check === null) return;
    check.resolve(event.outcome);
  };

  const checker =
    check === null ? null : (
      <Surface variant="outlined" padding="sm">
        <Text variant="caption" tone="muted">
          {t(check.state === null ? "works.checkingFresh" : "works.checkingResume", {
            id: check.candidateId,
          })}
        </Text>
        <div style={{ height }}>
          <WorkFrame
            source={{
              kind: "draft",
              draftId: check.draftId,
              candidateId: check.candidateId,
              state: check.state,
              carry: null,
            }}
            runKey={check.state === null ? 0 : 1}
            mode="check"
            onEvent={onEvent}
          />
        </div>
      </Surface>
    );

  return { checkCandidate, checker, checking: check !== null };
}
