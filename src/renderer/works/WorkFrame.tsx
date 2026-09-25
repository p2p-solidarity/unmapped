// Hosts one world session in a sandboxed iframe (no allow-same-origin). Every message is run
// through `acceptFrameMessage`; a missing heartbeat means the world hung, and the host asks main to
// stop that frame's process — the rest of the app keeps running. In "check" mode the frame also
// replays a few keys and a click, and reports whether the world started and stayed error-free.

import { colors, ErrorBlock, Text } from "@renderer/ui";
import { type AppError, errored, type Loadable, loading, ready } from "@shared/result";
import {
  type FrameMessage,
  type Json,
  WORK_LIMITS,
  WORK_PROTOCOL,
  type WorkSession,
  type WorkSessionSource,
} from "@shared/works";
import { type CSSProperties, type JSX, useEffect, useRef, useState } from "react";
import {
  acceptFrameMessage,
  type CheckOutcome,
  type CheckProblem,
  FLOOD_LIMIT,
  newRateWindow,
} from "./frameGuard";

export type FrameMode = "play" | "check";

export type FrameEvent =
  | { kind: "opened"; session: WorkSession }
  | { kind: "message"; message: FrameMessage }
  | { kind: "fault"; error: AppError }
  | { kind: "checked"; outcome: CheckOutcome };

const START_MS = 10_000;
const CHECK_DEADLINE_MS = 25_000;

function sourceKey(source: WorkSessionSource): string {
  return source.kind === "play" ? source.playId : `${source.draftId}/${source.candidateId}`;
}

export function WorkFrame({
  source,
  runKey,
  mode,
  onEvent,
  style,
}: {
  source: WorkSessionSource;
  /** Bump to open a fresh session (restart, reload after a fix). */
  runKey: number;
  mode: FrameMode;
  onEvent: (event: FrameEvent) => void;
  style?: CSSProperties;
}): JSX.Element {
  const [session, setSession] = useState<Loadable<WorkSession>>(loading());
  const frameRef = useRef<HTMLIFrameElement>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  // State and carry are read once when a session opens; later saves must not reopen the frame.
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const key = sourceKey(source);

  // biome-ignore lint/correctness/useExhaustiveDependencies: key and runKey are the session identity
  useEffect(() => {
    let cancelled = false;
    let token: string | null = null;
    let faulted = false;
    let started = false;
    let lastBeat = Date.now();
    const rate = newRateWindow();
    const problems: CheckProblem[] = [];
    let rendered: boolean | null = null;
    let savedState: Json | null = null;
    let checked = false;
    setSession(loading());

    const emit = (event: FrameEvent): void => onEventRef.current(event);
    const finishCheck = (): void => {
      if (mode !== "check" || checked) return;
      checked = true;
      const outcome: CheckOutcome = {
        passed: problems.length === 0 && rendered === true,
        rendered: rendered === true,
        problems,
        savedState,
      };
      emit({ kind: "checked", outcome });
    };
    const fault = (error: AppError, kill: boolean): void => {
      if (faulted) return;
      faulted = true;
      if (token !== null) void window.seed.works.closeSession(token, kill);
      token = null;
      setSession(errored(error));
      problems.push({ file: "player", line: null, column: null, message: error.message });
      emit({ kind: "fault", error });
      finishCheck();
    };

    void window.seed.works.openSession(sourceRef.current).then((result) => {
      if (cancelled) {
        if (result.ok) void window.seed.works.closeSession(result.value.token, false);
        return;
      }
      if (!result.ok) {
        fault(result.error, false);
        return;
      }
      token = result.value.token;
      lastBeat = Date.now();
      setSession(ready(result.value));
      emit({ kind: "opened", session: result.value });
    });

    const onMessage = (event: MessageEvent): void => {
      if (token === null) return;
      const verdict = acceptFrameMessage(
        { source: event.source, origin: event.origin, data: event.data },
        { source: frameRef.current?.contentWindow ?? null, token },
        rate,
        Date.now(),
      );
      if (!verdict.ok) {
        if (rate.dropped > FLOOD_LIMIT) {
          fault({ code: "world-flooding", message: "The world sent too many messages." }, true);
        }
        return;
      }
      const message = verdict.message;
      lastBeat = Date.now();
      started = true;
      if (message.type === "heartbeat") return;
      if (mode === "check") {
        if (message.type === "save") savedState = message.state;
        if (message.type === "error") {
          problems.push({
            file: message.file,
            line: message.line,
            column: message.column,
            message: message.message,
          });
        } else if (message.type === "ready" && rendered === null) {
          rendered = message.rendered;
          if (!message.rendered) {
            problems.push({
              file: "player",
              line: null,
              column: null,
              message: "Nothing was drawn inside host.root after the script ran.",
            });
          }
          setTimeout(() => {
            frameRef.current?.contentWindow?.postMessage(
              { ulw: WORK_PROTOCOL, type: "probe" },
              "*",
            );
          }, 300);
        } else if (message.type === "probed") {
          setTimeout(finishCheck, 300);
        }
      }
      emit({ kind: "message", message });
    };
    window.addEventListener("message", onMessage);

    let deadline = Date.now() + CHECK_DEADLINE_MS;
    const watchdog = setInterval(() => {
      if (token === null) return;
      // A hidden window pauses and throttles every frame's timers; silence then says nothing
      // about the world, so neither the stall clock nor the check deadline runs.
      if (document.visibilityState === "hidden") {
        lastBeat = Date.now();
        deadline += 500;
        return;
      }
      const quiet = Date.now() - lastBeat;
      if (quiet > (started ? WORK_LIMITS.stallMs : START_MS)) {
        fault(
          {
            code: "world-stalled",
            message: started
              ? "The world stopped responding (an endless loop, or it tried to leave its page). It was stopped."
              : "The world did not start.",
            hint: "Reload it, or describe the problem so the model can fix it.",
          },
          true,
        );
        return;
      }
      if (mode === "check" && Date.now() > deadline) {
        problems.push({
          file: "player",
          line: null,
          column: null,
          message:
            rendered === null
              ? "The world never reported that it started."
              : "The input check did not finish.",
        });
        finishCheck();
      }
    }, 500);

    return () => {
      cancelled = true;
      window.removeEventListener("message", onMessage);
      clearInterval(watchdog);
      // Only a world that missed two heartbeats is treated as hung on the way out.
      const hung = Date.now() - lastBeat > 2 * WORK_LIMITS.heartbeatMs + 500;
      if (token !== null) void window.seed.works.closeSession(token, hung);
    };
  }, [key, runKey, mode]);

  const box: CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    background: colors.bg,
    ...style,
  };
  if (session.status === "error") {
    return (
      <div style={{ ...box, padding: 16 }}>
        <ErrorBlock error={session.error} />
      </div>
    );
  }
  if (session.status !== "ready") {
    return (
      <div style={{ ...box, display: "grid", placeItems: "center" }}>
        <Text tone="muted">Starting world…</Text>
      </div>
    );
  }
  return (
    <div style={box}>
      <iframe
        ref={frameRef}
        key={session.value.token}
        src={session.value.url}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        title={session.value.title}
        style={{ border: 0, width: "100%", height: "100%", display: "block" }}
        onLoad={() => {
          if (mode === "play") frameRef.current?.focus();
        }}
      />
    </div>
  );
}
