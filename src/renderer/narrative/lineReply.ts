// A model call answered in an @@ line protocol (a story plan, one chapter, one bible part): send,
// parse, and send a malformed reply back with the reason, at most `repairs` times (Rule 7's two by
// default). An abort stops the stream in flight and the loop; it is never retried.

import { chat, usageTag } from "@renderer/llm";
import type { ChatMessage } from "@shared/llm";
import { fail, type Result } from "@shared/result";
import type { UsagePurpose } from "@shared/usage";

export interface CallIo {
  signal: AbortSignal;
  /** Streamed text of the reply as it arrives (a repair round streams again). */
  onDelta?(text: string): void;
}

export interface LineCall<T> {
  /** What the call is counted as in the usage ledger. */
  task: UsagePurpose;
  messages: ChatMessage[];
  parse(reply: string): Result<T>;
  maxTokens: number;
  temperature?: number;
  repairs?: number;
}

export async function askInLines<T>(call: LineCall<T>, io: CallIo): Promise<Result<T>> {
  const messages = [...call.messages];
  const repairs = call.repairs ?? 2;
  for (let attempt = 0; ; attempt += 1) {
    if (io.signal.aborted)
      return fail({ code: "cancelled", message: "The request was cancelled." });
    const reply = await chat(
      {
        messages,
        maxTokens: call.maxTokens,
        temperature: call.temperature ?? 0.7,
        grammar: null,
        stop: [],
        tools: [],
        usage: usageTag(call.task),
      },
      io.onDelta,
      { signal: io.signal },
    );
    if (!reply.ok) return reply;
    const parsed = call.parse(reply.value.text);
    if (parsed.ok || attempt >= repairs) return parsed;
    // Why a repair round was spent, so a run can be read back from the log (never the text itself).
    console.warn(
      `[repair] ${call.task} ${attempt + 1}/${repairs} · ${parsed.error.code} · ${parsed.error.message.slice(0, 240)}`,
    );
    messages.push(
      { role: "assistant", content: reply.value.text.slice(0, 20_000) },
      {
        role: "user",
        content: `${parsed.error.message} ${parsed.error.hint ?? ""} Answer again in the exact format.`,
      },
    );
  }
}
