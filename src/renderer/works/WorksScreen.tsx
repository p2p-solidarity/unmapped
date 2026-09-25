// "AI Worlds": one sentence → a playable world, drafts being changed, published worlds, and
// journeys that rotate through several of them (e.g. RPG → ARPG → maze → platformer) carrying a
// small shared object between worlds. Everything shown comes from main; nothing is sampled.

import { useSessionStore } from "@renderer/state";
import { Button, colors, StatePanel, Surface, space, Text, TextField } from "@renderer/ui";
import type { LedgerConfig, LedgerRevision } from "@shared/chain";
import { fromResult, type Loadable, loading } from "@shared/result";
import type { WorkDraft, WorkManifest, WorkPlay, WorkRef } from "@shared/works";
import { type JSX, useCallback, useEffect, useState } from "react";
import { PlayerView } from "./PlayerView";
import { WorkshopView } from "./WorkshopView";

interface Library {
  drafts: WorkDraft[];
  works: WorkManifest[];
  plays: WorkPlay[];
}

/** Optional on-chain provenance: what the ledger says about each saved world, when configured. */
function useProvenance(works: WorkManifest[]): {
  config: LedgerConfig | null;
  known: Record<string, LedgerRevision | null>;
  note: string | null;
  register: (work: WorkManifest) => Promise<void>;
  /** Content hash awaiting a confirming second click. */
  asked: string | null;
} {
  const [config, setConfig] = useState<LedgerConfig | null>(null);
  const [known, setKnown] = useState<Record<string, LedgerRevision | null>>({});
  const [note, setNote] = useState<string | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const hashes = works.map((work) => work.contentHash).join(",");

  useEffect(() => {
    void window.seed.chain.config().then(setConfig);
  }, []);

  useEffect(() => {
    if (config?.readable !== true || hashes === "") return;
    let live = true;
    void Promise.all(
      hashes.split(",").map(async (hash) => [hash, await window.seed.chain.lookup(hash)] as const),
    ).then((rows) => {
      if (!live) return;
      const next: Record<string, LedgerRevision | null> = {};
      for (const [hash, result] of rows) if (result.ok) next[hash] = result.value;
      setKnown(next);
    });
    return () => {
      live = false;
    };
  }, [config?.readable, hashes]);

  const register = async (work: WorkManifest): Promise<void> => {
    // Sending this costs gas, so the first click only asks.
    if (asked !== work.contentHash) {
      setAsked(work.contentHash);
      setNote(
        `Registering "${work.title}" sends a transaction and spends gas. Click again to confirm.`,
      );
      return;
    }
    setAsked(null);
    setNote(`Registering ${work.title}…`);
    const result = await window.seed.chain.publish({
      contentHash: work.contentHash,
      parent: work.lineage.parent?.contentHash ?? null,
      kind: "world",
      uri: "",
    });
    if (!result.ok) {
      setNote(`${result.error.code}: ${result.error.message}`);
      return;
    }
    setNote(`Registered · ${result.value.txHash}`);
    const fresh = await window.seed.chain.lookup(work.contentHash);
    if (fresh.ok) setKnown((current) => ({ ...current, [work.contentHash]: fresh.value }));
  };

  return { config, known, note, register, asked };
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
  const setScreen = useSessionStore((state) => state.setScreen);
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
      setProblem(draft.error.message);
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
      setProblem(play.error.message);
      return;
    }
    setJourney([]);
    setView({ kind: "player", playId: play.value.playId });
  };

  return (
    <div style={{ height: "100%", overflow: "auto", padding: space.xl, background: colors.bg }}>
      <div style={{ display: "flex", alignItems: "center", gap: space.md, marginBottom: space.lg }}>
        <Button variant="ghost" onClick={() => setScreen("worlds")}>
          ← Title
        </Button>
        <Text variant="titleLarge">AI Worlds</Text>
        <Text tone="muted">
          Describe a world in one sentence, play it, change it with another sentence.
        </Text>
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
              label="New world"
              value={request}
              maxLength={2000}
              placeholder="e.g. A tiny maze where a ninja collects three keys before the exit opens"
              onChange={(event) => setRequest(event.target.value)}
            />
          </div>
          <Button variant="primary" type="submit" disabled={request.trim() === ""}>
            Generate
          </Button>
        </form>
        {problem === null ? null : <Text tone="danger">{problem}</Text>}
      </Surface>

      <StatePanel state={library} loadingText="Reading your worlds…">
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
              <Text variant="title">Drafts</Text>
              {value.drafts.length === 0 ? <Text tone="dim">No drafts yet.</Text> : null}
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
                        {head === undefined ? "not playable yet" : `playable ${head.id}`} ·{" "}
                        {draft.candidates.length} attempts · {draft.published.length} saved
                      </Text>
                    </span>
                  </Button>
                );
              })}
            </Surface>

            <Surface padding="md">
              <Text variant="title">Saved worlds</Text>
              {value.works.length === 0 ? (
                <Text tone="dim">Save a draft version to see it here.</Text>
              ) : null}
              {value.works.map((work) => {
                const picked = journey.some((entry) => entry.contentHash === work.contentHash);
                return (
                  <Surface key={work.contentHash} variant="inset" padding="sm">
                    <Text>
                      {work.title} <Text tone="muted">v{work.version}</Text>
                    </Text>
                    <Text variant="caption" tone="muted">
                      {work.description || "No summary."}
                    </Text>
                    {provenance.config?.readable !== true ? null : (
                      <Text
                        variant="caption"
                        tone={provenance.known[work.contentHash] ? "success" : "dim"}
                      >
                        {provenance.known[work.contentHash]
                          ? `on chain · ${provenance.known[work.contentHash]?.author.slice(0, 10)}…`
                          : "not on chain"}
                      </Text>
                    )}
                    <div style={{ display: "flex", gap: space.sm }}>
                      <Button onClick={() => void startPlay([work])}>Play</Button>
                      {provenance.config?.writable === true &&
                      !provenance.known[work.contentHash] ? (
                        <Button
                          variant="chip"
                          active={provenance.asked === work.contentHash}
                          onClick={() => void provenance.register(work)}
                        >
                          {provenance.asked === work.contentHash
                            ? "Confirm · spends gas"
                            : "Register on chain"}
                        </Button>
                      ) : null}
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
                          ? `Journey #${journey.findIndex((entry) => entry.contentHash === work.contentHash) + 1}`
                          : "+ Journey"}
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
                  Start journey ({journey.length} worlds)
                </Button>
              ) : null}
            </Surface>

            <Surface padding="md">
              <Text variant="title">Journeys</Text>
              {value.plays.length === 0 ? <Text tone="dim">Nothing played yet.</Text> : null}
              {value.plays.map((play) => (
                <Button
                  key={play.playId}
                  variant="tile"
                  onClick={() => setView({ kind: "player", playId: play.playId })}
                >
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <Text>{play.title}</Text>
                    <Text variant="caption" tone="muted">
                      world {play.current + 1}/{play.worlds.length} · {play.completions.length}{" "}
                      cleared · {new Date(play.updatedAt).toLocaleString()}
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
