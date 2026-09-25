// The four Create steps and the draft picker. State and model calls live in useCreateController.
import { formatDateTime, useT } from "@renderer/i18n";
import { playRules } from "@renderer/narrative/openLandCartridge";
import { type BuildReadiness, buildReadiness } from "@renderer/narrative/originScene";
import { Button, ErrorBlock, StatePanel, Surface, space, Text } from "@renderer/ui";
import { bibleProblems } from "@shared/bible";
import { fromResult, idle, type Loadable, loading } from "@shared/result";
import { checkPlayKinds } from "@shared/storyEdits";
import { type JSX, useEffect, useState } from "react";
import { GameShell } from "../shell/GameShell";
import {
  canKeepStory,
  canKeepWorld,
  storyBasis,
  storyPlan,
  storyStale,
  worldBasis,
  worldReady,
  worldStale,
} from "./draftState";
import { IdeaStep } from "./IdeaStep";
import { StoryStep } from "./StoryStep";
import { STAGE_LABEL, STEP_LABEL, STEPS, useCreateController } from "./useCreateController";
import { WorldStep } from "./WorldStep";

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
  const {
    entries,
    draft,
    saving,
    error,
    deleteId,
    setDeleteId,
    stage,
    stageArg,
    progress,
    elapsed,
    controller,
    offline,
    busy,
    refreshProbe,
    setScreen,
    start,
    open,
    remove,
    back,
    update,
    writeWorld,
    cardEdit,
    cardRewrite,
    writeTheStory,
    editChapter,
    rewriteOne,
    insert,
    revise,
    build,
  } = useCreateController();
  const step = draft?.step ?? "idea";
  const story = draft === null ? null : storyPlan(draft);
  // A chapter the land cannot play (a fight without fighting, a kind the game has not got) stops
  // Build here, and again in buildWorld before anything is published.
  const kinds =
    draft?.story == null
      ? null
      : checkPlayKinds(draft.story.chapters, draft.idea.play.fights !== "none");
  const kindProblem = kinds !== null && !kinds.ok ? kinds.error.code : null;
  const buildReady =
    draft !== null && worldReady(draft) && !storyStale(draft) && story !== null && !kindProblem;
  const rules = draft === null ? null : playRules(draft.idea.play);
  return (
    <GameShell
      hints={[
        { keys: ["Esc"], label: t("common.back"), onPress: busy ? undefined : () => void back() },
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
          {draft === null ? (
            <>
              <Text variant="label">{t("create.draftsTitle")}</Text>
              <Text tone="muted">{t("create.draftsNote")}</Text>
              <Button variant="primary" onClick={() => void start()}>
                {t("create.startNew")}
              </Button>
              <StatePanel state={entries} loadingText={t("create.draftsLoading")}>
                {(items) =>
                  items.map((entry) => (
                    <Surface
                      key={entry.draftId}
                      variant="inset"
                      padding="md"
                      style={{ gap: space.sm }}
                    >
                      {entry.broken ? (
                        <Text tone="danger">
                          {t("create.draftBroken", { problem: entry.problem })}
                        </Text>
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
                          <Button onClick={() => void open(entry.draftId)}>
                            {t("create.continueDraft")}
                          </Button>
                        </>
                      )}
                      {deleteId === entry.draftId ? (
                        <>
                          <Text tone="danger">
                            {t("create.confirmDeleteDraft", {
                              name: entry.broken
                                ? t("create.untitled")
                                : entry.name || t("create.untitled"),
                            })}
                          </Text>
                          <Button variant="destructive" onClick={() => void remove(entry.draftId)}>
                            {t("common.remove")}
                          </Button>
                          <Button variant="ghost" onClick={() => setDeleteId(null)}>
                            {t("create.keep")}
                          </Button>
                        </>
                      ) : (
                        <Button variant="ghost" onClick={() => setDeleteId(entry.draftId)}>
                          {t("common.remove")}
                        </Button>
                      )}
                    </Surface>
                  ))
                }
              </StatePanel>
              {error !== null && <ErrorBlock error={error} />}
              <Button variant="ghost" onClick={() => setScreen("worlds")}>
                {t("create.backToTitle")}
              </Button>
            </>
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
                    onChange={(idea) => update((one) => ({ ...one, idea }))}
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
                        <Button disabled={busy} onClick={() => void writeWorld()}>
                          {t("create.updateWorld")}
                        </Button>
                        <Button
                          disabled={busy || !canKeepWorld(draft)}
                          onClick={() =>
                            update((one) =>
                              one.world === null
                                ? one
                                : {
                                    ...one,
                                    world: {
                                      ...one.world,
                                      basis: worldBasis(one.idea),
                                      rev: one.world.rev + 1,
                                    },
                                  },
                            )
                          }
                        >
                          {t("create.keepWorld")}
                        </Button>
                      </div>
                    </Surface>
                  )}
                  <WorldStep
                    world={draft.world}
                    busy={busy}
                    onEdit={cardEdit}
                    onRewrite={(part, note) => void cardRewrite(part, note)}
                  />
                  {bibleProblems(draft.world.fields).length > 0 && (
                    <Text tone="danger">{t("create.worldIncomplete")}</Text>
                  )}
                </>
              )}
              {step === "story" && draft.story !== null && (
                <>
                  {storyStale(draft) && (
                    <Surface variant="inset" padding="md" style={{ gap: space.sm }}>
                      <Text tone="danger">{t("create.storyStale")}</Text>
                      <div style={{ display: "flex", gap: space.sm }}>
                        <Button
                          disabled={busy || !worldReady(draft)}
                          onClick={() => void writeTheStory()}
                        >
                          {t("create.updateStory")}
                        </Button>
                        <Button
                          disabled={busy || !worldReady(draft) || !canKeepStory(draft)}
                          onClick={() =>
                            update((one) =>
                              one.story === null
                                ? one
                                : storyBasis(one) === null
                                  ? one
                                  : {
                                      ...one,
                                      story: {
                                        ...one.story,
                                        basis: storyBasis(one) ?? one.story.basis,
                                      },
                                    },
                            )
                          }
                        >
                          {t("create.keepStory")}
                        </Button>
                      </div>
                    </Surface>
                  )}
                  <StoryStep
                    story={draft.story}
                    combat={draft.idea.play.fights !== "none"}
                    busy={busy}
                    onLogline={(value) =>
                      update((one) =>
                        one.story === null
                          ? one
                          : {
                              ...one,
                              story: { ...one.story, logline: value, loglineEdited: true },
                            },
                      )
                    }
                    onEdit={editChapter}
                    onRewrite={(index, note) => void rewriteOne(index, note)}
                    onInsert={(index) => void insert(index)}
                    onRemove={(index) =>
                      update((one) =>
                        one.story === null
                          ? one
                          : {
                              ...one,
                              story: {
                                ...one.story,
                                chapters: one.story.chapters.filter((_, at) => at !== index),
                              },
                            },
                      )
                    }
                    onMove={(index, delta) =>
                      update((one) => {
                        if (one.story === null) return one;
                        const chapters = [...one.story.chapters];
                        const [item] = chapters.splice(index, 1);
                        if (item) chapters.splice(index + delta, 0, item);
                        return { ...one, story: { ...one.story, chapters } };
                      })
                    }
                    onRevise={(note) => void revise(note)}
                  />
                  {story === null && <Text tone="danger">{t("create.storyIncomplete")}</Text>}
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
                <>
                  <Text variant="title" as="h2">
                    {draft.idea.name}
                  </Text>
                  <Text>{t("create.buildWhat")}</Text>
                  <Text variant="caption">
                    {t("create.buildLanguage")}: {draft.idea.language}
                  </Text>
                  <Text variant="caption">
                    {t("create.buildChapters", { n: draft.story?.chapters.length ?? 0 })}
                  </Text>
                  {rules?.ok && (
                    <Text variant="caption">
                      {t("create.rules")}:{" "}
                      {draft.idea.play.fights === "none"
                        ? t("create.rulesPeaceful")
                        : t("create.rulesFighting", {
                            weapon:
                              draft.idea.play.weapon.trim() ||
                              t(
                                draft.idea.play.fights === "gun"
                                  ? "create.defaultGun"
                                  : "create.defaultBlade",
                              ),
                            hp: rules.value.combat?.playerHp ?? 0,
                            damage: rules.value.weapons[0]?.damage ?? 0,
                            range: rules.value.weapons[0]?.range ?? 0,
                            base: rules.value.combat?.monsterHpBase ?? 0,
                            per: rules.value.combat?.monsterHpPerLevel ?? 0,
                          })}
                    </Text>
                  )}
                </>
              )}
              {offline !== null && <ErrorBlock error={offline} />}
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
              {error !== null && <ErrorBlock error={error} />}
              {saving && (
                <Text variant="caption" tone="dim">
                  {t("create.saving")}
                </Text>
              )}
              {stage !== null && (
                <Surface variant="inset" padding="md" style={{ gap: space.xs }}>
                  <Text tone="accent">
                    {t(STAGE_LABEL[stage], stageArg)} · {t("create.elapsed", { s: elapsed })}
                  </Text>
                  {progress && (
                    <Text
                      variant="caption"
                      tone="dim"
                      style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                    >
                      {progress}
                    </Text>
                  )}
                </Surface>
              )}
              <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
                {busy ? (
                  <Button variant="destructive" onClick={() => controller.current?.abort()}>
                    {t("common.cancel")}
                  </Button>
                ) : (
                  <>
                    {step === "idea" && (
                      <>
                        <Button
                          variant="primary"
                          disabled={
                            draft.idea.name.trim() === "" || draft.idea.intent.trim() === ""
                          }
                          onClick={() =>
                            draft.world === null
                              ? void writeWorld()
                              : update((one) => ({ ...one, step: "world" }))
                          }
                        >
                          {draft.world === null ? t("create.writeWorld") : t("create.toWorld")}
                        </Button>
                        {(draft.idea.name.trim() === "" || draft.idea.intent.trim() === "") && (
                          <Text tone="danger">{t("create.needsName")}</Text>
                        )}
                      </>
                    )}
                    {step === "world" && (
                      <Button
                        variant="primary"
                        disabled={!worldReady(draft)}
                        onClick={() =>
                          draft.story === null
                            ? void writeTheStory()
                            : update((one) => ({ ...one, step: "story" }))
                        }
                      >
                        {t("create.toStory")}
                      </Button>
                    )}
                    {step === "story" && (
                      <Button
                        variant="primary"
                        disabled={!buildReady}
                        onClick={() => update((one) => ({ ...one, step: "build" }))}
                      >
                        {t("create.toBuild")}
                      </Button>
                    )}
                    {step === "build" && (
                      <Button
                        variant="primary"
                        disabled={!buildReady || saving}
                        onClick={() => void build()}
                      >
                        {t("create.buildAndPlay")}
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => void back()}>
                      {step === "idea" ? t("create.backToTitle") : t("common.back")}
                    </Button>
                  </>
                )}
              </div>
              {offline !== null && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    refreshProbe();
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
