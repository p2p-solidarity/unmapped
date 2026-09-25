// Draws the land's resident and monster sprites with the image model, once, as a dev step (it
// spends the OPENAI_API_KEY in .env — run it by hand, never from the app or CI). Each subject is
// generated at most once: raw pictures are kept in .cache/sprites/, so re-running only draws what
// is missing and re-packs. The packed sheet (src/assets/generated/actors.png) has one 64 px cell per
// NPC role (row 0) and per monster kind (row 1); actors.json records each cell's model, prompt and
// usage.
//
//   bun scripts/gen-sprites.ts                 # draw missing subjects, then pack
//   bun scripts/gen-sprites.ts slime merchant  # draw only these (if missing), then pack
//   bun scripts/gen-sprites.ts --redo slime    # draw slime again even if it exists
//
// Needs ImageMagick (`magick`) for trimming and packing.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import { MONSTER_KINDS, type MonsterKind, NPC_ROLES, type NpcRole } from "../src/shared/world";

const RAW = ".cache/sprites";
const OUT = "src/assets/generated";
const CELL = 64;
const COLUMNS = Math.max(NPC_ROLES.length, MONSTER_KINDS.length);

const STYLE = [
  "Pixel-art game sprite in the style of HD-2D JRPGs such as Octopath Traveler:",
  "16-bit pixel art, clean dark outlines, a limited warm palette, soft light from the top-left.",
  "Exactly one {subject}, full body, standing, seen from the front at a slight top-down",
  "three-quarter angle, facing the viewer, centred, feet at the bottom of the figure.",
  "Transparent background. No ground, no shadow, no text, no border, no scenery, no second figure.",
].join(" ");

const ROLE_SUBJECT: Record<NpcRole, string> = {
  merchant: "travelling merchant villager with a big pack and an apron",
  monk: "shaven-headed monk in simple ochre robes holding prayer beads",
  smith: "burly blacksmith with a leather apron and a hammer",
  farmer: "farmer in a straw hat carrying a hoe",
  guard: "town guard in light armour holding a spear",
  child: "small village child in simple clothes",
  elder: "white-haired village elder leaning on a walking staff",
  bard: "bard in a feathered cap holding a lute",
  stranger: "hooded mysterious traveller in a long dark cloak",
};

const MONSTER_SUBJECT: Record<MonsterKind, string> = {
  slime: "round green slime monster with simple eyes",
  skeleton: "skeleton warrior monster with a rusty sword",
  drone: "round flying scout drone robot in one piece, with small side rotors and one glowing eye",
  golem: "hulking stone golem monster with moss on its shoulders",
  wisp: "floating will-o'-the-wisp: a pale blue flame spirit",
  serpent: "giant serpent monster coiled and rearing up, green scales",
  fox_spirit: "kitsune fox spirit with three flame-tipped tails",
  shade: "shadowy wraith monster of dark smoke with glowing eyes",
};

/** Row 0: one cell per NPC role; row 1: one per monster kind (src/renderer/engine2d/actorSprites). */
const SUBJECTS = [
  ...NPC_ROLES.map((role, column) => ({
    id: `npc.${role}`,
    subject: ROLE_SUBJECT[role],
    column,
    row: 0,
  })),
  ...MONSTER_KINDS.map((kind, column) => ({
    id: `monster.${kind}`,
    subject: MONSTER_SUBJECT[kind],
    column,
    row: 1,
  })),
];

interface CellRecord {
  id: string;
  prompt: string;
  model: string;
  quality: string;
  elapsedMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  at: string;
}

function magick(args: string[]): void {
  const run = spawnSync("magick", args);
  if (run.status !== 0) throw new Error(`magick ${args.join(" ")}: ${run.stderr?.toString()}`);
}

async function draw(client: OpenAI, id: string, prompt: string): Promise<CellRecord> {
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1-mini";
  const quality = (process.env.OPENAI_IMAGE_QUALITY || "medium") as "low" | "medium" | "high";
  const started = performance.now();
  const response = await client.images.generate({
    model,
    prompt,
    size: "1024x1024",
    quality,
    background: "transparent",
    output_format: "png",
    n: 1,
  });
  const b64 = response.data?.[0]?.b64_json;
  if (b64 === undefined) throw new Error(`${id}: the image service returned no image`);
  writeFileSync(join(RAW, `${id}.png`), Buffer.from(b64, "base64"));
  return {
    id,
    prompt,
    model,
    quality,
    elapsedMs: Math.round(performance.now() - started),
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
    at: new Date().toISOString(),
  };
}

/** Trims each raw picture to its figure and packs them bottom-aligned into one sheet. */
function pack(): void {
  const cells = SUBJECTS.map(({ id, column, row }) => {
    const raw = join(RAW, `${id}.png`);
    const cell = join(RAW, `${id}.cell.png`);
    if (!existsSync(raw)) {
      magick(["-size", `${CELL}x${CELL}`, "xc:none", cell]);
      return { cell, column, row };
    }
    magick([
      raw,
      "-trim",
      "+repage",
      "-resize",
      `${CELL - 2}x${CELL - 2}`,
      "-background",
      "none",
      "-gravity",
      "south",
      "-extent",
      `${CELL}x${CELL}`,
      cell,
    ]);
    return { cell, column, row };
  });
  const sheet = join(OUT, "actors.png");
  const args = ["-size", `${COLUMNS * CELL}x${2 * CELL}`, "xc:none"];
  for (const { cell, column, row } of cells) {
    args.push(cell, "-geometry", `+${column * CELL}+${row * CELL}`, "-composite");
  }
  args.push("-strip", sheet);
  magick(args);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const redo = argv.includes("--redo");
  const only = argv.filter((arg) => !arg.startsWith("--"));
  mkdirSync(RAW, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const logPath = join(OUT, "actors.json");
  const log: { cell: number; columns: number; cells: Record<string, CellRecord> } = existsSync(
    logPath,
  )
    ? JSON.parse(readFileSync(logPath, "utf8"))
    : { cell: CELL, columns: COLUMNS, cells: {} };

  const wanted = SUBJECTS.filter(
    ({ id }) => only.length === 0 || only.some((name) => id.endsWith(`.${name}`)),
  ).filter(({ id }) => redo || !existsSync(join(RAW, `${id}.png`)));
  if (wanted.length > 0) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is not set (.env).");
    const client = new OpenAI({ apiKey: key });
    for (const { id, subject } of wanted) {
      const record = await draw(client, id, STYLE.replace("{subject}", subject));
      log.cells[id] = record;
      writeFileSync(logPath, `${JSON.stringify(log, null, 2)}\n`);
      console.log(`${id}: ${record.elapsedMs} ms, ${record.outputTokens ?? "?"} output tokens`);
    }
  }
  pack();
  console.log(`packed ${SUBJECTS.length} cells into ${join(OUT, "actors.png")}`);
}

await main();
