// Everything the model is told about the work player. Kept deliberately short: the Prompt 1
// experiment showed ~1 KB of contract was enough for three unrelated games to run first try, and
// every extra rule here is paid for on every generation, edit and repair. Things models kept
// getting wrong (resume, carry, frame time) are host helpers now, so the contract names the helper
// instead of explaining the pitfall.

import type { ChatMessage } from "./llm";
import type { WorkReplyMode } from "./workEdits";
import { WORK_CODE_FILES, WORK_LIBRARY, type WorkText } from "./works";

export const WORK_REPAIR_LIMIT = 2;
export const WORK_GENERATE_TOKENS = 16_000;
export const WORK_EDIT_TOKENS = 10_000;
/** A failed reply is shown back to the model only when it is this short (edit blocks, not a world). */
export const WORK_ECHO_CHARS = 6_000;
/** Distinct problems listed in a repair turn; a world that throws every frame repeats one. */
export const WORK_PROBLEM_LIMIT = 8;

const library = WORK_LIBRARY.map((entry) => `- ${entry.path}: ${entry.note}`).join("\n");

export const WORK_CONTRACT = `You write one small browser game "world" for the Unwritten Land player.

Runtime (a sandboxed page; the global \`host\` is the only API):
- host.root: empty <div> filling the page; put your DOM or <canvas> in it.
- host.load(fresh): the last saved state with keys it lacks filled from \`fresh\` (a new game), or \`fresh\` if none. Start: let game = host.load(newGame());
- host.save(state): stores a JSON copy; call after meaningful changes, not every frame.
- host.loop(fn): calls fn(dt) every frame, dt in seconds (max 0.1); returns stop(). Use it instead of requestAnimationFrame.
- host.carry: read-only JSON from the previous world, or null.
- host.complete(summary, earned): call once when won or finished; the host merges the \`earned\` object into host.carry for the next world.
- host.asset(id): data URL for an assets.json id or a library path; null if missing — then draw a labelled box "missing: <id>", never other art.
- host.status(text): short status line.
- No network, storage, eval, workers, popups or parent page.
- Keys: keydown/keyup on window (arrows, WASD, Space, Enter). Mouse: events in host.root.
- main.js: classic script (no import/export), under 400 lines, game rules as named constants at the top.
- Write all player-facing text in the language of the request.

Library images (CC0 pixel art; use image-rendering: pixelated or ctx.imageSmoothingEnabled = false):
${library}
In assets.json, "src" must be one of these library paths or null.`;

const GENERATE_FORMAT = `Reply ONLY in this line format, no Markdown:
@@summary
<one or two sentences: what the world is and how to play>
@@file main.js
<code>
@@file style.css
<css>
@@file assets.json
{"hero": {"src": "library/ninja_blue.png", "note": "player sprite"}}
@@end`;

const EDIT_BLOCK = `@@edit <file>
<<<<<<< SEARCH
<exact current lines, unique in the file>
=======
<new lines>
>>>>>>> REPLACE`;

const EDIT_RULES = `You are changing an existing world. Make the smallest change that satisfies the request and keep every other behaviour, text and style identical.
Reply ONLY with @@summary (one sentence saying what changed), then only the files that change, either
${EDIT_BLOCK}
(one or more blocks) or @@file <file> with the whole new file. Finish with @@end.
Rules live in main.js, layout and colours in style.css, image choices in assets.json.`;

const REPAIR_RULES = `You are fixing an existing world that failed its check. Change only the lines that cause the problems.
Reply ONLY with @@summary (one sentence), then one or more
${EDIT_BLOCK}
blocks, then @@end. Never resend a whole file: @@file is rejected in a repair (except for an empty file).`;

function currentFiles(text: WorkText): string {
  const body: Record<(typeof WORK_CODE_FILES)[number], string> = {
    "main.js": text.main,
    "style.css": text.style,
    "assets.json": text.assets,
  };
  return WORK_CODE_FILES.map((file) => `@@file ${file}\n${body[file]}`).join("\n");
}

export function generateWorkMessages(request: string): ChatMessage[] {
  return [
    { role: "system", content: `${WORK_CONTRACT}\n\n${GENERATE_FORMAT}` },
    { role: "user", content: request },
  ];
}

export function editWorkMessages(text: WorkText, request: string): ChatMessage[] {
  return [
    { role: "system", content: `${WORK_CONTRACT}\n\n${EDIT_RULES}` },
    {
      role: "user",
      content: `Current files:\n${currentFiles(text)}\n\nChange request: ${request}`,
    },
  ];
}

/** Distinct problems, capped: the same error thrown every frame is one problem, not sixty. */
export function repairProblems(problems: string[]): string[] {
  return [...new Set(problems)].slice(0, WORK_PROBLEM_LIMIT);
}

export function repairWorkMessages(text: WorkText, problems: string[]): ChatMessage[] {
  return [
    { role: "system", content: `${WORK_CONTRACT}\n\n${REPAIR_RULES}` },
    {
      role: "user",
      content: `Current files:\n${currentFiles(text)}\n\nThe world failed its check:\n${repairProblems(
        problems,
      )
        .map((problem) => `- ${problem}`)
        .join("\n")}\nFix only what causes these problems.`,
    },
  ];
}

/**
 * The turn after a reply that could not be applied: the same turn again plus the reason. The failed
 * reply is echoed only when short (a few edit blocks the model may reuse); a whole world is never
 * sent back, because the model needs the reason and the current files, not its own long answer.
 */
export function retryWorkMessages(
  turn: ChatMessage[],
  previous: string,
  reason: string,
  mode: WorkReplyMode,
): ChatMessage[] {
  const echo: ChatMessage[] =
    previous.length <= WORK_ECHO_CHARS ? [{ role: "assistant", content: previous }] : [];
  const again =
    mode === "generate"
      ? "Reply again with the complete world in the exact @@ format."
      : mode === "repair"
        ? "Reply again with @@edit SEARCH/REPLACE blocks only."
        : "Reply again in the exact @@ format.";
  return [
    ...turn,
    ...echo,
    {
      role: "user",
      content: `${echo.length > 0 ? "That" : "Your previous"} reply could not be used: ${reason.slice(0, 4_000)}\n${again}`,
    },
  ];
}
