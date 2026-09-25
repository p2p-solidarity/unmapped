// Removes `<think>…</think>` (and `<thinking>`) blocks from a streamed answer, for every task and
// every provider, so no caller has to know that Qwen-style models reason out loud. Works on
// fragments: a tag split across two deltas is held back until it can be recognised. An unclosed
// block (a stream cut short while thinking) yields nothing.

const OPEN = /<think(?:ing)?\b[^>]*>/i;
const CLOSE = /<\/think(?:ing)?\s*>/i;
/** Longest tag worth holding back for; anything longer is ordinary text. */
const TAG_HOLD = 48;

export interface ThinkFilter {
  push(chunk: string): string;
  /** Whatever was held back at the end of the stream. */
  flush(): string;
}

function mayBecomeOpenTag(tail: string): boolean {
  if (tail.length > TAG_HOLD || tail.includes(">")) return false;
  const lower = tail.toLowerCase();
  return "<thinking".startsWith(lower) || /^<think(?:ing)?\b[^>]*$/.test(lower);
}

export function createThinkFilter(): ThinkFilter {
  let held = "";
  let inside = false;
  /** Right after a block closes, the blank lines it leaves are not part of the answer. */
  let trimLead = false;

  function emit(text: string): string {
    if (!trimLead) return text;
    const trimmed = text.replace(/^\s+/, "");
    if (trimmed.length > 0) trimLead = false;
    return trimmed;
  }

  return {
    push(chunk) {
      held += chunk;
      let out = "";
      for (;;) {
        if (inside) {
          const close = CLOSE.exec(held);
          if (close === null) {
            const lt = held.lastIndexOf("<");
            held = lt >= 0 && held.length - lt <= TAG_HOLD ? held.slice(lt) : "";
            return out;
          }
          held = held.slice(close.index + close[0].length);
          inside = false;
          trimLead = true;
          continue;
        }
        const open = OPEN.exec(held);
        if (open !== null) {
          out += emit(held.slice(0, open.index));
          held = held.slice(open.index + open[0].length);
          inside = true;
          continue;
        }
        // A bare closing tag (thinking switched off mid-template) is dropped on its own.
        const stray = CLOSE.exec(held);
        if (stray !== null) {
          out += emit(held.slice(0, stray.index));
          held = held.slice(stray.index + stray[0].length);
          trimLead = true;
          continue;
        }
        const lt = held.lastIndexOf("<");
        if (lt >= 0 && mayBecomeOpenTag(held.slice(lt))) {
          out += emit(held.slice(0, lt));
          held = held.slice(lt);
        } else {
          out += emit(held);
          held = "";
        }
        return out;
      }
    },
    flush() {
      const rest = inside ? "" : emit(held);
      held = "";
      return rest;
    },
  };
}

const BLOCKS = /<think(?:ing)?\b[^>]*>[\s\S]*?<\/think(?:ing)?\s*>/gi;
const CLOSES = /<\/think(?:ing)?\s*>/gi;

/**
 * The final answer. Unlike the live filter it can look back: when a template opened the block in
 * the prompt, the answer starts mid-thought, so everything before the last bare closing tag goes.
 */
export function stripThinking(text: string): string {
  let out = text.replace(BLOCKS, "");
  const closes = [...out.matchAll(CLOSES)];
  const last = closes.at(-1);
  if (last?.index !== undefined) out = out.slice(last.index + last[0].length);
  const open = out.search(OPEN);
  if (open >= 0) out = out.slice(0, open);
  return out.replace(/^\s+/, "");
}
