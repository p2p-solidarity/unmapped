// The player card's goal on open land: one plain sentence about what to do right now, read from
// the story's real state (Rule 2) — the next chapter not yet cleared, whether it is being written,
// whether it failed, who is still to be met around its gate (by name), what is still to be opened
// or beaten, or that it is a place to walk into. The compass arrow already points to the gate, so
// the sentence only says "follow the arrow". The only number is how many are still left.

import { readChapter } from "@renderer/engine2d/chapterLayer";
import { type Translate, useT } from "@renderer/i18n";
import { useInferenceStore, useLandStore, useSessionStore } from "@renderer/state";
import { Text, type TextTone } from "@renderer/ui";
import { type ChapterStage, chapterLeft } from "@shared/chapter";
import type { LandProgress } from "@shared/land";
import type { InferenceConfig, ProbeResult } from "@shared/llm";
import type { Loadable } from "@shared/result";
import {
  nextEpisode,
  STORY_CAP,
  type StoryEpisode,
  type StoryPlan,
  storyEpisodes,
} from "@shared/story";
import type { JSX } from "react";
import { type ChapterJobs, useChapterJobs } from "../land/chapterJobs";
import { CHAPTER_CANCELLED, chapterParts } from "../land/chapters";

type ModelState = "ok" | "setup" | "offline";

function modelState(config: InferenceConfig | null, probe: Loadable<ProbeResult>): ModelState {
  if (config === null) return "setup";
  if (probe.status === "error") return "offline";
  if (probe.status === "ready" && !probe.value.reachable) return "offline";
  return "ok";
}

interface GoalLine {
  heading: string;
  line: string;
  tone: TextTone;
}

/** What to do about the next chapter, which is not cleared yet. */
function chapterGoal(
  t: Translate,
  episode: StoryEpisode,
  stage: ChapterStage | null,
  writing: boolean,
  failed: boolean,
  model: ModelState,
): Omit<GoalLine, "heading"> {
  if (writing) return { line: t("hud.goalWriting"), tone: "muted" };
  if (stage === null) {
    if (failed) return { line: t("hud.goalFailed"), tone: "danger" };
    if (model === "setup") return { line: t("hud.goalNeedsSetup"), tone: "danger" };
    if (model === "offline") return { line: t("hud.goalOffline"), tone: "danger" };
    return { line: t("hud.goalGate"), tone: "accent" };
  }
  if (stage.kind !== "land") return { line: t("hud.goalEnter"), tone: "accent" };
  const draft = readChapter(stage.source);
  // A chapter that cannot be read here still has its gate, whose card says what is wrong.
  if (draft === null) return { line: t("hud.goalGate"), tone: "accent" };
  const left = chapterLeft(chapterParts(draft), stage);
  if (left.talk > 0) {
    const name = draft.npcs.find((npc) => !stage.met.includes(npc.id))?.name ?? episode.place;
    return {
      line:
        left.talk > 1 ? t("hud.goalTalkMore", { name, n: left.talk }) : t("hud.goalTalk", { name }),
      tone: "accent",
    };
  }
  if (left.find > 0) {
    return {
      line: left.find > 1 ? t("hud.goalFindMore", { n: left.find }) : t("hud.goalFind"),
      tone: "accent",
    };
  }
  if (left.defeat > 0) {
    return {
      line: left.defeat > 1 ? t("hud.goalDefeatMore", { n: left.defeat }) : t("hud.goalDefeat"),
      tone: "accent",
    };
  }
  return { line: t("hud.goalAlmost"), tone: "muted" };
}

function goalOf(
  t: Translate,
  plan: StoryPlan | null,
  progress: LandProgress | null,
  landInstance: string | null,
  jobs: ChapterJobs,
  model: ModelState,
): GoalLine {
  const heading = t("hud.goalHeading");
  if (plan === null) return { heading, line: t("hud.goalExplore"), tone: "accent" };
  if (progress === null) return { heading, line: t("landHistory.reading"), tone: "muted" };
  const done = progress.episodes ?? {};
  const all = storyEpisodes(plan, progress.storyMore);
  const next = nextEpisode(all, done);
  if (next === null) {
    if (all.length >= STORY_CAP) return { heading, line: t("hud.goalEnded"), tone: "success" };
    if (model === "setup") return { heading, line: t("hud.goalNeedsSetup"), tone: "danger" };
    if (model === "offline") return { heading, line: t("hud.goalOffline"), tone: "danger" };
    return { heading, line: t("hud.goalAllDone"), tone: "success" };
  }
  const writing = jobs.job?.instanceId === landInstance && jobs.job.episodeId === next.id;
  const failure = jobs.failure;
  const failed =
    failure !== null &&
    failure.instanceId === landInstance &&
    failure.episodeId === next.id &&
    failure.error.code !== CHAPTER_CANCELLED;
  const stage = done[next.id]?.stage ?? null;
  return {
    heading: t("hud.goalChapter", { title: next.title }),
    ...chapterGoal(t, next, stage, writing, failed, model),
  };
}

export function Goal(): JSX.Element {
  const t = useT();
  const plan = useSessionStore((state) => state.activeInstance?.cartridge.story ?? null);
  const progress = useLandStore((state) => state.progress);
  const landInstance = useLandStore((state) => state.instanceId);
  const inPlace = useSessionStore((state) => state.place !== null);
  const config = useInferenceStore((state) => state.config);
  const probe = useInferenceStore((state) => state.probe);
  const jobs = useChapterJobs();
  const goal = inPlace
    ? { heading: t("hud.goalHeading"), line: t("hud.goalPlace"), tone: "accent" as const }
    : goalOf(t, plan, progress, landInstance, jobs, modelState(config, probe));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Text variant="caption" tone="dim">
        {goal.heading}
      </Text>
      <Text variant="bodyLarge" tone={goal.tone} style={{ lineHeight: 1.4 }}>
        {goal.line}
      </Text>
    </div>
  );
}
