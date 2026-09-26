// The `frames` scenario of scripts/world-probe.ts (rev 6 phase 3, D2, D5, D9): hostile frames and
// forged events over a real socket. A protocol violation (a frame too large, not JSON, not a known
// message, binary, before or instead of a valid auth) is refused and the socket closed; a bad
// event inside a good frame is `rejected` by id and the socket stays open; a flood is dropped with
// one refusal a second, never a close.

import { canonicalJson } from "@shared/canonical";
import { HISTORY_LIMITS } from "@shared/history/bodies";
import { eventIdOf, signEvent, signWsAuth } from "@shared/history/sign";
import type { LogEntry, StoredEvent, UnsignedEventOf } from "@shared/history/types";
import { FRAME_MAX_BYTES } from "@shared/worldProtocol";
import { type Endpoint, ProbeSocket } from "./probeSocket";
import type { Steps } from "./probeSteps";
import {
  freshKey,
  genesisBody,
  iso,
  LocalWorld,
  noteBody,
  type ProbeKey,
  sign,
  witnessBody,
} from "./probeWorld";

/** A world id nobody attached. */
const NOBODY = `h${"a".repeat(52)}`;

/** A `close` frame padded with JSON whitespace to exactly `bytes` bytes. */
function paddedClose(bytes: number): string {
  const text = JSON.stringify({ t: "close", world: NOBODY });
  return text + " ".repeat(bytes - text.length);
}

/** An event whose id is its content but whose kind or format this build does not know. */
function foreign(world: string, author: ProbeKey, change: Record<string, unknown>): StoredEvent {
  const unsigned: Record<string, unknown> = {
    v: 1,
    world,
    kind: "note",
    author: author.key,
    at: iso(),
    seen: 0,
    body: noteBody("from elsewhere"),
    ...change,
  };
  return { ...unsigned, id: eventIdOf(unsigned), sig: "A".repeat(86) };
}

async function violations(endpoint: Endpoint, steps: Steps): Promise<void> {
  const me = freshKey();
  const violation = async (
    step: string,
    expect: string | readonly string[],
    send: (socket: ProbeSocket) => void,
    auth = true,
  ): Promise<void> => {
    const socket = await ProbeSocket.connect(endpoint, me, auth);
    steps.check(step, expect, await socket.violation(() => send(socket)));
    await socket.close();
  };
  await violation("a frame that is not JSON", "frame-not-json", (s) => s.sendRaw("{not json"));
  await violation("an unknown message (t: delete)", "frame-invalid", (s) =>
    s.sendRaw(JSON.stringify({ t: "delete", world: NOBODY })),
  );
  await violation("a known message with an unknown field", "frame-invalid", (s) =>
    s.sendRaw(JSON.stringify({ t: "close", world: NOBODY, extra: 1 })),
  );
  await violation("a binary frame", "frame-binary", (s) => s.sendRaw(new Uint8Array([1, 2, 3])));
  // Bun's maxPayloadLength equals FRAME_MAX_BYTES, so Bun itself may drop the frame and close with
  // 1009 before the service's reader sees it; either way nothing is acted on and the socket ends.
  await violation(
    `a frame of FRAME_MAX_BYTES + 1 = ${FRAME_MAX_BYTES + 1} bytes`,
    ["frame-too-large", "close:1009"],
    (s) => s.sendRaw(paddedClose(FRAME_MAX_BYTES + 1)),
  );
  const edge = await ProbeSocket.connect(endpoint, me);
  edge.sendRaw(paddedClose(FRAME_MAX_BYTES));
  steps.check(
    `a frame of exactly FRAME_MAX_BYTES = ${FRAME_MAX_BYTES} bytes is read, not refused (control: the next open is answered)`,
    "world-unknown",
    await edge.open(NOBODY),
  );
  await edge.close();

  await violation(
    "a frame before auth",
    "auth-required",
    (s) => s.send({ t: "close", world: NOBODY }),
    false,
  );
  const other = freshKey();
  await violation(
    "an auth naming this key but signed by another",
    "auth-invalid",
    (s) =>
      s.send({
        t: "auth",
        key: me.key,
        sig: signWsAuth(other.secret, s.challenge.nonce, s.serviceKey),
      }),
    false,
  );
  const elsewhere = await ProbeSocket.connect(endpoint, other, false);
  await violation(
    "an auth over another connection's challenge (a replay)",
    "auth-invalid",
    (s) => s.auth(me.secret, elsewhere.challenge.nonce),
    false,
  );
  await elsewhere.close();
  await violation("a second auth on one connection", "auth-repeated", (s) => s.auth());
}

