// The creation loop for one draft: one sentence → generated world → play it here → one sentence
// to change it → the change is checked in a second sandboxed frame before it may replace the
// playable version → save an immutable version. Every attempt, its summary, files touched, timing
// and token use stay visible, and any earlier playable version can be restored.

import { errorLine, formatNumber, type StringKey, type Translate, useT } from "@renderer/i18n";
import { useInferenceStore } from "@renderer/state/inferenceStore";
import { Button, colors, ErrorBlock, Surface, space, Text, TextField } from "@renderer/ui";
import type { AppError } from "@shared/result";
import {
  assetMapSchema,
  type CandidateKind,
  type CandidateStatus,
  type Json,
  type WorkAssetMap,
  type WorkDraft,
} from "@shared/works";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { type AttemptReport, runAttempt } from "./author";
import { useChecker } from "./useChecker";
import { type FrameEvent, WorkFrame } from "./WorkFrame";

interface Running {
  controller: AbortController;
  stage: string;
  startedAt: number;
}

const KIND: Record<CandidateKind, StringKey> = {
  generate: "works.kindGenerate",
  edit: "works.kindEdit",
  repair: "works.kindRepair",
  asset: "works.kindAsset",
  import: "works.kindImport",
};

const STATUS: Record<CandidateStatus, StringKey> = {
  pending: "works.statusPending",
  playable: "works.statusPlayable",
  failed: "works.statusFailed",
  stale: "works.statusStale",
  cancelled: "works.statusCancelled",
};

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

function tokens(value: number | null): string {
  return value === null ? "?" : formatNumber(value);
}

