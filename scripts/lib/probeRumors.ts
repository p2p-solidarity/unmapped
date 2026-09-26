// The `rumors` and `join` scenarios of scripts/world-probe.ts (rev 6 phase 3, D13, D14).
//
// rumors, self-contained: a public world whose owner (Mira) witnessed Reed Ford at (1, 0), a
// member (Bea) who joined and witnessed Salt Orchard at (2, 0), then one test-clock day so the
// service beats and opens rumor slots. rumors --world --key-file: the same steps against an
// existing world as a probe key that is already a member there (written by `join`), on the slots
// its beats already opened (`--advance <days>` moves the test clock first).
//
// Every rumor step's expected code is fixed by the shared rules the service must run — `admit`
// and `validateRumor` (@shared/history) — and the probe first runs `admit` on its own copy of the
// fold: if that disagrees, the probe's text is wrong, and the step fails as a setup error instead
// of blaming the service.

import { readInviteLink } from "@shared/history/access";
import { admit } from "@shared/history/admit";
import { verifyLog } from "@shared/history/log";
import { knownLabels, openRumorSlots, rumorKey } from "@shared/history/rumor";
import type { RumorBody, RumorSlot, WorldNow } from "@shared/history/types";
import { advance, type Endpoint, ProbeSocket } from "./probeSocket";
import type { Steps } from "./probeSteps";
import {
  freshKey,
  genesisBody,
  iso,
  joinEvent,
  keyFileOrFresh,
  LocalWorld,
  makeInvite,
  type ProbeKey,
  proofOf,
  readKeyFile,
  sign,
  witnessBody,
} from "./probeWorld";

export interface RumorOptions {
  /** An existing world, written as `key` (a probe key file); null = make one. */
  world: string | null;
  keyFile: string | null;
  advanceDays: number | null;
}

interface Target {
  beat: string;
  slot: RumorSlot;
  /** The slots that beat opened (to find one it did not). */
  taken: number[];
}

/** A world with slots: the owner's and a member's witness, the member's join, then a beat. */
async function makeWorld(endpoint: Endpoint, steps: Steps) {
  const mira = freshKey();
  const owner = await ProbeSocket.connect(endpoint, mira);
  const world = new LocalWorld(mira, genesisBody("Probe rumors", { access: "public" }));
  world.write("profile", { name: "Mira" });
  world.write("witness", witnessBody(1, 0, "Reed Ford", [{ id: "ada", name: "Ada" }]));
  steps.require(
    "the owner attaches a public world with a witness (control)",
    "opened:owner",
    await owner.attach(world),
  );
  const id = world.id;
  const clock = owner.lastRt(id);
  const ticket = makeInvite(id, mira, { svc: endpoint.url, exp: iso(clock + 86_400_000), uses: 1 });
  const bea = await ProbeSocket.connect(endpoint, freshKey());
  const join = { invite: ticket.invite, proof: proofOf(ticket, bea.key) };
  steps.require(
    "Bea opens with an invite (control)",
    "opened:invitee",
    await bea.open(id, { join }),
  );
  steps.require(
    "Bea joins (control)",
    "accepted",
    await bea.submitOne(id, joinEvent(id, join, bea.me, "Bea", bea.head(id))),
  );
  const orchard = witnessBody(2, 0, "Salt Orchard", [{ id: "tomas", name: "Tomas" }]);
  steps.require(
    "Bea witnesses Salt Orchard (control)",
    "accepted",
    await bea.submitOne(id, sign(id, "witness", orchard, bea.me, bea.head(id))),
  );
  return { id, owner, writer: bea };
}

/** Advances the test clock and waits for this world's beat, if the service wrote one. */
async function beatAfter(
  endpoint: Endpoint,
  steps: Steps,
  socket: ProbeSocket,
  id: string,
  days: number,
): Promise<void> {
  const moved = await advance(endpoint, days);
  const beat = moved.beats.find((one) => one.world === id);
  steps.check(
    `advance the test clock ${days} day(s): the service beats this world`,
    "beat",
    moved.answer !== "ok" ? moved.answer : beat?.n != null ? "beat" : (beat?.skipped ?? "no-beat"),
  );
  if (beat?.n != null) await socket.reach(id, beat.n);
}

