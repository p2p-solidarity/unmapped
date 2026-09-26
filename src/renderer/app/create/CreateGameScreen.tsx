// The five Create steps and the draft picker. State and model calls live in useCreateController;
// the look step, the story written ahead and the quote live in their own components.
import { formatDateTime, useT } from "@renderer/i18n";
import { type BuildReadiness, buildReadiness } from "@renderer/narrative/originScene";
import { Button, ErrorBlock, StatePanel, Surface, space, Text } from "@renderer/ui";
import { bibleProblems } from "@shared/bible";
import { fromResult, idle, type Loadable, loading } from "@shared/result";
import { checkPlayKinds } from "@shared/storyEdits";
import { type JSX, useEffect, useState } from "react";
import { UsageLine } from "../hud/UsagePanel";
import { GameShell } from "../shell/GameShell";
import { BuildStep } from "./BuildStep";
import { BuiltPanel } from "./BuiltPanel";
import {
  canKeepStory,
  canKeepWorld,
  storyPlan,
  storyStale,
  worldReady,
  worldStale,
} from "./draftState";
import { IdeaStep } from "./IdeaStep";
import { LookStep, StoryAheadPanel } from "./LookStep";
import { StoryStep } from "./StoryStep";
import { StreamPreview } from "./StreamPreview";
import { STAGE_LABEL, STEP_LABEL, STEPS } from "./stages";
import { type CreateController, useCreateController } from "./useCreateController";
import { WorldStep } from "./WorldStep";

function DraftPicker({ c }: { c: CreateController }): JSX.Element {
  const t = useT();
  return (
    <>
      <Text variant="label">{t("create.draftsTitle")}</Text>
      <Text tone="muted">{t("create.draftsNote")}</Text>
      <Button variant="primary" onClick={() => void c.start()}>
        {t("create.startNew")}
      </Button>
      <StatePanel state={c.entries} loadingText={t("create.draftsLoading")}>
        {(items) =>
          items.map((entry) => (
            <Surface key={entry.draftId} variant="inset" padding="md" style={{ gap: space.sm }}>
              {entry.broken ? (
                <Text tone="danger">{t("create.draftBroken", { problem: entry.problem })}</Text>
              ) : (
                <>
                  <Text variant="label">{entry.name.trim() || t("create.untitled")}</Text>
                  <Text variant="caption" tone="dim">
                    {t("create.draftLine", {
                      step: t(STEP_LABEL[entry.step]),
                      n: entry.chapters,
                      when: formatDateTime(entry.updatedAt),
                    })}
                  </Text>
                  <Button onClick={() => void c.open(entry.draftId)}>
                    {t("create.continueDraft")}
                  </Button>
                </>
              )}
              {c.deleteId === entry.draftId ? (
                <>
                  <Text tone="danger">
                    {t("create.confirmDeleteDraft", {
                      name: entry.broken
                        ? t("create.untitled")
                        : entry.name || t("create.untitled"),
                    })}
                  </Text>
                  <Button variant="destructive" onClick={() => void c.remove(entry.draftId)}>
                    {t("common.remove")}
                  </Button>
                  <Button variant="ghost" onClick={() => c.setDeleteId(null)}>
                    {t("create.keep")}
                  </Button>
                </>
              ) : (
                <Button variant="ghost" onClick={() => c.setDeleteId(entry.draftId)}>
                  {t("common.remove")}
                </Button>
              )}
            </Surface>
          ))
        }
      </StatePanel>
      {c.error !== null && <ErrorBlock error={c.error} />}
      <Button variant="ghost" onClick={() => c.setScreen("worlds")}>
        {t("create.backToTitle")}
      </Button>
    </>
  );
}

