// One authoring attempt: request → model reply → apply → store as a pending draft candidate →
// check it in the real player → repair at most WORK_REPAIR_LIMIT times → settle. Nothing here
// touches `head` directly: main only moves it for a checked candidate whose base is still head,
// so a cancelled, failed or late attempt leaves the last playable version exactly as it was.

import { translate } from "@renderer/i18n";
import { chat } from "@renderer/llm";
import type { ChatMessage } from "@shared/llm";
import { err, ok, type Result } from "@shared/result";
import {
  applyWorkReply,
  assembleWorkReply,
  parseWorkReply,
  type WorkReply,
  type WorkReplyMode,
} from "@shared/workEdits";
import {
  editWorkMessages,
  generateWorkMessages,
  repairProblems,
  repairWorkMessages,
  retryWorkMessages,
  WORK_EDIT_TOKENS,
  WORK_GENERATE_TOKENS,
  WORK_REPAIR_LIMIT,
} from "@shared/workPrompt";
import { textOf, WORK_CODE_FILES, WORK_LIMITS, type WorkDraft, type WorkText } from "@shared/works";
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

/**
 * A reply that assembled into files but failed validation (bad assets.json, an import line) is
 * patched with edits from there, instead of asking for the whole world again.
 */
function salvage(base: WorkText | null, reply: WorkReply, mode: WorkReplyMode): WorkText | null {
  const assembled = assembleWorkReply(base, reply, mode);
  if (!assembled.ok) return null;
  const text = assembled.value;
  const oversized = WORK_CODE_FILES.some(
    (file) => new TextEncoder().encode(textOf(text, file)).length > WORK_LIMITS.codeBytes,
  );
  return oversized ? null : text;
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
  // The turn a retry repeats; a retry never stacks earlier failed exchanges on top of it.
  let turn = messages;
  let mode: WorkReplyMode = kind;
  let parent = expectedHead;
  // Text of `parent`, so `changed` is right even when `working` is a salvaged, unstored reply.
  let parentText: WorkText | null = working;
  let candidateKind: "generate" | "edit" | "repair" = kind;
  let candidateRequest = request;

  for (;;) {
    deps.onStage(
      report.repairs === 0
        ? translate(kind === "generate" ? "works.stageWriting" : "works.stageApplying")
        : translate("works.stageRepairing", { n: report.repairs, max: WORK_REPAIR_LIMIT }),
    );
    const callStart = performance.now();
    const reply = await chat(
      {
        messages,
        maxTokens: mode === "generate" ? WORK_GENERATE_TOKENS : WORK_EDIT_TOKENS,
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
    const applied = parsed.ok
      ? applyWorkReply(working, parsed.value, { mode, parent: parentText })
      : parsed;
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
      // The reply could not even become a candidate (format, an edit that does not match, a
      // whole-file repair, invalid assets.json). This counts as a repair attempt.
      report.problems = [written.error.message];
      if (report.repairs >= WORK_REPAIR_LIMIT) return finish("failed");
      report.repairs += 1;
      const salvaged =
        parsed.ok && !applied.ok && applied.error.code === "work-invalid"
          ? salvage(working, parsed.value, mode)
          : null;
      if (salvaged !== null) {
        working = salvaged;
        mode = "repair";
        turn = repairWorkMessages(working, written.error.message.split("\n"));
        messages = turn;
      } else {
        messages = retryWorkMessages(turn, reply.value.text, written.error.message, mode);
      }
      continue;
    }

    const candidateId = written.value.candidate.id;
    report.candidates.push(candidateId);
    deps.onStage(translate("works.stageChecking"));
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

    const problems = repairProblems(outcome.problems.map(describeProblem));
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
    parentText = working;
    parent = candidateId;
    mode = "repair";
    candidateKind = "repair";
    candidateRequest = problems.join("\n");
    turn = repairWorkMessages(working, problems);
    messages = turn;
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
