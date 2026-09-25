// The creation loop for one draft: one sentence → generated world → play it here → one sentence
// to change it → the change is checked in a second sandboxed frame before it may replace the
// playable version → save an immutable version. Every attempt, its summary, files touched, timing
// and token use stay visible, and any earlier playable version can be restored.

import { useInferenceStore } from "@renderer/state/inferenceStore";
import { Button, colors, ErrorBlock, Surface, space, Text, TextField } from "@renderer/ui";
import type { AppError } from "@shared/result";
import { assetMapSchema, type Json, type WorkAssetMap, type WorkDraft } from "@shared/works";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { type AttemptReport, runAttempt } from "./author";
import type { CheckOutcome } from "./frameGuard";
import { type FrameEvent, WorkFrame } from "./WorkFrame";

interface PendingCheck {
  candidateId: string;
  /** null for a fresh start; otherwise the state saved by the first pass (resume check). */
  state: Json | null;
  resolve: (outcome: CheckOutcome) => void;
}

interface Running {
  controller: AbortController;
  stage: string;
  startedAt: number;
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

function tokens(value: number | null): string {
  return value === null ? "?" : value.toLocaleString();
}

function describeReport(report: AttemptReport): string {
  const pass =
    report.outcome === "playable" ? (report.firstPass ? "first try" : "after repair") : "";
  return [
    report.kind,
    report.outcome,
    pass,
    seconds(report.elapsedMs),
    `model ${seconds(report.modelMs)}`,
    `${tokens(report.promptTokens)} in / ${tokens(report.completionTokens)} out tokens`,
    `${report.repairs} repair${report.repairs === 1 ? "" : "s"}`,
  ]
    .filter((part) => part !== "")
    .join(" · ");
}

export function WorkshopView({
  draftId,
  initialRequest,
  onExit,
}: {
  draftId: string;
  initialRequest: string | null;
  onExit: () => void;
}): JSX.Element {
  const model = useInferenceStore((state) => state.config?.model ?? null);
  const [draft, setDraft] = useState<WorkDraft | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [running, setRunning] = useState<Running | null>(null);
  const [check, setCheck] = useState<PendingCheck | null>(null);
  const [reports, setReports] = useState<AttemptReport[]>([]);
  const [request, setRequest] = useState("");
  const [previewKey, setPreviewKey] = useState(0);
  const [previewStatus, setPreviewStatus] = useState("");
  const [assets, setAssets] = useState<WorkAssetMap>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const previewState = useRef<Json | null>(null);
  const started = useRef(false);

  const reload = useCallback(async (): Promise<WorkDraft | null> => {
    const result = await window.seed.works.readDraft(draftId);
    if (!result.ok) {
      setError(result.error);
      return null;
    }
    setDraft(result.value);
    return result.value;
  }, [draftId]);

  // The asset list always describes the playable version, never a pending attempt.
  useEffect(() => {
    if (draft?.head === null || draft?.head === undefined) {
      setAssets({});
      return;
    }
    void window.seed.works.readCandidate(draftId, draft.head).then((text) => {
      if (!text.ok) return;
      const parsed = assetMapSchema.safeParse(JSON.parse(text.value.assets));
      setAssets(parsed.success ? parsed.data : {});
    });
  }, [draftId, draft?.head]);

  useEffect(() => {
    if (running === null) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [running]);

  const runCheck = useCallback(
    (candidateId: string, state: Json | null) =>
      new Promise<CheckOutcome>((resolve) => {
        setCheck({ candidateId, state, resolve });
      }),
    [],
  );

  // Fresh start first; if the world saved anything, it must also come back from that save —
  // worlds often save only part of what their loop needs, which breaks every later resume.
  const checkCandidate = useCallback(
    async (candidateId: string): Promise<CheckOutcome> => {
      const fresh = await runCheck(candidateId, null);
      if (!fresh.passed || fresh.savedState === null) return fresh;
      const resumed = await runCheck(candidateId, fresh.savedState);
      if (resumed.passed) return fresh;
      return {
        ...resumed,
        problems: resumed.problems.map((problem) => ({
          ...problem,
          message: `After reloading the state it saved with host.save: ${problem.message}. host.load() must restore everything main.js needs.`,
        })),
      };
    },
    [runCheck],
  );

  const attempt = useCallback(
    async (kind: "generate" | "edit", words: string, base: WorkDraft) => {
      const controller = new AbortController();
      setRunning({ controller, stage: "Starting…", startedAt: Date.now() });
      setNotice(null);
      const result = await runAttempt(base, kind, words, {
        check: checkCandidate,
        signal: controller.signal,
        model,
        onStage: (stage) =>
          setRunning((current) => (current === null ? current : { ...current, stage })),
      });
      setRunning(null);
      setCheck(null);
      const fresh = await reload();
      if (!result.ok) {
        setNotice(`${result.error.code}: ${result.error.message}`);
        return;
      }
      const report = result.value;
      // Dev acceptance log: the measured numbers are read from here, never estimated.
      console.info(`[works:attempt] ${JSON.stringify({ draftId, ...report, draft: undefined })}`);
      setReports((current) => [report, ...current]);
      if (report.outcome === "playable") {
        // A changed world may not understand the old preview save; it always starts over.
        previewState.current = null;
        setPreviewKey((key) => key + 1);
        if (kind === "edit") setNotice("Preview restarted from the beginning for the new version.");
      } else {
        setNotice(
          report.outcome === "cancelled"
            ? "Cancelled. The playable version was not touched."
            : `Not applied (${report.outcome}). The playable version was not touched.${report.problems.length > 0 ? `\n${report.problems.join("\n")}` : ""}`,
        );
      }
      if (fresh !== null) setDraft(fresh);
    },
    [checkCandidate, draftId, model, reload],
  );

  useEffect(() => {
    void reload().then((loaded) => {
      if (loaded === null || started.current) return;
      started.current = true;
      if (initialRequest !== null && loaded.candidates.length === 0) {
        void attempt("generate", initialRequest, loaded);
      }
    });
  }, [attempt, initialRequest, reload]);

  const onCheckEvent = (event: FrameEvent): void => {
    if (event.kind !== "checked" || check === null) return;
    check.resolve(event.outcome);
    setCheck(null);
  };

  const onPreviewEvent = (event: FrameEvent): void => {
    if (event.kind === "opened") {
      setMissing(event.session.missingAssets);
      setPreviewStatus("");
    } else if (event.kind === "fault") {
      setPreviewStatus(event.error.message);
    } else if (event.kind === "message") {
      const message = event.message;
      if (message.type === "save") previewState.current = message.state;
      else if (message.type === "status") setPreviewStatus(message.text);
      else if (message.type === "complete") setPreviewStatus(`Cleared: ${message.summary}`);
      else if (message.type === "error")
        setPreviewStatus(`Error: ${message.message.split("\n")[0]}`);
    }
  };

  const replaceAsset = async (assetId: string): Promise<void> => {
    if (draft === null) return;
    const expectedHead = draft.head;
    const written = await window.seed.works.replaceAsset(draftId, assetId);
    if (!written.ok) {
      setNotice(written.error.message);
      return;
    }
    if (written.value === null) return;
    const candidateId = written.value.candidate.id;
    const controller = new AbortController();
    setRunning({ controller, stage: "Checking the new image…", startedAt: Date.now() });
    const outcome = await checkCandidate(candidateId);
    setRunning(null);
    const settled = await window.seed.works.settleCandidate({
      draftId,
      candidateId,
      outcome: outcome.passed ? "playable" : "failed",
      error: outcome.passed ? null : outcome.problems.map((problem) => problem.message).join("\n"),
      expectedHead,
    });
    if (!settled.ok) setNotice(settled.error.message);
    else setPreviewKey((key) => key + 1);
    await reload();
  };

  const publish = async (): Promise<void> => {
    const result = await window.seed.works.publishDraft(draftId);
    if (!result.ok) setNotice(result.error.message);
    else {
      setDraft(result.value.draft);
      setNotice(`Saved ${result.value.manifest.title} v${result.value.manifest.version}.`);
    }
  };

  const restore = async (candidateId: string): Promise<void> => {
    const result = await window.seed.works.revertDraft(draftId, candidateId);
    if (!result.ok) setNotice(result.error.message);
    else {
      setDraft(result.value);
      previewState.current = null;
      setPreviewKey((key) => key + 1);
      setNotice(`Restored ${candidateId}.`);
    }
  };

  if (error !== null) {
    return (
      <div style={{ padding: space.xl, display: "flex", flexDirection: "column", gap: space.md }}>
        <ErrorBlock error={error} />
        <Button onClick={onExit}>Back</Button>
      </div>
    );
  }
  if (draft === null) {
    return (
      <div style={{ padding: space.xl }}>
        <Text tone="muted">Opening draft…</Text>
      </div>
    );
  }

  const head = draft.candidates.find((candidate) => candidate.id === draft.head) ?? null;
  const busy = running !== null;
  const submit = (): void => {
    const words = request.trim();
    if (words === "" || busy) return;
    setRequest("");
    void attempt(head === null ? "generate" : "edit", words, draft);
  };

  return (
    <div style={{ display: "flex", height: "100%", background: colors.bg }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: space.md,
            padding: `${space.sm}px ${space.lg}px`,
            borderBottom: `1px solid ${colors.surfaceBorder}`,
          }}
        >
          <Button variant="ghost" onClick={onExit} disabled={busy}>
            ← Worlds
          </Button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text>{draft.title}</Text>
            <Text variant="caption" tone="muted">
              {" "}
              · {head === null ? "no playable version yet" : `playing ${head.id}`} ·{" "}
              {draft.published.length > 0
                ? `saved v${draft.published.at(-1)?.version}`
                : "not saved"}
            </Text>
          </div>
          <Text variant="caption" tone="muted">
            {previewStatus}
          </Text>
          <Button
            disabled={head === null}
            onClick={() => {
              previewState.current = null;
              setPreviewKey((key) => key + 1);
            }}
          >
            Restart
          </Button>
          <Button variant="primary" disabled={head === null || busy} onClick={() => void publish()}>
            Save version
          </Button>
        </div>
        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          {head === null ? (
            <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
              <Text tone="muted">
                {busy
                  ? "The first version appears here once it passes the check."
                  : "Nothing playable yet."}
              </Text>
            </div>
          ) : (
            <WorkFrame
              source={{
                kind: "draft",
                draftId,
                candidateId: head.id,
                state: previewState.current,
                carry: null,
              }}
              runKey={previewKey}
              mode="play"
              onEvent={onPreviewEvent}
            />
          )}
        </div>
      </div>

      <div
        style={{
          width: 420,
          borderLeft: `1px solid ${colors.surfaceBorder}`,
          overflow: "auto",
          padding: space.md,
          display: "flex",
          flexDirection: "column",
          gap: space.md,
        }}
      >
        <form
          style={{ display: "flex", flexDirection: "column", gap: space.sm }}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <TextField
            label={head === null ? "Describe the world" : "Change request"}
            value={request}
            maxLength={2000}
            disabled={busy}
            placeholder={
              head === null ? "One sentence" : "e.g. Enemies move twice as fast; make the sky dusk"
            }
            onChange={(event) => setRequest(event.target.value)}
          />
          <div style={{ display: "flex", gap: space.sm }}>
            <Button variant="primary" type="submit" disabled={busy || request.trim() === ""}>
              {head === null ? "Generate" : "Apply change"}
            </Button>
            {running === null ? null : (
              <Button variant="destructive" onClick={() => running.controller.abort()}>
                Cancel
              </Button>
            )}
          </div>
        </form>

        {running === null ? null : (
          <Surface variant="inset" padding="sm">
            <Text>{running.stage}</Text>
            <Text variant="caption" tone="muted">
              {seconds(now - running.startedAt)} · the playable version stays as it is until this
              passes
            </Text>
          </Surface>
        )}
        {notice === null ? null : (
          <Text variant="caption" tone="accent" style={{ whiteSpace: "pre-wrap" }}>
            {notice}
          </Text>
        )}

        {check === null ? null : (
          <Surface variant="outlined" padding="sm">
            <Text variant="caption" tone="muted">
              Checking {check.candidateId} in a separate sandbox (
              {check.state === null
                ? "fresh start, keys + click replayed"
                : "resuming from its save"}
              )
            </Text>
            <div style={{ height: 220 }}>
              <WorkFrame
                source={{
                  kind: "draft",
                  draftId,
                  candidateId: check.candidateId,
                  state: check.state,
                  carry: null,
                }}
                runKey={check.state === null ? 0 : 1}
                mode="check"
                onEvent={onCheckEvent}
              />
            </div>
          </Surface>
        )}

        {Object.keys(assets).length === 0 ? null : (
          <Surface padding="sm">
            <Text variant="label">Images</Text>
            {Object.entries(assets).map(([id, entry]) => (
              <div key={id} style={{ display: "flex", alignItems: "center", gap: space.sm }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="caption">
                    {id}{" "}
                    <Text variant="caption" tone={missing.includes(id) ? "danger" : "muted"}>
                      {missing.includes(id) ? "missing" : (entry.src ?? "missing")}
                    </Text>
                  </Text>
                  <Text variant="caption" tone="dim">
                    {" "}
                    {entry.note}
                  </Text>
                </div>
                <Button variant="chip" disabled={busy} onClick={() => void replaceAsset(id)}>
                  Replace…
                </Button>
              </div>
            ))}
          </Surface>
        )}

        {reports.length === 0 ? null : (
          <Surface padding="sm">
            <Text variant="label">This session</Text>
            {reports.map((report) => (
              <Text
                key={`${report.kind}-${report.elapsedMs}-${report.candidates.join(".")}`}
                variant="caption"
                tone="muted"
              >
                {describeReport(report)}
              </Text>
            ))}
          </Surface>
        )}

        <Surface padding="sm">
          <Text variant="label">History</Text>
          {[...draft.candidates].reverse().map((candidate) => (
            <Surface key={candidate.id} variant="inset" padding="sm">
              <Text variant="caption">
                {candidate.id} · {candidate.kind} ·{" "}
                <Text
                  variant="caption"
                  tone={
                    candidate.status === "playable"
                      ? "success"
                      : candidate.status === "pending"
                        ? "muted"
                        : "danger"
                  }
                >
                  {candidate.id === draft.head ? "current" : candidate.status}
                </Text>
                {candidate.changed.length > 0 ? ` · ${candidate.changed.join(", ")}` : ""}
              </Text>
              <Text variant="caption" tone="muted">
                {candidate.request.split("\n")[0]?.slice(0, 160)}
              </Text>
              {candidate.summary === "" ? null : <Text variant="caption">{candidate.summary}</Text>}
              {candidate.metrics === null ? null : (
                <Text variant="caption" tone="dim">
                  {seconds(candidate.metrics.elapsedMs)} · {tokens(candidate.metrics.promptTokens)}{" "}
                  in / {tokens(candidate.metrics.completionTokens)} out
                </Text>
              )}
              {candidate.error === null ? null : (
                <Text variant="caption" tone="danger" style={{ whiteSpace: "pre-wrap" }}>
                  {candidate.error.slice(0, 400)}
                </Text>
              )}
              {candidate.status === "playable" && candidate.id !== draft.head ? (
                <Button variant="chip" disabled={busy} onClick={() => void restore(candidate.id)}>
                  Restore this version
                </Button>
              ) : null}
            </Surface>
          ))}
        </Surface>
      </div>
    </div>
  );
}