/** An open slot of the last four beats, else any slot of them (a rumor there is a variant). */
function pickTarget(now: WorldNow): Target | null {
  const open = openRumorSlots(now)[0];
  const recent = now.beats.slice(-4);
  const any = recent.flatMap((beat) => beat.body.slots.map((slot) => ({ beat: beat.id, slot })));
  const chosen = open ?? any[0];
  if (chosen === undefined) return null;
  const beat = now.beats.find((one) => one.id === chosen.beat);
  const taken = beat?.body.slots.map((slot) => slot.slot) ?? [];
  return { beat: chosen.beat, slot: chosen.slot, taken };
}

/** A line naming the cited label and one known label the slot does not allow, if there is one. */
function namingOther(now: WorldNow, author: string, target: Target, label: string): string | null {
  for (const other of knownLabels(now)) {
    const text = `They say ${label} was seen with ${other}.`;
    const body = { beat: target.beat, slot: target.slot.slot, text };
    const event = { kind: "rumor", author, body } as const;
    const judged = admitCode(now, event);
    if (judged === "rumor-names-other") return text;
  }
  return null;
}

type RumorLike = { kind: "rumor"; author: string; body: RumorBody };

/** What the shared `admit` says of a rumor over `now` (world, seen and id filled in). */
function admitCode(now: WorldNow, rumor: RumorLike): string {
  const event = {
    v: 1 as const,
    world: now.world,
    kind: "rumor" as const,
    author: rumor.author,
    at: iso(),
    seen: now.head.n,
    body: rumor.body,
    id: `h${"q".repeat(52)}`,
    sig: "A".repeat(86),
  };
  const judged = admit(now, event, now.rt ?? iso());
  return judged.ok ? "accepted" : judged.error.code;
}

async function rumorSteps(
  steps: Steps,
  endpoint: Endpoint,
  writer: ProbeSocket,
  id: string,
  full: boolean,
): Promise<void> {
  const now = writer.mirror(id).now;
  const target = pickTarget(now);
  const slotText = target === null ? "none" : `slot ${target.slot.slot} of beat ${target.beat}`;
  steps.require(
    "a rumor slot to write against (from the service's beats)",
    "found",
    target === null ? "none" : "found",
    slotText,
  );
  if (target === null) return;
  const cited = now.events[target.slot.cite];
  const label = cited?.label ?? "";
  const listener = now.chunks[`${target.slot.listener.cx},${target.slot.listener.cz}`];
  const detail = `cites ${cited?.kind ?? "?"} "${label}", told by ${target.slot.listener.npc} of ${listener?.index.name ?? "?"}`;

  const rumor = async (step: string, expected: string, who: ProbeSocket, body: RumorBody) => {
    const here = admitCode(who.mirrors.get(id)?.now ?? now, {
      kind: "rumor",
      author: who.key,
      body,
    });
    const event = sign(id, "rumor", body, who.me, who.head(id));
    const got = await who.submitOne(id, event);
    const agreed = here === expected;
    steps.check(
      step,
      expected,
      agreed ? got : `probe-setup:${here}`,
      agreed ? `${detail}; text "${body.text}"` : `admit here says ${here}`,
    );
    return event;
  };
  const at = (text: string, slot = target.slot.slot, beat = target.beat): RumorBody => ({
    beat,
    slot,
    text,
  });

  await rumor(
    "a rumor that does not name the event its slot cites",
    "rumor-uncited",
    writer,
    at("They say the wind turned at dusk."),
  );
  const other = namingOther(now, writer.key, target, label);
  steps.require(
    "a known label the slot does not allow",
    "found",
    other === null ? "none" : "found",
  );
  if (other !== null) {
    await rumor(
      "a rumor that names a label its slot does not cite",
      "rumor-names-other",
      writer,
      at(other),
    );
  }
  const free = [0, 1, 2, 3, 4, 5].find((slot) => !target.taken.includes(slot));
  if (free !== undefined) {
    await rumor(
      `a rumor for slot ${free}, which the beat did not open`,
      "rumor-slot-unknown",
      writer,
      at(`They say ${label} was here.`, free),
    );
  }
  await rumor(
    "a rumor for a beat this world never had",
    "rumor-beat-unknown",
    writer,
    at(`They say ${label} was here.`, target.slot.slot, now.world),
  );

  const valid = at(`They say ${label} was here.`);
  const visitor = await ProbeSocket.connect(endpoint, freshKey());
  const door = await visitor.open(id);
  if (now.access === "public") {
    steps.require("a visitor opens the public world (control)", "opened:visitor", door);
    // Judge the visitor's rumor on the history it was served, not on its genesis alone.
    await visitor.reach(id, visitor.mirror(id).served);
    await rumor("a valid rumor written by a visitor", "access-visitor-kind", visitor, valid);
  } else {
    const shut = now.access === "private" ? "access-private" : "access-members-only";
    steps.check(`a visitor opens the ${now.access} world`, shut, door);
    const event = sign(id, "rumor", valid, visitor.me, 0);
    steps.check(
      "a valid rumor written by a visitor who could not open",
      "world-not-open",
      await visitor.submitOne(id, event),
    );
  }
  await visitor.close();

  const control = await rumor(
    "the valid rumor, from a member (control)",
    "accepted",
    writer,
    valid,
  );
  const standing = writer.mirror(id).now.rumors[rumorKey(target.beat, target.slot.slot)];
  const status =
    standing?.live?.id === control.id
      ? "live"
      : standing?.variants.some((one) => one.id === control.id)
        ? "variant"
        : "missing";
  steps.check("the control rumor stands in the fold", full ? "live" : ["live", "variant"], status);
  if (full) {
    await rumor(
      "a second rumor for the same slot by the same member (a variant)",
      "accepted",
      writer,
      at(`People still talk of ${label}.`),
    );
    const third = at(`Everyone knows of ${label}.`);
    const event = sign(id, "rumor", third, writer.me, writer.head(id));
    steps.check(
      "a third rumor for that slot by the same member",
      "quota-variant",
      await writer.submitOne(id, event),
    );
  }
}