export function CreateGameScreen(): JSX.Element {
  const t = useT();
  const [readiness, setReadiness] = useState<Loadable<BuildReadiness>>(idle());
  useEffect(() => {
    let alive = true;
    setReadiness(loading());
    void buildReadiness().then((result) => {
      if (alive) setReadiness(fromResult(result));
    });
    return () => {
      alive = false;
    };
  }, []);
  const c = useCreateController();
  const { draft, busy } = c;
  const step = draft?.step ?? "idea";
  const story = draft === null ? null : storyPlan(draft);
  // A chapter the land cannot play (a fight without fighting, a kind the game has not got) stops
  // Build here, and again in buildWorld before anything is published.
  const kinds =
    draft?.story == null
      ? null
      : checkPlayKinds(draft.story.chapters, draft.idea.play.fights !== "none");
  const kindProblem = kinds !== null && !kinds.ok ? kinds.error.code : null;
  const writingStory = c.ahead.writing !== null;
  const chosen = draft?.look?.chosen ?? null;
  const lookUrl =
    chosen === null || c.looks.pictures.status !== "ready"
      ? null
      : (c.looks.pictures.value[chosen] ?? null);
  // A chosen picture that is not readable (yet) never builds as "no picture".
  const lookMissing = chosen !== null && lookUrl === null;
  const buildReady =
    draft !== null &&
    worldReady(draft) &&
    !storyStale(draft) &&
    story !== null &&
    !kindProblem &&
    !writingStory &&
    !lookMissing;
  return (
    <GameShell
      hints={[
        { keys: ["Esc"], label: t("common.back"), onPress: busy ? undefined : () => void c.back() },
      ]}
    >
      <div
        className="g-scroll"
        style={{
          height: "100%",
          overflowY: "auto",
          padding: `${space.xl}px 0`,
          boxSizing: "border-box",
        }}
      >
        <Surface
          variant="card"
          padding="xl"
          style={{
            width: draft === null ? "min(760px, 94%)" : "min(1100px, 94%)",
            margin: "0 auto",
            gap: space.md,
          }}
        >
          <Text variant="title" as="h1">
            {t("create.title")}
          </Text>
          {c.built !== null ? (
            <>
              <BuiltPanel built={c.built} onEnter={c.enter} />
              {c.error !== null && <ErrorBlock error={c.error} />}
            </>
          ) : draft === null ? (
            <DraftPicker c={c} />
          ) : (
            <>
              <div style={{ display: "flex", gap: space.md, flexWrap: "wrap" }}>
                {STEPS.map((one, index) => (
                  <Text
                    key={one}
                    variant="caption"
                    tone={index === STEPS.indexOf(step) ? "accent" : "dim"}
                  >{`${index + 1} · ${t(STEP_LABEL[one])}`}</Text>
                ))}
              </div>
              {step === "idea" && (
                <>
                  <IdeaStep
                    idea={draft.idea}
                    onChange={(idea) => c.update((one) => ({ ...one, idea }))}
                    busy={busy}
                  />
                  {draft.world !== null && <Text tone="muted">{t("create.ideaWritten")}</Text>}
                </>
              )}
              {step === "world" && draft.world !== null && (
                <>
                  {worldStale(draft) && (
                    <Surface variant="inset" padding="md" style={{ gap: space.sm }}>
                      <Text tone="danger">{t("create.worldStale")}</Text>
                      <div style={{ display: "flex", gap: space.sm }}>
                        <Button disabled={busy} onClick={() => void c.writeWorld()}>
                          {t("create.updateWorld")}
                        </Button>
                        <Button disabled={busy || !canKeepWorld(draft)} onClick={c.keepWorld}>
                          {t("create.keepWorld")}
                        </Button>
                      </div>
                    </Surface>
                  )}
                  <WorldStep
                    world={draft.world}
                    name={draft.idea.name}
                    busy={busy}
                    onRename={c.rename}
                    onEdit={c.cardEdit}
                    onLock={c.cardLock}
                    onRewrite={(part, note) => void c.cardRewrite(part, note)}
                    onRewriteUnlocked={(note) => void c.cardsRewrite(note)}
                  />
                  {bibleProblems(draft.world.fields).length > 0 && (
                    <Text tone="danger">{t("create.worldIncomplete")}</Text>
                  )}
                </>
              )}
              {step === "look" && draft.world !== null && (
                <>
                  <LookStep
                    look={draft.look}
                    looks={c.looks}
                    lookCard={draft.world.fields.look}
                    busy={busy}
                  />
                  <StoryAheadPanel ahead={c.ahead} story={storyStale(draft) ? null : draft.story} />
                  {c.ahead.error !== null && <ErrorBlock error={c.ahead.error} />}
                </>
              )}
              {step === "story" && (
                <>
                  <StoryAheadPanel ahead={c.ahead} />
                  {draft.story === null && !writingStory && (
                    <>
                      {c.ahead.error !== null && <ErrorBlock error={c.ahead.error} />}
                      <Button disabled={busy || !worldReady(draft)} onClick={() => c.ahead.start()}>
                        {t("create.writeStory")}
                      </Button>
                    </>
                  )}
                  {draft.story !== null && storyStale(draft) && !writingStory && (
                    <Surface variant="inset" padding="md" style={{ gap: space.sm }}>
                      <Text tone="danger">{t("create.storyStale")}</Text>
                      {c.ahead.error !== null && <ErrorBlock error={c.ahead.error} />}
                      <div style={{ display: "flex", gap: space.sm }}>
                        <Button
                          disabled={busy || !worldReady(draft)}
                          onClick={() => c.ahead.start()}
                        >
                          {t("create.updateStory")}
                        </Button>
                        <Button
                          disabled={busy || !worldReady(draft) || !canKeepStory(draft)}
                          onClick={c.keepStory}
                        >
                          {t("create.keepStory")}
                        </Button>
                      </div>
                    </Surface>
                  )}
                  {draft.story !== null && (
                    <StoryStep
                      story={draft.story}
                      combat={draft.idea.play.fights !== "none"}
                      busy={busy || writingStory}
                      onLogline={c.story.editLogline}
                      onEdit={c.story.editChapter}
                      onRewrite={(index, note) => void c.story.rewriteOne(index, note)}
                      onInsert={(index) => void c.story.insert(index)}
                      onRemove={c.story.removeChapter}
                      onMove={c.story.moveChapter}
                      onRevise={(note) => void c.story.revise(note)}
                    />
                  )}
                  {draft.story !== null && story === null && (
                    <Text tone="danger">{t("create.storyIncomplete")}</Text>
                  )}
                  {kindProblem !== null && (
                    <Text tone="danger">
                      {t(
                        kindProblem === "story-kind-fight"
                          ? "create.noFight"
                          : "create.kindUnknown",
                      )}
                    </Text>
                  )}
                </>
              )}
              {step === "build" && (
                <BuildStep
                  draft={draft}
                  readiness={readiness}
                  lookUrl={lookUrl}
                  lookMissing={lookMissing}
                />
              )}
              {c.offline !== null && <ErrorBlock error={c.offline} />}
              {readiness.status === "ready" && readiness.value.reachable && (
                <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
                  <Text variant="caption" tone="success">
                    {t("create.modelReadiness", {
                      provider: readiness.value.kind,
                      model: readiness.value.model,
                      ms: readiness.value.latencyMs,
                    })}
                  </Text>
                  <Text variant="caption" tone="dim">
                    {t(
                      readiness.value.route === "apple-bridge"
                        ? "create.modelRouteBridge"
                        : "create.modelRouteChat",
                    )}
                  </Text>
                  {readiness.value.context !== null && (
                    <Text variant="caption" tone="dim">
                      {t("create.modelContext", {
                        n: readiness.value.context.tokens,
                        source: readiness.value.context.source,
                      })}
                    </Text>
                  )}
                </div>
              )}
              {step !== "build" && (
                <UsageLine scope={{ kind: "create", id: draft.draftId }} draft />
              )}
              {c.error !== null && <ErrorBlock error={c.error} />}
              {c.saving && (
                <Text variant="caption" tone="dim">
                  {t("create.saving")}
                </Text>
              )}
              {c.stage !== null && (
                <Surface variant="inset" padding="md" style={{ gap: space.xs }}>
                  <Text tone="accent">
                    {t(STAGE_LABEL[c.stage], c.stageArg)} · {t("create.elapsed", { s: c.elapsed })}
                  </Text>
                  {c.progress && <StreamPreview stage={c.stage} text={c.progress} />}
                </Surface>
              )}
              <StepActions c={c} buildReady={buildReady} />
              {c.offline !== null && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    c.refreshProbe();
                    setReadiness(loading());
                    void buildReadiness().then((result) => setReadiness(fromResult(result)));
                  }}
                >
                  {t("create.checkModel")}
                </Button>
              )}
            </>
          )}
        </Surface>
      </div>
    </GameShell>
  );
}

