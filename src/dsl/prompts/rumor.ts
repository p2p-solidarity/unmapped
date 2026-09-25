// The rumor prompt (rev 6 phase 3, D14): the beat chose which facts are retold and who tells each
// one; the model only writes how, in the world's own voice (its bible) and language, for the
// season it is. Every fact is rendered here from the history — what happened, who did it, the one
// name the rumor must carry and the few others it may — so the model never has to guess a name
// and the validator (`validateRumor`) has nothing to refuse that the prompt allowed.

import type { WorldBible } from "@shared/cartridge";
import { chunkKey } from "@shared/chunks";
import { HISTORY_LIMITS } from "@shared/history/bodies";
import type { EventRef, RumorSlot, WorldNow } from "@shared/history/types";
import { rumorLibrary } from "../schemas/rumor";
import { bibleSections } from "./chunk";
import { languageName } from "./shared";

/** Syntax demonstration only (Rule 2): parsed by the DSL tests, never rendered or saved. */
export const RUMOR_EXAMPLE = `root = Rumors([r0, r1])
r0 = Rumor(0, "They say Wren walked the whole of Salt Steps and came back grinning.")
r1 = Rumor(2, "Somebody finally saw what lies past Heron Ford, or so the carter claims.")`;

export const SEASON_NAMES = ["spring", "summer", "autumn", "winter"] as const;

/** One slot as the model reads it. */
export interface RumorFact {
  slot: number;
  /** What happened, in plain words, every name quoted exactly as the world wrote it. */
  fact: string;
  /** The name the rumor must contain, exactly (the cited event's label). */
  must: string;
  /** The other names the rumor may contain. */
  may: string[];
  /** The resident who tells it, and the place they live. */
  teller: { name: string; home: string };
}

export interface RumorPromptContext {
  now: WorldNow;
  /** The open slots of one beat (`openRumorSlots`), in slot order. */
  slots: readonly RumorSlot[];
  /** The world's bible: the voice its residents talk in; null for a world without one. */
  bible: WorldBible | null;
}

const quoted = (name: string): string => `"${name}"`;

/** What a deed recorded: the fold keys deeds `author|ref`, and the ref's form tells the kind. */
function deedWhat(now: WorldNow, deedId: string): "chapter" | "place" | "errand" {
  const key = Object.entries(now.deeds).find(([, id]) => id === deedId)?.[0] ?? "";
  const ref = key.slice(key.indexOf("|") + 1);
  if (ref.includes(":")) return "errand";
  return now.events[ref]?.kind === "chapter" ? "chapter" : "place";
}

function happened(now: WorldNow, ref: EventRef, label: string): string {
  const name = now.names[ref.author];
  const who = name === undefined ? "A traveller" : quoted(name);
  switch (ref.kind) {
    case "deed": {
      const what = deedWhat(now, ref.id);
      if (what === "chapter") return `${who} saw the chapter ${label} of the story through.`;
      if (what === "place") return `${who} made it all the way through ${label}.`;
      return `${who} did one of the people of ${label} a good turn.`;
    }
    case "chapter":
      return `${who} was the first to reach the chapter ${label} of the story.`;
    case "place":
      return `${who} found a way into ${label}.`;
    case "member.join":
      return `${label} came to this world for the first time.`;
    default:
      return `${who} was the first to set eyes on ${label}.`;
  }
}

/**
 * The slots a batch can write, rendered from the history. A slot whose fact is gone from view
 * (hidden, or no longer in the fold) or whose teller no longer stands is left out: silence.
 */
export function rumorFacts(now: WorldNow, slots: readonly RumorSlot[]): RumorFact[] {
  const facts: RumorFact[] = [];
  for (const slot of slots) {
    const cited = now.events[slot.cite];
    const home = now.chunks[chunkKey(slot.listener)];
    const teller = home?.index.npcs.find((npc) => npc.id === slot.listener.npc);
    if (cited === undefined || cited.label === null || now.hidden[cited.id] === true) continue;
    if (home === undefined || teller === undefined || now.hidden[home.live.id] === true) continue;
    const place = slot.place === null ? undefined : (now.events[slot.place]?.label ?? undefined);
    const others = [
      now.names[cited.author],
      cited.subject === null ? undefined : now.names[cited.subject],
      place,
      home.index.name,
      teller.name,
    ];
    const may = others.filter(
      (name, index): name is string =>
        name !== undefined && name !== "" && name !== cited.label && others.indexOf(name) === index,
    );
    const where =
      place === undefined || place === cited.label ? "" : ` It happened at ${quoted(place)}.`;
    facts.push({
      slot: slot.slot,
      fact: `${happened(now, cited, quoted(cited.label))}${where}`,
      must: cited.label,
      may,
      teller: { name: teller.name, home: home.index.name },
    });
  }
  return facts;
}

function factLine(fact: RumorFact): string {
  const may = fact.may.length === 0 ? "" : ` It may also name ${fact.may.map(quoted).join(", ")}.`;
  const teller = `${quoted(fact.teller.name)} of ${quoted(fact.teller.home)} tells it.`;
  return `- Slot ${fact.slot}: ${fact.fact} ${teller} It must name ${quoted(fact.must)} exactly.${may}`;
}

/** The whole prompt for one beat's batch; `rumorFacts` of the same slots says what it lists. */
export function rumorPrompt(ctx: RumorPromptContext): string {
  const facts = rumorFacts(ctx.now, ctx.slots);
  const tag = ctx.now.genesis.body.language;
  const language =
    tag === "und" ? "the language the names below are written in" : languageName(tag);
  const bible = ctx.bible === null ? null : bibleSections(ctx.bible);
  return rumorLibrary.prompt({
    preamble: [
      "You pass on the news of an UNMAPPED world the way its residents tell it to a traveller. Write ONLY an OpenUI Lang program: no prose, no markdown, no code fences, no comments. The first line is the root statement.",
      bible?.core ?? null,
      bible?.style ?? null,
      `## Now\nIt is ${SEASON_NAMES[ctx.now.season]} in this world.`,
      `## What people are talking about\n${facts.map(factLine).join("\n")}`,
    ]
      .filter((part) => part !== null)
      .join("\n\n"),
    additionalRules: [
      `Write every rumor in ${language}. Write every name exactly as it is given between quotes, without the quotes.`,
      "At most one Rumor per slot listed above, with that slot's number. Leave a slot out rather than make something up; never write a slot that is not listed.",
      `Each rumor is one line of at most ${HISTORY_LIMITS.rumorChars} characters, in the voice of the resident who tells it.`,
      "Each rumor names its slot's must-name exactly, and no other place, person, item, chapter or title of this world than the names listed for that slot.",
      "A rumor may colour what happened — hearsay, doubt, a little exaggeration — but never changes who did it or where.",
      "The example below shows syntax only. Never reuse its words or names.",
      "Answer with the program only: first line root = Rumors([...]), every other statement referenced from it exactly once.",
    ],
    examples: [RUMOR_EXAMPLE],
  });
}
