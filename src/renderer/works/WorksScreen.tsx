// "AI Worlds": one sentence → a playable world, drafts being changed, published worlds, and
// journeys that rotate through several of them (e.g. RPG → ARPG → maze → platformer) carrying a
// small shared object between worlds. Everything shown comes from main; nothing is sampled.

import { errorLine, formatDateTime, useT } from "@renderer/i18n";
import { useSessionStore } from "@renderer/state";
import { useInferenceStore } from "@renderer/state/inferenceStore";
import { Button, colors, StatePanel, Surface, space, Text, TextField } from "@renderer/ui";
import { fromResult, type Loadable, loading } from "@shared/result";
import { WORK_GENERATE_TOKENS } from "@shared/workPrompt";
import type { WorkDraft, WorkManifest, WorkPlay, WorkRef } from "@shared/works";
import { type JSX, useCallback, useEffect, useState } from "react";
import { PlayerView } from "./PlayerView";
import { LedgerNotice, ProvenanceLine, RegisterButton, useProvenance } from "./provenance";
import { WorkshopView } from "./WorkshopView";

interface Library {
  drafts: WorkDraft[];
  works: WorkManifest[];
  plays: WorkPlay[];
}

type View =
  | { kind: "library" }
  | { kind: "workshop"; draftId: string; initialRequest: string | null }
  | { kind: "player"; playId: string };

async function loadLibrary(): Promise<Loadable<Library>> {
  const [drafts, works, plays] = await Promise.all([
    window.seed.works.drafts(),
    window.seed.works.list(),
    window.seed.works.plays(),
  ]);
  if (!drafts.ok) return fromResult(drafts);
  if (!works.ok) return fromResult(works);
  if (!plays.ok) return fromResult(plays);
  return fromResult({
    ok: true,
    value: { drafts: drafts.value, works: works.value, plays: plays.value },
  });
}

/** A short name from the request's first clause: "一個迷宮：…" → "一個迷宮". */
export function titleOf(request: string): string {
  const clause = request.trim().split(/[：:，,。.！!？?\n]/)[0] ?? "";
  return (clause.trim() || request.trim()).slice(0, 40);
}

function refOf(manifest: WorkManifest): WorkRef {
  return { workId: manifest.workId, version: manifest.version, contentHash: manifest.contentHash };
}

