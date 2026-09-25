// karma.jsonl — one KarmaEntry per line, append-only, hand-editable (Rule 9). The player may
// open it in a text editor, so parsing must survive garbage: bad lines are skipped and counted,
// never thrown and never repaired into plausible-looking entries (Rule 2).

import { CHOICE_ACTIONS, type KarmaEntry, LEDGER_ACTIONS } from "@shared/world";

export type KarmaAction = KarmaEntry["action"];

export const KARMA_ACTIONS: readonly KarmaAction[] = [...CHOICE_ACTIONS, ...LEDGER_ACTIONS];

export interface KarmaParse {
  entries: KarmaEntry[];
  /** Non-empty lines that were not a valid KarmaEntry. */
  skipped: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isKarmaAction(value: string): value is KarmaAction {
  return (KARMA_ACTIONS as readonly string[]).includes(value);
}

/** Returns null when the line is not a KarmaEntry — the caller counts it as skipped. */
export function parseKarmaLine(line: string): KarmaEntry | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  const { at, floor, npcId, choice, action, effect, cx, cz } = raw;
  if (typeof at !== "string" || typeof choice !== "string" || typeof effect !== "string") {
    return null;
  }
  if (typeof floor !== "number" || !Number.isFinite(floor)) return null;
  if (npcId !== null && typeof npcId !== "string") return null;
  if (typeof action !== "string" || !isKarmaAction(action)) return null;
  const entry: KarmaEntry = { at, floor, npcId, choice, action, effect };
  if (Number.isInteger(cx) && Number.isInteger(cz))
    return { ...entry, cx: cx as number, cz: cz as number };
  return entry;
}

export function parseKarmaJsonl(text: string): KarmaParse {
  const entries: KarmaEntry[] = [];
  let skipped = 0;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const entry = parseKarmaLine(trimmed);
    if (entry === null) skipped += 1;
    else entries.push(entry);
  }
  return { entries, skipped };
}

export function serializeKarmaJsonl(entries: readonly KarmaEntry[]): string {
  if (entries.length === 0) return "";
  return `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
}

export interface KarmaDraft {
  floor: number;
  action: KarmaAction;
  choice: string;
  effect: string;
  npcId?: string | null;
  at?: string;
  /** Open-land chunk the entry happened on. */
  chunk?: { cx: number; cz: number } | null;
}

export function makeKarmaEntry(draft: KarmaDraft): KarmaEntry {
  return {
    at: draft.at ?? new Date().toISOString(),
    floor: draft.floor,
    npcId: draft.npcId ?? null,
    choice: draft.choice,
    action: draft.action,
    effect: draft.effect,
    ...(draft.chunk === undefined || draft.chunk === null
      ? {}
      : { cx: draft.chunk.cx, cz: draft.chunk.cz }),
  };
}