/** The log the service served verifies (chain, receipts), and its beats fold here unchanged. */
function servedLog(steps: Steps, socket: ProbeSocket, id: string): void {
  const mirror = socket.mirror(id);
  const checked = verifyLog(id, mirror.entries);
  steps.check(
    "the served log verifies (chain and receipt schedule)",
    "ok",
    checked.ok ? "ok" : checked.error.code,
    `${mirror.entries.length} entries`,
  );
  const skipped = mirror.now.ignored.filter((one) => one.kind === "beat").map((one) => one.code);
  steps.check(
    "every beat the service wrote equals its recomputation here",
    "equal",
    skipped.length === 0 ? "equal" : skipped.join(","),
    `${mirror.now.beats.length} beats`,
  );
}

export async function rumorsScenario(
  endpoint: Endpoint,
  steps: Steps,
  options: RumorOptions,
): Promise<void> {
  if (options.world === null) {
    const { id, owner, writer } = await makeWorld(endpoint, steps);
    await beatAfter(endpoint, steps, owner, id, options.advanceDays ?? 1);
    await writer.reach(id, owner.head(id));
    await rumorSteps(steps, endpoint, writer, id, true);
    servedLog(steps, owner, id);
    return;
  }
  if (options.keyFile === null)
    throw new Error("rumors --world needs --key-file (a key `join` wrote).");
  const me: ProbeKey = readKeyFile(options.keyFile);
  const writer = await ProbeSocket.connect(endpoint, me);
  steps.require(
    "the probe key opens the world as a member",
    ["opened:member", "opened:owner"],
    await writer.open(options.world),
  );
  // `opened` comes before the entries it announces: read the slots only once they are folded here.
  steps.require(
    "the served history is folded here",
    "reached",
    (await writer.reach(options.world, writer.mirror(options.world).served))
      ? "reached"
      : "timeout",
  );
  if (options.advanceDays !== null)
    await beatAfter(endpoint, steps, writer, options.world, options.advanceDays);
  await rumorSteps(steps, endpoint, writer, options.world, false);
  servedLog(steps, writer, options.world);
}

/** Redeems an invite link as a probe key (fresh, written to `keyFile`, or the one already there). */
export async function joinScenario(
  endpoint: Endpoint,
  steps: Steps,
  options: { link: string; keyFile: string; name: string },
): Promise<void> {
  const link = readInviteLink(options.link);
  steps.require("the invite link reads", "ok", link.ok ? "ok" : link.error.code);
  if (!link.ok) return;
  const { invite, secret } = link.value;
  const { key, created } = keyFileOrFresh(options.keyFile);
  const socket = await ProbeSocket.connect(endpoint, key);
  const join = { invite, proof: proofOf({ invite, secret }, key.key) };
  const where = `world ${invite.world}, key ${key.key} (${created ? "new" : "from"} ${options.keyFile})`;
  const answer = await socket.open(invite.world, { join });
  steps.require("open with the invite", ["opened:invitee", "opened:member"], answer, where);
  if (answer === "opened:invitee") {
    const event = joinEvent(invite.world, join, key, options.name, socket.head(invite.world));
    steps.require(
      "submit the member.join",
      "accepted",
      await socket.submitOne(invite.world, event),
      where,
    );
  }
}