async function events(endpoint: Endpoint, steps: Steps): Promise<void> {
  const owner = freshKey();
  const socket = await ProbeSocket.connect(endpoint, owner);
  const world = new LocalWorld(owner, genesisBody("Probe frames"));
  steps.require("attach a world (control)", "opened:owner", await socket.attach(world));
  const id = world.id;
  const seen = () => socket.head(id);
  const reject = async (step: string, expect: string, event: StoredEvent) =>
    steps.check(step, expect, await socket.submitOne(id, event));

  const other = freshKey();
  const note = sign(id, "note", noteBody("signed by someone else"), owner, seen());
  const { id: _id, sig: _sig, ...unsigned } = note;
  await reject(
    "an event naming the owner as author, signed by another key",
    "event-sig-invalid",
    signEvent(unsigned as UnsignedEventOf<"note">, other.secret),
  );
  const honest = sign(id, "note", noteBody("the words the owner signed"), owner, seen());
  await reject("an event changed after signing (forged id)", "event-id-mismatch", {
    ...honest,
    body: { ...honest.body, text: "words the owner never signed" },
  });
  await reject(
    "an event another key signed, submitted over this connection",
    "event-not-yours",
    sign(id, "note", noteBody("not mine"), other, seen()),
  );
  await reject(
    "an event of a kind this build does not know",
    "event-kind-unknown",
    foreign(id, owner, { kind: "teleport" }),
  );
  await reject(
    "an event of a format this build does not know (v: 2)",
    "event-version-unknown",
    foreign(id, owner, { v: 2 }),
  );
  const huge = sign(id, "note", noteBody("x".repeat(HISTORY_LIMITS.eventBytes)), owner, seen());
  await reject(
    `an event over ${HISTORY_LIMITS.eventBytes} bytes of canonical JSON (${canonicalJson(huge).length} bytes)`,
    "event-too-large",
    huge,
  );
  await reject(
    `a note of ${HISTORY_LIMITS.noteChars + 1} characters`,
    "event-invalid",
    sign(id, "note", noteBody("y".repeat(HISTORY_LIMITS.noteChars + 1)), owner, seen()),
  );
  await reject(
    "an event of another world",
    "event-wrong-world",
    sign(NOBODY, "note", noteBody("elsewhere"), owner, 0),
  );
  await reject(
    "an event claiming to have seen entries that do not exist",
    "event-seen-future",
    sign(id, "note", noteBody("from the future"), owner, seen() + 100),
  );
  const witness = witnessBody(3, 0, "Probe Ford", [{ id: "ada", name: "Ada" }]);
  await reject(
    "a witness whose Scene program does not parse (the service runs the DSL verdict)",
    "witness-scene-invalid",
    sign(id, "witness", { ...witness, scene: "root = Scene(" }, owner, seen()),
  );
  await reject(
    "a witness whose index does not say what its programs say",
    "witness-index-mismatch",
    sign(
      id,
      "witness",
      { ...witness, index: { ...witness.index, name: "Elsewhere" } },
      owner,
      seen(),
    ),
  );
  await reject(
    "a note from the owner, after every refusal above (control: the socket stayed open)",
    "accepted",
    sign(id, "note", noteBody("still here"), owner, seen()),
  );

  const flood = socket.mark();
  for (let index = 0; index < 40; index += 1) socket.send({ t: "close", world: NOBODY });
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  const codes = socket.frames
    .slice(flood)
    .flatMap((frame) => (frame.t === "refused" ? [frame.error.code] : []));
  steps.check(
    "40 frames at once: one quota-frames refusal, the socket stays open",
    "quota-frames",
    `${codes.join(",") || "nothing"}${socket.closed === null ? "" : `+close:${socket.closed.code}`}`,
  );
  steps.check(
    "after the flood the connection still works (control)",
    "accepted",
    await socket.submitOne(id, sign(id, "note", noteBody("after the flood"), owner, seen())),
  );
}