/** The step's buttons: forward, Back, or Cancel while a call runs. */
function StepActions({
  c,
  buildReady,
}: {
  c: CreateController;
  buildReady: boolean;
}): JSX.Element | null {
  const t = useT();
  const draft = c.draft;
  if (draft === null) return null;
  const step = draft.step;
  const words = draft.idea.intent.trim() !== "";
  return (
    <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
      {c.busy ? (
        <Button variant="destructive" onClick={() => c.controller.current?.abort()}>
          {t("common.cancel")}
        </Button>
      ) : (
        <>
          {step === "idea" && (
            <>
              <Button
                variant="primary"
                disabled={!words}
                onClick={() =>
                  draft.world === null
                    ? void c.writeWorld()
                    : c.update((one) => ({ ...one, step: "world" }))
                }
              >
                {draft.world === null ? t("create.writeWorld") : t("create.toWorld")}
              </Button>
              {!words && <Text tone="danger">{t("create.needsWords")}</Text>}
            </>
          )}
          {step === "world" && (
            <Button variant="primary" disabled={!worldReady(draft)} onClick={c.toLook}>
              {t("create.toLook")}
            </Button>
          )}
          {step === "look" && (
            <Button variant="primary" disabled={!worldReady(draft)} onClick={c.toStory}>
              {draft.look?.chosen != null
                ? t("create.toStory")
                : c.looks.drawing > 0
                  ? t("create.lookContinueDrawing")
                  : t("create.lookSkip")}
            </Button>
          )}
          {step === "story" && (
            <Button
              variant="primary"
              disabled={!buildReady}
              onClick={() => c.update((one) => ({ ...one, step: "build" }))}
            >
              {t("create.toBuild")}
            </Button>
          )}
          {step === "build" && (
            <Button
              variant="primary"
              disabled={!buildReady || c.saving}
              onClick={() => void c.build()}
            >
              {t("create.buildAndPlay")}
            </Button>
          )}
          <Button variant="ghost" onClick={() => void c.back()}>
            {step === "idea" ? t("create.backToTitle") : t("common.back")}
          </Button>
        </>
      )}
    </div>
  );
}
