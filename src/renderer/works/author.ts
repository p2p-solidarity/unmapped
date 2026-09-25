// One authoring attempt: request → model reply → apply → store as a pending draft candidate →
// check it in the real player → repair at most WORK_REPAIR_LIMIT times → settle. Nothing here
// touches `head` directly: main only moves it for a checked candidate whose base is still head,
// so a cancelled, failed or late attempt leaves the last playable version exactly as it was.

import { chat } from "@renderer/llm";
import type { ChatMessage } from "@shared/llm";
import { err, ok, type Result } from "@shared/result";
import { applyWorkReply, parseWorkReply } from "@shared/workEdits";
import {
  editWorkMessages,
  generateWorkMessages,
  repairWorkMessages,
  WORK_EDIT_TOKENS,
  WORK_GENERATE_TOKENS,
  WORK_REPAIR_LIMIT,
} from "@shared/workPrompt";
import type { WorkDraft, WorkText } from "@shared/works";
import { type CheckOutcome, describeProblem } from "./frameGuard";

const MODEL_TIMEOUT_MS = 240_000;

export type AttemptOutcome = "playable" | "failed" | "cancelled" | "stale";

/** What the history panel and the acceptance log show for one request. */
export interface AttemptReport {
  kind: "generate" | "edit";
  request: string;
  outcome: AttemptOutcome;
  /** True when the first reply, before any repair, passed the player check. */
  firstPass: boolean;
  repairs: number;
  candidates: string[];
  elapsedMs: number;
  modelMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  problems: string[];
  draft: WorkDraft;
}

export interface AttemptDeps {
  check(candidateId: string): Promise<CheckOutcome>;
  signal: AbortSignal;
  onStage(stage: string): void;
  model: string | null;
}

function add(total: number | null, value: number | undefined): number | null {
  return value === undefined ? total : (total ?? 0) + value;
}

export async function runAttempt(
  draft: WorkDraft,
  kind: "generate" | "edit",
  request: string,
  deps: AttemptDeps,
): Promise<Result<AttemptReport>> {
  const started = performance.now();
  const expectedHead = draft.head;
  let working: WorkText | null = null;
  if (kind === "edit") {
    if (expectedHead === null) return err("draft-empty", "There is no playable version to change.");
    const base = await window.seed.works.readCandidate(draft.draftId, expectedHead);
    if (!base.ok) return base;
    working = base.value;
  }

  const report: AttemptReport = {
    kind,
    request,
    outcome: "failed",
    firstPass: false,
    repairs: 0,
    candidates: [],
    elapsedMs: 0,
    modelMs: 0,
    promptTokens: null,
    completionTokens: null,
    problems: [],
    draft,
  };
  const finish = (outcome: AttemptOutcome): Result<AttemptReport> => {
    report.outcome = outcome;
    report.elapsedMs = Math.round(performance.now() - started);
    return ok(report);
  };

  let messages: ChatMessage[] =
    working === null ? generateWorkMessages(request) : editWorkMessages(working, request);
  let parent = expectedHead;
  let candidateKind: "generate" | "edit" | "repair" = kind;
  let candidateRequest = request;

  for (;;) {
    deps.onStage(
      report.repairs === 0
        ? kind === "generate"
          ? "Writing the world…"
          : "Applying the change…"
        : `Repairing (${report.repairs}/${WORK_REPAIR_LIMIT})…`,
    );
    const callStart = performance.now();
    const reply = await chat(
      {
        messages,
        maxTokens:
          kind === "generate" && report.repairs === 0 ? WORK_GENERATE_TOKENS : WORK_EDIT_TOKENS,
        temperature: 0.4,
        grammar: null,
        stop: [],
        tools: [],
      },
      undefined,
      { signal: deps.signal, timeoutMs: MODEL_TIMEOUT_MS },
    );
    const callMs = performance.now() - callStart;
    report.modelMs += Math.round(callMs);
    if (!reply.ok) {
      if (deps.signal.aborted) return finish("cancelled");
      report.problems = [`${reply.error.code}: ${reply.error.message}`];
      return finish("failed");
    }
    report.promptTokens = add(report.promptTokens, reply.value.usage?.prompt);
    report.completionTokens = add(report.completionTokens, reply.value.usage?.completion);

    const parsed = parseWorkReply(reply.value.text);
    const applied = parsed.ok ? applyWorkReply(working, parsed.value) : parsed;
    const written = applied.ok
      ? await window.seed.works.writeCandidate({
          draftId: draft.draftId,
          parent,
          kind: candidateKind,
          request: candidateRequest,
          summary: applied.value.summary,
          text: applied.value.text,
          changed: applied.value.changed,
          metrics: {
            model: deps.model,
            elapsedMs: Math.round(callMs),
            promptTokens: reply.value.usage?.prompt ?? null,
            completionTokens: reply.value.usage?.completion ?? null,
          },
        })
      : applied;
    if (deps.signal.aborted) {
      if (written.ok)
        await settle(draft.draftId, written.value.candidate.id, "cancelled", null, expectedHead);
      return finish("cancelled");
    }

    if (!written.ok) {
      // The reply could not even become a candidate (format, edit that does not match, invalid
      // assets.json). The model gets the exact reason and the same base to try again.
      report.problems = [written.error.message];
      if (report.repairs >= WORK_REPAIR_LIMIT) return finish("failed");
      report.repairs += 1;
      const base = working === null ? generateWorkMessages(request) : messages;
      messages = [
        ...base,
        { role: "assistant", content: reply.value.text.slice(0, 60_000) },
        {
          role: "user",
          content: `That reply could not be used: ${written.error.message}\nReply again in the exact @@ format${working === null ? " with the complete world" : ""}.`,
        },
      ];
      continue;
    }

    const candidateId = written.value.candidate.id;
    report.candidates.push(candidateId);
    deps.onStage("Checking in the player…");
    const outcome = await deps.check(candidateId);
    if (deps.signal.aborted) {
      await settle(draft.draftId, candidateId, "cancelled", null, expectedHead);
      return finish("cancelled");
    }
    if (outcome.passed) {
      const settled = await settle(draft.draftId, candidateId, "playable", null, expectedHead);
      if (!settled.ok) {
        report.problems = [settled.error.message];
        return finish(settled.error.code === "draft-stale" ? "stale" : "failed");
      }
      report.draft = settled.value;
      report.firstPass = report.repairs === 0;
      report.problems = [];
      return finish("playable");
    }

    const problems = outcome.problems.map(describeProblem);
    report.problems = problems;
    const failed = await settle(
      draft.draftId,
      candidateId,
      "failed",
      problems.join("\n"),
      expectedHead,
    );
    if (failed.ok) report.draft = failed.value;
    if (report.repairs >= WORK_REPAIR_LIMIT) return finish("failed");
    if (!applied.ok) return finish("failed");
    report.repairs += 1;
    working = applied.value.text;
    parent = candidateId;
    candidateKind = "repair";
    candidateRequest = problems.join("\n");
    messages = repairWorkMessages(working, problems);
  }
}

function settle(
  draftId: string,
  candidateId: string,
  outcome: "playable" | "failed" | "cancelled",
  error: string | null,
  expectedHead: string | null,
): Promise<Result<WorkDraft>> {
  return window.seed.works.settleCandidate({ draftId, candidateId, outcome, error, expectedHead });
}