/** Forged attach uploads (D2): each is refused whole, and nothing of it is stored. */
async function uploads(endpoint: Endpoint, steps: Steps): Promise<void> {
  const owner = freshKey();
  const socket = await ProbeSocket.connect(endpoint, owner);
  const made = () => {
    const world = new LocalWorld(owner, genesisBody("Probe upload"));
    world.write("profile", { name: "Probe owner" });
    world.write("note", noteBody("uploaded"));
    return world;
  };
  const control = made();
  steps.require("attach a world (control)", "opened:owner", await socket.attach(control));
  const clock = socket.lastRt(control.id);
  const forge = async (step: string, expect: string, world: LocalWorld, entries: LogEntry[]) => {
    const sequencer = world.sequencer(socket.serviceKey, endpoint.url);
    steps.check(step, expect, await socket.upload(world.id, entries, sequencer));
  };
  const tampered = (world: LocalWorld, n: number, change: (entry: LogEntry) => LogEntry) =>
    world.entries.map((entry) => (entry.n === n ? change(entry) : entry));

  const theirs = new LocalWorld(freshKey(), genesisBody("Probe someone else's"));
  await forge("an upload of a world another key made", "attach-not-owner", theirs, theirs.entries);
  const headless = made();
  await forge(
    "an upload that does not start with the genesis",
    "attach-no-genesis",
    headless,
    headless.entries.slice(1),
  );
  const broken = made();
  await forge(
    "an upload whose chain is cut at entry 2",
    "entry-chain-broken",
    broken,
    tampered(broken, 2, (entry) => ({ ...entry, chain: `sha256:${"0".repeat(64)}` })),
  );
  const forged = made();
  await forge(
    "an upload whose entry 2 was changed after signing (forged id)",
    "event-id-mismatch",
    forged,
    tampered(forged, 2, (entry) => ({
      ...entry,
      event: { ...entry.event, body: { name: "Forged" } },
    })),
  );
  const receipted = made();
  await forge(
    "an upload whose entry 2 carries a receipt",
    "entry-rsig-unexpected",
    receipted,
    tampered(receipted, 2, (entry) => ({ ...entry, rsig: "A".repeat(86) })),
  );
  const foreignSeq = made();
  const elsewhere = foreignSeq.sequencer(freshKey().key, endpoint.url);
  steps.check(
    "an upload whose sequencer names another service's key",
    "attach-sequencer-key",
    await socket.upload(foreignSeq.id, foreignSeq.entries, elsewhere),
  );
  const ahead = new LocalWorld(owner, genesisBody("Probe from the future"), {
    rtFromMs: clock + 3_600_000,
  });
  await forge(
    "an upload whose last receipt time is an hour ahead of the service's clock",
    "attach-rt-future",
    ahead,
    ahead.entries,
  );
  steps.check(
    "none of the refused uploads was stored (open the forged-chain one)",
    "world-unknown",
    await socket.open(broken.id),
  );
}

/** D9: at most `OPEN_WORLDS` worlds open on one connection, however they were opened. */
const OPEN_WORLDS = 8;

async function openWorlds(endpoint: Endpoint, steps: Steps): Promise<void> {
  const owner = freshKey();
  const attaching = await ProbeSocket.connect(endpoint, owner);
  const spare = await ProbeSocket.connect(endpoint, owner);
  const ids: string[] = [];
  let attached = 0;
  for (let index = 0; index < OPEN_WORLDS; index += 1) {
    const world = new LocalWorld(owner, genesisBody(`Probe open ${index + 1}`));
    if ((await attaching.attach(world)) === "opened:owner") attached += 1;
    ids.push(world.id);
  }
  const ninth = new LocalWorld(owner, genesisBody(`Probe open ${OPEN_WORLDS + 1}`));
  steps.require(
    `attach ${OPEN_WORLDS} worlds on one connection and one more on another (control)`,
    "opened:owner",
    attached === OPEN_WORLDS ? await spare.attach(ninth) : `${attached} attached`,
  );
  ids.push(ninth.id);
  const reader = await ProbeSocket.connect(endpoint, owner);
  const answers: string[] = [];
  for (const id of ids) answers.push(await reader.open(id));
  steps.check(
    `open ${OPEN_WORLDS + 1} worlds on one connection: the last one`,
    "quota-open-worlds",
    answers.at(-1) ?? "none",
    `${answers.filter((answer) => answer === "opened:owner").length} opened`,
  );
  const extra = new LocalWorld(owner, genesisBody(`Probe open ${OPEN_WORLDS + 2}`));
  steps.check(
    `attach a world on the connection that already has ${OPEN_WORLDS} open (by attaching)`,
    "quota-open-worlds",
    await attaching.attach(extra),
  );
  for (const socket of [attaching, spare, reader]) await socket.close();
}

export async function framesScenario(endpoint: Endpoint, steps: Steps): Promise<void> {
  const started = Date.now();
  const idle = await ProbeSocket.connect(endpoint, freshKey(), false);
  await violations(endpoint, steps);
  await events(endpoint, steps);
  await uploads(endpoint, steps);
  await openWorlds(endpoint, steps);
  const closed = await idle.untilClosed(Math.max(1, 15_000 - (Date.now() - started)));
  const refusal = idle.frames.find((frame) => frame.t === "refused");
  steps.check(
    "a socket that never authenticates is closed (auth timeout, 10 s)",
    "auth-timeout",
    refusal?.t === "refused"
      ? refusal.error.code
      : closed === null
        ? "left-open"
        : `close:${closed.code}`,
    `closed after ${((Date.now() - started) / 1000).toFixed(1)} s`,
  );
}