function describeReport(report: AttemptReport, t: Translate): string {
  const pass =
    report.outcome === "playable"
      ? t(report.firstPass ? "works.firstTry" : "works.afterRepair")
      : "";
  return [
    t(KIND[report.kind]),
    t(STATUS[report.outcome]),
    pass,
    seconds(report.elapsedMs),
    t("works.modelTime", { time: seconds(report.modelMs) }),
    t("works.tokensInOut", {
      in: tokens(report.promptTokens),
      out: tokens(report.completionTokens),
    }),
    t("works.repairCount", { n: report.repairs }),
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
  const t = useT();
  const model = useInferenceStore((state) => state.config?.model ?? null);
  const [draft, setDraft] = useState<WorkDraft | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [running, setRunning] = useState<Running | null>(null);
  const { checkCandidate: checkIn, checker } = useChecker();
  const checkCandidate = useCallback(
    (candidateId: string) => checkIn(draftId, candidateId),
    [checkIn, draftId],
  );
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

  const attempt = useCallback(
    async (kind: "generate" | "edit", words: string, base: WorkDraft) => {
      const controller = new AbortController();
      setRunning({ controller, stage: t("works.stageStarting"), startedAt: Date.now() });
      setNotice(null);
      const result = await runAttempt(base, kind, words, {
        check: checkCandidate,
        signal: controller.signal,
        model,
        onStage: (stage) =>
          setRunning((current) => (current === null ? current : { ...current, stage })),
      });
      setRunning(null);
      const fresh = await reload();
      if (!result.ok) {
        setNotice(errorLine(result.error));
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
        if (kind === "edit") setNotice(t("works.noticeRestarted"));
      } else if (report.outcome === "cancelled") {
        setNotice(t("works.noticeCancelled"));
      } else {
        // The problems are the checker's own diagnostics (also the repair prompt's), kept as is.
        const notApplied = t("works.noticeNotApplied", { outcome: t(STATUS[report.outcome]) });
        setNotice([notApplied, ...report.problems].join("\n"));
      }
      if (fresh !== null) setDraft(fresh);
    },
    [checkCandidate, draftId, model, reload, t],
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

  const onPreviewEvent = (event: FrameEvent): void => {
    if (event.kind === "opened") {
      setMissing(event.session.missingAssets);
      setPreviewStatus("");
    } else if (event.kind === "fault") {
      setPreviewStatus(errorLine(event.error));
    } else if (event.kind === "message") {
      const message = event.message;
      if (message.type === "save") previewState.current = message.state;
      else if (message.type === "status") setPreviewStatus(message.text);
      else if (message.type === "complete")
        setPreviewStatus(t("works.previewCleared", { summary: message.summary }));
      else if (message.type === "error")
        setPreviewStatus(
          t("works.previewError", { message: message.message.split("\n")[0] ?? "" }),
        );
    }
  };

  /** Both ways to change one image land in the same place: a candidate that must pass the check. */
  const swapAsset = async (assetId: string, how: "pick" | "generate"): Promise<void> => {
    if (draft === null) return;
    const expectedHead = draft.head;
    const controller = new AbortController();
    if (how === "generate") {
      const stage = t("works.stageDrawing", { asset: assetId });
      setRunning({ controller, stage, startedAt: Date.now() });
    }
    const written =
      how === "pick"
        ? await window.seed.works.replaceAsset(draftId, assetId)
        : await window.seed.works.generateAsset(draftId, assetId);
    if (!written.ok) {
      setRunning(null);
      setNotice(errorLine(written.error));
      return;
    }
    if (written.value === null) {
      setRunning(null);
      return;
    }
    const candidateId = written.value.candidate.id;
    setRunning({ controller, stage: t("works.stageCheckingImage"), startedAt: Date.now() });
    const outcome = await checkCandidate(candidateId);
    setRunning(null);
    const settled = await window.seed.works.settleCandidate({
      draftId,
      candidateId,
      outcome: outcome.passed ? "playable" : "failed",
      error: outcome.passed ? null : outcome.problems.map((problem) => problem.message).join("\n"),
      expectedHead,
    });
    if (!settled.ok) setNotice(errorLine(settled.error));
    else setPreviewKey((key) => key + 1);
    await reload();
  };

  const publish = async (): Promise<void> => {
    const result = await window.seed.works.publishDraft(draftId);
    if (!result.ok) setNotice(errorLine(result.error));
    else {
      setDraft(result.value.draft);
      const { title, version } = result.value.manifest;
      setNotice(t("works.noticeSaved", { title, version }));
    }
  };

  const restore = async (candidateId: string): Promise<void> => {
    const result = await window.seed.works.revertDraft(draftId, candidateId);
    if (!result.ok) setNotice(errorLine(result.error));
    else {
      setDraft(result.value);
      previewState.current = null;
      setPreviewKey((key) => key + 1);
      setNotice(t("works.noticeRestored", { id: candidateId }));
    }
  };

  if (error !== null) {
    return (
      <div style={{ padding: space.xl, display: "flex", flexDirection: "column", gap: space.md }}>
        <ErrorBlock error={error} />
        <Button onClick={onExit}>{t("common.back")}</Button>
      </div>
    );
  }
  if (draft === null) {
    return (
      <div style={{ padding: space.xl }}>
        <Text tone="muted">{t("works.openingDraft")}</Text>
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
            {t("works.backToWorlds")}
          </Button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text>{draft.title}</Text>
            <Text variant="caption" tone="muted">
              {" "}
              ·{" "}
              {head === null
                ? t("works.noPlayableVersion")
                : t("works.playingVersion", { id: head.id })}{" "}
              ·{" "}
              {draft.published.length > 0
                ? t("works.savedVersion", { version: draft.published.at(-1)?.version ?? "" })
                : t("works.notSaved")}
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
            {t("works.restart")}
          </Button>
          <Button variant="primary" disabled={head === null || busy} onClick={() => void publish()}>
            {t("works.saveVersion")}
          </Button>
        </div>
        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          {head === null ? (
            <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
              <Text tone="muted">
                {busy ? t("works.firstVersionHere") : t("works.nothingPlayable")}
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
            label={head === null ? t("works.describeWorld") : t("works.changeRequest")}
            value={request}
            maxLength={2000}
            disabled={busy}
            placeholder={head === null ? t("works.oneSentence") : t("works.changePlaceholder")}
            onChange={(event) => setRequest(event.target.value)}
          />
          <div style={{ display: "flex", gap: space.sm }}>
            <Button variant="primary" type="submit" disabled={busy || request.trim() === ""}>
              {head === null ? t("works.generate") : t("works.applyChange")}
            </Button>
            {running === null ? null : (
              <Button variant="destructive" onClick={() => running.controller.abort()}>
                {t("common.cancel")}
              </Button>
            )}
          </div>
        </form>

        {running === null ? null : (
          <Surface variant="inset" padding="sm">
            <Text>{running.stage}</Text>
            <Text variant="caption" tone="muted">
              {t("works.runningNote", { elapsed: seconds(now - running.startedAt) })}
            </Text>
          </Surface>
        )}
        {notice === null ? null : (
          <Text variant="caption" tone="accent" style={{ whiteSpace: "pre-wrap" }}>
            {notice}
          </Text>
        )}

        {checker}

        {Object.keys(assets).length === 0 ? null : (
          <Surface padding="sm">
            <Text variant="label">{t("works.images")}</Text>
            {Object.entries(assets).map(([id, entry]) => (
              <div key={id} style={{ display: "flex", alignItems: "center", gap: space.sm }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="caption">
                    {id}{" "}
                    <Text variant="caption" tone={missing.includes(id) ? "danger" : "muted"}>
                      {missing.includes(id)
                        ? t("works.missing")
                        : (entry.src ?? t("works.missing"))}
                    </Text>
                  </Text>
                  <Text variant="caption" tone="dim">
                    {" "}
                    {entry.note}
                  </Text>
                </div>
                <Button
                  variant="chip"
                  disabled={busy}
                  onClick={() => void swapAsset(id, "generate")}
                >
                  {t("works.generate")}
                </Button>
                <Button variant="chip" disabled={busy} onClick={() => void swapAsset(id, "pick")}>
                  {t("works.replace")}
                </Button>
              </div>
            ))}
          </Surface>
        )}

        {reports.length === 0 ? null : (
          <Surface padding="sm">
            <Text variant="label">{t("works.thisSession")}</Text>
            {reports.map((report) => (
              <Text
                key={`${report.kind}-${report.elapsedMs}-${report.candidates.join(".")}`}
                variant="caption"
                tone="muted"
              >
                {describeReport(report, t)}
              </Text>
            ))}
          </Surface>
        )}

        <Surface padding="sm">
          <Text variant="label">{t("works.history")}</Text>
          {[...draft.candidates].reverse().map((candidate) => (
            <Surface key={candidate.id} variant="inset" padding="sm">
              <Text variant="caption">
                {candidate.id} · {t(KIND[candidate.kind])} ·{" "}
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
                  {candidate.id === draft.head ? t("works.current") : t(STATUS[candidate.status])}
                </Text>
                {candidate.changed.length > 0 ? ` · ${candidate.changed.join(", ")}` : ""}
              </Text>
              <Text variant="caption" tone="muted">
                {candidate.request.split("\n")[0]?.slice(0, 160)}
              </Text>
              {candidate.summary === "" ? null : <Text variant="caption">{candidate.summary}</Text>}
              {candidate.metrics === null ? null : (
                <Text variant="caption" tone="dim">
                  {t("works.metricsLine", {
                    time: seconds(candidate.metrics.elapsedMs),
                    in: tokens(candidate.metrics.promptTokens),
                    out: tokens(candidate.metrics.completionTokens),
                  })}
                </Text>
              )}
              {candidate.error === null ? null : (
                <Text variant="caption" tone="danger" style={{ whiteSpace: "pre-wrap" }}>
                  {candidate.error.slice(0, 400)}
                </Text>
              )}
              {candidate.status === "playable" && candidate.id !== draft.head ? (
                <Button variant="chip" disabled={busy} onClick={() => void restore(candidate.id)}>
                  {t("works.restoreVersion")}
                </Button>
              ) : null}
            </Surface>
          ))}
        </Surface>
      </div>
    </div>
  );
}
