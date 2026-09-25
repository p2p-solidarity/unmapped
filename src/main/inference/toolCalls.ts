// Streamed tool calls arrive in fragments. The call id and the function name land on the first
// delta for an index; `arguments` is concatenated across however many chunks the server feels like
// using, and providers interleave indices freely. So the accumulator is keyed by `index`, never by
// arrival order, and a fragment that never got a name is dropped rather than guessed at (Rule 2).

import type { ToolCall } from "@shared/llm";

/** The shape OpenAI-compatible servers put in `choices[].delta.tool_calls[]`. */
export interface ToolCallDelta {
  index: number;
  id?: string | null;
  type?: string | null;
  function?: { name?: string | null; arguments?: string | null } | null;
}

export interface ToolCallAccumulator {
  push(deltas: readonly ToolCallDelta[] | null | undefined): void;
  /** Completed calls in ascending index order. */
  toolCalls(): ToolCall[];
}

interface PendingCall {
  id: string | null;
  name: string;
  arguments: string;
}

export function createToolCallAccumulator(): ToolCallAccumulator {
  const byIndex = new Map<number, PendingCall>();

  return {
    push(deltas) {
      if (deltas === null || deltas === undefined) return;
      for (const delta of deltas) {
        if (!Number.isInteger(delta.index) || delta.index < 0) continue;
        const current: PendingCall = byIndex.get(delta.index) ?? {
          id: null,
          name: "",
          arguments: "",
        };
        if (typeof delta.id === "string" && delta.id.length > 0) current.id = delta.id;
        const name = delta.function?.name;
        if (typeof name === "string" && name.length > 0) current.name = name;
        const args = delta.function?.arguments;
        if (typeof args === "string") current.arguments += args;
        byIndex.set(delta.index, current);
      }
    },

    toolCalls() {
      return [...byIndex.entries()]
        .sort(([a], [b]) => a - b)
        .filter(([, call]) => call.name.length > 0)
        .map(([index, call]) => ({
          // Ollama and some llama.cpp builds omit the id entirely; a deterministic stand-in keeps
          // the tool-result message addressable without inventing an id that means something else.
          id: call.id ?? `call_${index}`,
          name: call.name,
          arguments: call.arguments,
        }));
    },
  };
}
