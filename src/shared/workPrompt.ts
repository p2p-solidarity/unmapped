// Everything the model is told about the work player. Kept deliberately short: the Prompt 1
// experiment showed ~1 KB of contract was enough for three unrelated games to run first try, and
// every extra rule here is paid for on every generation, edit and repair.

import type { ChatMessage } from "./llm";
import { WORK_CODE_FILES, WORK_LIBRARY, type WorkText } from "./works";

export const WORK_REPAIR_LIMIT = 2;
export const WORK_GENERATE_TOKENS = 16_000;
export const WORK_EDIT_TOKENS = 10_000;

const library = WORK_LIBRARY.map((entry) => `- ${entry.path}: ${entry.note}`).join("\n");

export const WORK_CONTRACT = `You write one small browser game "world" for the Unwritten Land player.

Runtime (an isolated sandbox page; the global \`host\` is the only API):
- host.root: an empty <div> filling the page. Put all DOM or a <canvas> inside it.
- host.load(): the last saved JSON state, or null. Call once at start to resume.
- host.save(state): save JSON progress after meaningful changes (not every frame).
- host.carry: JSON object carried in from the previous world (read-only, may be null), e.g. {"coins":3,"items":["key"]}.
- host.complete(summary, carry): call once when the world is won or finished; pass the carry for the next world (keep what came in, add what was earned).
- host.asset(id): data URL for an id in assets.json, or null when that image is missing.
- host.status(text): short status line shown by the player shell.
- Not available: network, fetch, storage, eval, new Function, workers, popups, the parent page.
- Keyboard: listen on window for keydown/keyup (arrows, WASD, Space, Enter). Mouse: events inside host.root.
- If host.asset(id) is null, draw a labelled box "missing: <id>" — never pretend it is the art.
- main.js is a classic script (no import/export). Keep it under 400 lines, with the game rules as named constants near the top.
- Write every player-facing text in the language of the request.

Library images (CC0 pixel art; use image-rendering: pixelated or ctx.imageSmoothingEnabled = false):
${library}
In assets.json, "src" must be one of these library paths or null.

Reply ONLY in this line format, no Markdown:
@@summary
<one or two sentences: what the world is and how to play>
@@file main.js
<code>
@@file style.css
<css>
@@file assets.json
{"hero": {"src": "library/ninja_blue.png", "note": "player sprite"}}
@@end`;

const EDIT_RULES = `You are changing an existing world. Make the smallest change that satisfies the request and keep every other behaviour, text and style identical.
Reply ONLY with:
@@summary
<one sentence saying what changed>
then only the files that change, either
@@edit <file>
<<<<<<< SEARCH
<exact current text, unique in the file>
=======
<new text>
>>>>>>> REPLACE
(one or more blocks) or @@file <file> with the whole new file. Finish with @@end.
Rules live in main.js, layout and colours in style.css, image choices in assets.json.`;

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
    { role: "system", content: WORK_CONTRACT },
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

export function repairWorkMessages(text: WorkText, problems: string[]): ChatMessage[] {
  return [
    { role: "system", content: `${WORK_CONTRACT}\n\n${EDIT_RULES}` },
    {
      role: "user",
      content: `Current files:\n${currentFiles(text)}\n\nThe world failed its check in the player:\n${problems
        .map((problem) => `- ${problem}`)
        .join("\n")}\nFix only what causes these problems.`,
    },
  ];
}
