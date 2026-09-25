// Model output → parseable program. Small models wrap programs in code fences, prefix them with
// "Here is your scene:" and (Qwen thinking mode) emit a <think> block first. Every parse* runs
// this first; the narrative layer may call it too before storing `world.oui`.

const THINK_BLOCK = /<think(?:ing)?\b[^>]*>[\s\S]*?<\/think(?:ing)?>/gi;
const THINK_CLOSE = /<\/think(?:ing)?>/gi;
const THINK_OPEN = /<think(?:ing)?\b[^>]*>/gi;
const FENCE = /^[ \t]*```+[ \t]*([A-Za-z0-9_+-]*)[ \t]*$/;
const STATEMENT_START = /^\s*[A-Za-z_$][\w$]*\s*=/;

function stripThinking(text: string): string {
  const closed = text.replace(THINK_BLOCK, "\n");
  // An unterminated block (streaming cut short) or a bare closing tag: keep what follows the
  // last close tag, and drop everything from a dangling open tag onwards.
  let out = closed;
  const closes = [...out.matchAll(THINK_CLOSE)];
  const last = closes.at(-1);
  if (last?.index !== undefined) out = out.slice(last.index + last[0].length);
  const open = out.search(THINK_OPEN);
  if (open >= 0) out = out.slice(0, open);
  return out;
}

/** Return the contents of the first fenced block that looks like a program, else the input. */
function stripFences(text: string): string {
  const lines = text.split("\n");
  const fences: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined && FENCE.test(line)) fences.push(i);
  }
  if (fences.length === 0) return text;
  for (let i = 0; i + 1 < fences.length; i += 2) {
    const open = fences[i];
    const close = fences[i + 1];
    if (open === undefined || close === undefined) continue;
    const body = lines.slice(open + 1, close);
    if (body.some((line) => STATEMENT_START.test(line))) return body.join("\n");
  }
  // Unbalanced fences: drop every fence line and keep the rest.
  return lines.filter((_, i) => !fences.includes(i)).join("\n");
}

/** Drop prose before the first statement and after the last closing parenthesis. */
function trimProse(text: string): string {
  const lines = text.split("\n");
  const first = lines.findIndex((line) => STATEMENT_START.test(line));
  if (first < 0) return text.trim();
  let last = lines.length - 1;
  while (last > first && !lines[last]?.includes(")")) last--;
  return lines
    .slice(first, last + 1)
    .join("\n")
    .trim();
}

/**
 * Strip ``` fences (with or without a language tag), `<think>…</think>` blocks and surrounding
 * prose, leaving the bare OpenUI Lang program.
 */
export function normalizeOutput(raw: string): string {
  const text = stripThinking(raw.replace(/\r\n?/g, "\n"));
  return trimProse(stripFences(text));
}
