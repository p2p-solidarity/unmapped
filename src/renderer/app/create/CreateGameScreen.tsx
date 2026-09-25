// Create a game: 1 · the world and how it is played → 2 · the plan the model proposes (bible and
// chapters, editable, with the gates on a map) → build and play. Only building publishes; going
// back or asking again costs nothing but the model call. Without a model it says why and offers
// nothing prebuilt (Rule 2).

import {
  buildWorld,
  type NewWorldStage,
  planWorld,
  type WorldPlan,
} from "@renderer/narrative/newWorld";
import { PEACEFUL } from "@renderer/narrative/openLandCartridge";
import { generationEventLabel } from "@renderer/narrative/sceneGeneration";
import { useInferenceStore, useSessionStore } from "@renderer/state";
import { Button, ErrorBlock, Surface, space, Text } from "@renderer/ui";
import type { AppError } from "@shared/result";
import { storyPlanSchema } from "@shared/story";
import { type JSX, useEffect, useRef, useState } from "react";
import { useRefreshProbe } from "../inferenceSync";
import { GameShell } from "../shell/GameShell";
import { openInstance } from "../useInstanceLoader";
import { type Idea, IdeaStep } from "./IdeaStep";
import { PlanStep } from "./PlanStep";

const STAGES: Record<NewWorldStage, string> = {
  bible: "Writing the world bible…",
  story: "Turning your story into chapters on the map…",
  origin: "Writing the place you wake in…",
  publish: "Publishing the world…",
};

const STEPS = ["The world", "The plan", "Play"] as const;

/** Why the chapters as edited cannot be published yet, in words; null when they can. */
function storyProblem(plan: WorldPlan): string | null {
  if (plan.story === null) return null;
  const checked = storyPlanSchema.safeParse(plan.story);
  if (checked.success) return null;
  const issue = checked.error.issues[0];
  const index = typeof issue?.path[1] === "number" ? issue.path[1] + 1 : null;
  const field = issue?.path[2];
  return index === null
    ? "The chapters are incomplete."
    : `Chapter ${index} needs its ${field === "brief" ? "“what happens”" : String(field ?? "text")}.`;
}

export function CreateGameScreen(): JSX.Element {
  const setScreen = useSessionStore((state) => state.setScreen);
  const probe = useInferenceStore((state) => state.probe);
  const refreshProbe = useRefreshProbe();
  const [idea, setIdea] = useState<Idea>({
    name: "",
    intent: "",
    story: "",
    language: navigator.language,
    play: PEACEFUL,
  });
  const [plan, setPlan] = useState<WorldPlan | null>(null);
  const [step, setStep] = useState<0 | 1>(0);
  const [stage, setStage] = useState<NewWorldStage | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const controller = useRef<AbortController | null>(null);

  // The probe on screen may be from app start; look again the moment the player wants a world.
  useEffect(() => {
    refreshProbe();
  }, [refreshProbe]);

  const offline: AppError | null =
    probe.status === "error" || (probe.status === "ready" && !probe.value.reachable)
      ? {
          code: "new-world-no-model",
          message:
            "A new world is written by the model, and the model did not answer the last check.",
          hint: "Start a model or configure a provider in System → Inference. You can still try: a real failure says what went wrong.",
        }
      : null;
  const busy = stage !== null;
  const ideaReady = idea.name.trim() !== "" && idea.intent.trim() !== "";
  const problem = plan === null ? null : storyProblem(plan);

  const run = async <T,>(work: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    setError(null);
    const signal = new AbortController();
    controller.current = signal;
    const result = await work(signal.signal);
    controller.current = null;
    setStage(null);
    setProgress(null);
    return result;
  };

  const makePlan = async (): Promise<void> => {
    const planned = await run((signal) => planWorld(idea, setStage, signal));
    if (planned.ok) {
      setPlan(planned.value);
      setStep(1);
    } else if (planned.error.code !== "request-aborted") setError(planned.error);
  };

  const build = async (): Promise<void> => {
    if (plan === null) return;
    const built = await run((signal) =>
      buildWorld(idea, plan, setStage, (event) => setProgress(generationEventLabel(event)), signal),
    );
    if (built.ok) void openInstance(built.value.instanceId);
    else if (built.error.code !== "request-aborted") setError(built.error);
  };

  const back = (): void => {
    if (busy) return;
    if (step === 1) setStep(0);
    else setScreen("worlds");
  };

  return (
    <GameShell hints={[{ keys: ["Esc"], label: "Back", onPress: busy ? undefined : back }]}>
      <div
        className="g-scroll"
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          height: "100%",
          padding: `${space.xl}px 0`,
          boxSizing: "border-box",
        }}
      >
        <Surface
          variant="card"
          padding="xl"
          style={{ width: step === 0 ? "min(620px, 94%)" : "min(980px, 94%)", gap: space.md }}
        >
          <div style={{ display: "flex", gap: space.lg, alignItems: "baseline", flexWrap: "wrap" }}>
            <Text variant="title" as="h1">
              Create a game
            </Text>
            {STEPS.map((label, index) => (
              <Text key={label} variant="caption" tone={index === step ? "accent" : "dim"}>
                {`${index + 1} · ${label}`}
              </Text>
            ))}
          </div>
          {step === 0 ? (
            <IdeaStep idea={idea} onChange={setIdea} busy={busy} />
          ) : plan === null ? null : (
            <PlanStep
              name={idea.name}
              plan={plan}
              play={idea.play}
              busy={busy}
              onStory={(story) => setPlan({ ...plan, story })}
            />
          )}
          {offline === null ? null : <ErrorBlock error={offline} />}
          {error === null ? null : <ErrorBlock error={error} />}
          {step === 1 && problem !== null ? <Text tone="danger">{problem}</Text> : null}
          {stage === null ? null : <Text tone="accent">{progress ?? STAGES[stage]}</Text>}
          <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
            {busy ? (
              <Button variant="destructive" onClick={() => controller.current?.abort()}>
                Cancel
              </Button>
            ) : null}
            {step === 0 ? (
              <>
                <Button
                  variant="primary"
                  disabled={!ideaReady || busy}
                  onClick={() => void makePlan()}
                >
                  {plan === null ? "Plan this world" : "Plan it again"}
                </Button>
                {plan !== null && !busy ? (
                  <Button variant="secondary" onClick={() => setStep(1)}>
                    Back to the plan
                  </Button>
                ) : null}
              </>
            ) : (
              <>
                <Button
                  variant="primary"
                  disabled={busy || problem !== null}
                  onClick={() => void build()}
                >
                  Build and play
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => void makePlan()}>
                  Ask for another plan
                </Button>
              </>
            )}
            <Button variant="ghost" disabled={busy} onClick={back}>
              {step === 1 ? "Back to the world" : "Back to the title"}
            </Button>
          </div>
          {offline === null ? null : (
            <Button variant="ghost" disabled={busy} onClick={refreshProbe}>
              Check the model again
            </Button>
          )}
        </Surface>
      </div>
    </GameShell>
  );
}
