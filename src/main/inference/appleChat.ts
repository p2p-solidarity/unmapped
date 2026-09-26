// Apple's on-device model as a chat provider, run inside the app: the bundled Swift bridge's `chat`
// method answers the same messages and tools a Chat Completions server would, so there is no
// `fm serve`, no port and no `sudo fm license`. Text streams as partial events; tool calls come
// back for the harness to run, exactly as they do from any other provider.
//
// The bridge budgets the answer with the model's own token counter, so main's estimate (`fitOutput`,
// which reads CJK text about 1.75× too long for this model) is not used here: main sends the task's
// maximum and its minimum useful answer, and the bridge refuses when that minimum does not fit.
// A request with a `program` shape is answered under guided generation (ChatProgram.swift); one
// with a `schema` too, and its text is then the answer's JSON (Chat.swift).
//
// Everything the helper sends is untrusted until the schemas below accept it.

import type { ChatRequest, ChatUsage, ProbeResult, ToolCall } from "@shared/llm";
import { type AppError, fail, ok, type Result } from "@shared/result";
import { z } from "zod";
import { minUsefulTokens } from "./budget";
import type { ChatCompletionResult } from "./client";

/** One native request with its partial events: `AppleLocalSceneProvider` owns the transport. */
export type NativeCall = (
  payload: unknown,
  options: { signal: AbortSignal; onPartial(payload: unknown): void },
) => Promise<Result<unknown>>;

export interface AppleChatStatus {
  available: boolean;
  /** Why not, as the bridge says it (`apple_intelligence_not_enabled`, …); null when available. */
  reason: string | null;
  contextTokens: number | null;
}

export interface AppleChatStep {
  text: string;
  toolCalls: ToolCall[];
  usage: ChatUsage;
  /** The answer budget the bridge actually gave, from the model's own count. */
  maxTokens: number;
  /** `length`: the budget ran out; `repetition`: the answer looped and was cut at the loop. */
  finish: "stop" | "length" | "repetition";
}

export interface AppleChat {
  chatStatus(): Promise<Result<AppleChatStatus>>;
  chat(
    request: ChatRequest,
    minTokens: number,
    onDelta: (text: string) => void,
    signal: AbortSignal,
  ): Promise<Result<AppleChatStep>>;
}

const count = z.number().int().nonnegative();
const deltaSchema = z.object({ delta: z.string() }).strict();
const resultSchema = z
  .object({
    text: z.string(),
    toolCalls: z
      .array(
        z
          .object({
            id: z.string().min(1).max(256),
            name: z.string().min(1).max(128),
            arguments: z.string().max(100_000),
          })
          .strict(),
      )
      .max(32),
    usage: z.object({ input: count, cached: count, output: count }).strict(),
    maxTokens: z.number().int().positive(),
    finish: z.enum(["stop", "length", "repetition"]),
  })
  .strict();

function invalidChat(detail: string): AppError {
  return {
    code: "native-invalid-chat",
    message: "The Foundation Models helper returned an invalid chat answer.",
    hint: detail,
  };
}

/** Stop sequences cut the finished text; the model itself has no stop list. */
function cutAtStop(text: string, stop: readonly string[]): string {
  let end = text.length;
  for (const marker of stop) {
    const at = marker.length > 0 ? text.indexOf(marker) : -1;
    if (at >= 0 && at < end) end = at;
  }
  return text.slice(0, end);
}

export async function runAppleChat(
  call: NativeCall,
  request: ChatRequest,
  minTokens: number,
  onDelta: (text: string) => void,
  signal: AbortSignal,
): Promise<Result<AppleChatStep>> {
  let malformed: string | null = null;
  const program = request.tools.length === 0 ? request.program : undefined;
  const schema = request.tools.length === 0 && program === undefined ? request.schema : undefined;
  const answered = await call(
    {
      messages: request.messages,
      tools: request.tools,
      maxTokens: request.maxTokens,
      minTokens: Math.min(minTokens, request.maxTokens),
      temperature: request.temperature,
      ...(program === undefined ? {} : { program }),
      ...(schema === undefined ? {} : { schema }),
    },
    {
      signal,
      onPartial(payload) {
        const delta = deltaSchema.safeParse(payload);
        if (delta.success) onDelta(delta.data.delta);
        else malformed ??= delta.error.issues[0]?.message ?? "malformed delta";
      },
    },
  );
  if (!answered.ok) return answered;
  if (malformed !== null) return fail(invalidChat(malformed));
  const parsed = resultSchema.safeParse(answered.value);
  if (!parsed.success) return fail(invalidChat(parsed.error.issues[0]?.message ?? "bad result"));
  const { text, toolCalls, usage, maxTokens, finish } = parsed.data;
  return ok({
    text: cutAtStop(text, request.stop),
    toolCalls,
    usage: { prompt: usage.input, completion: usage.output, cached: usage.cached },
    maxTokens,
    finish,
  });
}

/** `runChat`'s Apple branch: the same result shape as `streamChat`. */
export async function streamAppleChat(
  apple: AppleChat | null,
  request: ChatRequest,
  onDelta: (text: string) => void,
  signal: AbortSignal,
): Promise<Result<ChatCompletionResult>> {
  if (apple === null) {
    return fail({
      code: "apple-unavailable",
      message: "Apple's on-device model runs only in the macOS app.",
      hint: "Choose another model in Settings → Model.",
    });
  }
  const step = await apple.chat(request, minUsefulTokens(request), onDelta, signal);
  if (!step.ok) {
    // One code per meaning for every provider: the usage ledger counts an abort as aborted, and a
    // task that does not fit reads the same whichever model refused it.
    if (step.error.code === "request-aborted") {
      return fail({ code: "aborted", message: "The request was cancelled." });
    }
    if (step.error.code === "bridge.context_exceeded") {
      return fail({ ...step.error, code: "model-context-too-small" });
    }
    return step;
  }
  const { finish, ...answer } = step.value;
  if (finish !== "stop") {
    process.stdout.write(
      `[inference] apple-fm answer ended by ${finish} at ${answer.usage.completion} tokens\n`,
    );
  }
  return ok(answer);
}

/** The probe for Apple: no server to reach, so "reachable" means the bridge answers chat. */
export async function probeApple(apple: AppleChat | null): Promise<Omit<ProbeResult, "context">> {
  const started = Date.now();
  const status = apple === null ? null : await apple.chatStatus();
  const reachable = status?.ok === true && status.value.available;
  return {
    reachable,
    models: reachable ? ["system"] : [],
    latencyMs: Date.now() - started,
    serverName: "apple-foundation-models",
  };
}