export function WorksScreen(): JSX.Element {
  const t = useT();
  const setScreen = useSessionStore((state) => state.setScreen);
  const modelProbe = useInferenceStore((state) => state.probe);
  const [ledgerWorks, setLedgerWorks] = useState<WorkManifest[]>([]);
  const provenance = useProvenance(ledgerWorks);
  const [view, setView] = useState<View>({ kind: "library" });
  const [library, setLibrary] = useState<Loadable<Library>>(loading());
  const [request, setRequest] = useState("");
  const [journey, setJourney] = useState<WorkManifest[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void loadLibrary().then((next) => {
      setLibrary(next);
      setLedgerWorks(next.status === "ready" ? next.value.works : []);
    });
  }, []);
  useEffect(refresh, [refresh]);

  const back = (): void => {
    setView({ kind: "library" });
    refresh();
  };

  if (view.kind === "workshop") {
    return (
      <WorkshopView draftId={view.draftId} initialRequest={view.initialRequest} onExit={back} />
    );
  }
  if (view.kind === "player") return <PlayerView playId={view.playId} onExit={back} />;

  const create = async (): Promise<void> => {
    const words = request.trim();
    if (words === "") return;
    const draft = await window.seed.works.createDraft(titleOf(words));
    if (!draft.ok) {
      setProblem(errorLine(draft.error));
      return;
    }
    setRequest("");
    setView({ kind: "workshop", draftId: draft.value.draftId, initialRequest: words });
  };

  const startPlay = async (worlds: WorkManifest[]): Promise<void> => {
    const title = worlds
      .map((world) => world.title.slice(0, 32))
      .join(" → ")
      .slice(0, 200);
    const play = await window.seed.works.createPlay({ title, worlds: worlds.map(refOf) });
    if (!play.ok) {
      setProblem(errorLine(play.error));
      return;
    }
    setJourney([]);
    setView({ kind: "player", playId: play.value.playId });
  };

  return (
    <div style={{ height: "100%", overflow: "auto", padding: space.xl, background: colors.bg }}>
      <div style={{ display: "flex", alignItems: "center", gap: space.md, marginBottom: space.lg }}>
        <Button variant="ghost" onClick={() => setScreen("worlds")}>
          {t("works.backToTitle")}
        </Button>
        <Text variant="titleLarge">{t("works.heading")}</Text>
        <Text tone="muted">{t("works.tagline")}</Text>
      </div>

      <Surface padding="lg" style={{ marginBottom: space.lg }}>
        <form
          style={{ display: "flex", gap: space.md, alignItems: "flex-end" }}
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <div style={{ flex: 1 }}>
            <TextField
              label={t("works.newWorld")}
              value={request}
              maxLength={2000}
              placeholder={t("works.newWorldPlaceholder")}
              onChange={(event) => setRequest(event.target.value)}
            />
          </div>
          <Button variant="primary" type="submit" disabled={request.trim() === ""}>
            {t("works.generate")}
          </Button>
        </form>
        {modelProbe.status === "ready" &&
        modelProbe.value.context !== null &&
        modelProbe.value.context.tokens < WORK_GENERATE_TOKENS ? (
          <Text tone="danger">
            {t("works.localContextWarning", { n: modelProbe.value.context.tokens })}
          </Text>
        ) : null}
        {problem === null ? null : <Text tone="danger">{problem}</Text>}
      </Surface>

      <StatePanel state={library} loadingText={t("works.readingWorlds")}>
        {(value) => (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: space.lg,
              alignItems: "start",
            }}
          >
            <Surface padding="md">
              <Text variant="title">{t("works.drafts")}</Text>
              {value.drafts.length === 0 ? <Text tone="dim">{t("works.noDrafts")}</Text> : null}
              {value.drafts.map((draft) => {
                const head = draft.candidates.find((candidate) => candidate.id === draft.head);
                return (
                  <Button
                    key={draft.draftId}
                    variant="tile"
                    onClick={() =>
                      setView({ kind: "workshop", draftId: draft.draftId, initialRequest: null })
                    }
                  >
                    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <Text>{draft.title}</Text>
                      <Text variant="caption" tone="muted">
                        {head === undefined
                          ? t("works.draftNotPlayable")
                          : t("works.draftPlayable", { id: head.id })}{" "}
                        ·{" "}
                        {t("works.draftCounts", {
                          attempts: draft.candidates.length,
                          saved: draft.published.length,
                        })}
                      </Text>
                    </span>
                  </Button>
                );
              })}
            </Surface>

            <Surface padding="md">
              <Text variant="title">{t("works.savedWorlds")}</Text>
              <LedgerNotice config={provenance.config} />
              {value.works.length === 0 ? <Text tone="dim">{t("works.noSavedWorlds")}</Text> : null}
              {value.works.map((work) => {
                const picked = journey.some((entry) => entry.contentHash === work.contentHash);
                return (
                  <Surface key={work.contentHash} variant="inset" padding="sm">
                    <Text>
                      {work.title} <Text tone="muted">v{work.version}</Text>
                    </Text>
                    <Text variant="caption" tone="muted">
                      {work.description || t("works.noSummary")}
                    </Text>
                    <ProvenanceLine provenance={provenance} work={work} />
                    <div style={{ display: "flex", gap: space.sm }}>
                      <Button onClick={() => void startPlay([work])}>{t("common.play")}</Button>
                      <RegisterButton provenance={provenance} work={work} />
                      <Button
                        variant="chip"
                        active={picked}
                        onClick={() =>
                          setJourney((current) =>
                            picked
                              ? current.filter((entry) => entry.contentHash !== work.contentHash)
                              : [...current, work],
                          )
                        }
                      >
                        {picked
                          ? t("works.journeyPick", {
                              n:
                                journey.findIndex(
                                  (entry) => entry.contentHash === work.contentHash,
                                ) + 1,
                            })
                          : t("works.addToJourney")}
                      </Button>
                    </div>
                  </Surface>
                );
              })}
              {provenance.note === null ? null : (
                <Text variant="caption" tone="muted">
                  {provenance.note}
                </Text>
              )}
              {journey.length > 1 ? (
                <Button variant="primary" onClick={() => void startPlay(journey)}>
                  {t("works.startJourney", { n: journey.length })}
                </Button>
              ) : null}
            </Surface>

            <Surface padding="md">
              <Text variant="title">{t("works.journeys")}</Text>
              {value.plays.length === 0 ? <Text tone="dim">{t("works.nothingPlayed")}</Text> : null}
              {value.plays.map((play) => (
                <Button
                  key={play.playId}
                  variant="tile"
                  onClick={() => setView({ kind: "player", playId: play.playId })}
                >
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <Text>{play.title}</Text>
                    <Text variant="caption" tone="muted">
                      {t("works.journeyLine", {
                        current: play.current + 1,
                        total: play.worlds.length,
                        cleared: play.completions.length,
                        when: formatDateTime(play.updatedAt),
                      })}
                    </Text>
                  </span>
                </Button>
              ))}
            </Surface>
          </div>
        )}
      </StatePanel>
    </div>
  );
}
