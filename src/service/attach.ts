// Attaching a local-only world (rev 6 phase 3, D2 "Attach", D9). The owner uploads entries 1..k —
// exactly as its device sequenced them, receipts null — over one or more `attach` frames; the frame
// marked `last` carries the owner's `sequencer` event naming this service's key. The service then
// sequences that event as entry k + 1 = s1 with its own rt (never before rt(k)), keeps n, rt and
// chain of 1..k byte for byte, signs receipts for 1..s1 with its key, writes the log, and answers
// as an `open` would: `opened` (owner) and the whole log with its receipts.
//
// Refused: an upload that does not start with this world's genesis, from anyone but its author;
// physics this build cannot reproduce; a chain, order or rt the upload breaks; an uploaded entry
// with a receipt or an admitted sequencer (a rehost is phase 4); `attach-rt-future` when rt(k) is
// more than 300 s ahead of the service clock; a sequencer naming any other key; over the world size
// or the owner's world count. Attaching again a world the service holds is answered like the first
// attach when the upload and sequencer are exactly what it stored (a retry after a lost answer),
// and refused (`attach-world-exists`) otherwise.

import { admit } from "@shared/history/admit";
import { readEvent } from "@shared/history/event";
import { emptyNow, foldEntries, openGenesis } from "@shared/history/fold";
import { timeMs, utf8Length } from "@shared/history/ids";
import {
  type LogCursor,
  logStart,
  sequenceEvent,
  sequencerKeyOf,
  verifyEntry,
  verifyLog,
  withReceipt,
} from "@shared/history/log";
import { verifyEvent } from "@shared/history/sign";
import type { GenesisEvent, LogEntry } from "@shared/history/types";
import { checkPhysics } from "@shared/physics";
import type { AppError } from "@shared/result";
import { ATTACH_RT_AHEAD_S, FRAME_MAX_BYTES, type ToService } from "@shared/worldProtocol";
import { isoAt } from "./clock";
import type { Hub, Session } from "./hub";
import { newWorld, type ServiceWorld } from "./world";

type AttachFrame = Extract<ToService, { t: "attach" }>;

/** A new world's upload in progress on one connection. */
interface NewUpload {
  kind: "new";
  world: string;
  genesis: GenesisEvent;
  entries: LogEntry[];
  bytes: number;
  cursor: LogCursor;
}

/** The owner attaching again a world this service already holds: only compared, never stored. */
interface ReplayUpload {
  kind: "replay";
  world: string;
  n: number;
}

export type Upload = NewUpload | ReplayUpload;

/** An uploaded line must still fit an `entries` frame once it carries a receipt. */
export const ENTRY_LINE_MAX = FRAME_MAX_BYTES - 4 * 1024;

function fail(hub: Hub, session: Session, world: string, error: AppError): void {
  session.upload = null;
  hub.refuse(session, world, error);
}

function startUpload(hub: Hub, session: Session, frame: AttachFrame): NewUpload | AppError {
  const first = frame.entries[0];
  if (first === undefined || first.n !== 1 || first.event.id !== frame.world) {
    return {
      code: "attach-no-genesis",
      message: "An attach starts with entry 1, the world's genesis.",
      hint: "Upload the whole log from its first line.",
    };
  }
  const genesis = openGenesis(first.event);
  if (!genesis.ok) return genesis.error;
  if (genesis.value.author !== session.key) {
    return {
      code: "attach-not-owner",
      message: "Only the world's owner attaches it.",
      hint: "Attach it from the device that made the world.",
    };
  }
  const physics = checkPhysics(genesis.value.body.physicsVersion);
  if (!physics.ok) return physics.error;
  if (hub.ownedWorlds(genesis.value.author) >= hub.limits.worldsPerOwner) {
    return {
      code: "quota-owner-worlds",
      message: `One owner attaches at most ${hub.limits.worldsPerOwner} worlds here.`,
      hint: "Use another service for more worlds.",
    };
  }
  return {
    kind: "new",
    world: frame.world,
    genesis: genesis.value,
    entries: [],
    bytes: 0,
    cursor: logStart(frame.world),
  };
}

function addEntries(hub: Hub, upload: NewUpload, entries: readonly LogEntry[]): AppError | null {
  for (const entry of entries) {
    const next = verifyEntry(upload.cursor, entry, null);
    if (!next.ok) return next.error;
    const signed = verifyEvent(entry.event);
    if (!signed.ok) {
      return {
        code: signed.error.code,
        message: `Entry ${entry.n}: ${signed.error.message}`,
        hint: "This device's copy of the world was changed; it cannot be attached as it is.",
      };
    }
    if (sequencerKeyOf(entry, upload.world, upload.genesis.author) !== null) {
      return {
        code: "attach-has-sequencer",
        message: "This world was already attached to a service.",
        hint: "Moving a world between services comes later (phase 4).",
      };
    }
    const bytes = utf8Length(JSON.stringify(entry));
    if (bytes > ENTRY_LINE_MAX) {
      return { code: "attach-entry-too-large", message: `Entry ${entry.n} is too large to serve.` };
    }
    upload.bytes += bytes;
    if (upload.bytes > hub.limits.worldBytes) {
      return {
        code: "world-full",
        message: "This world's history is larger than this service takes.",
        hint: "The service operator can raise --world-bytes.",
      };
    }
    upload.entries.push(entry);
    upload.cursor = next.value;
  }
  return null;
}

function finish(
  hub: Hub,
  session: Session,
  upload: NewUpload,
  sequencer: AttachFrame["sequencer"],
): void {
  const id = upload.world;
  const lastRt = upload.cursor.rt;
  if (sequencer === undefined || upload.cursor.n < 1 || lastRt === null) {
    fail(hub, session, id, { code: "attach-no-genesis", message: "Nothing was uploaded." });
    return;
  }
  const read = readEvent(sequencer);
  if (!read.ok) {
    fail(hub, session, id, read.error);
    return;
  }
  const event = read.value;
  if (event.kind !== "sequencer" || event.author !== upload.genesis.author) {
    fail(hub, session, id, {
      code: "attach-sequencer-invalid",
      message: "The last attach frame must carry the owner's sequencer event.",
    });
    return;
  }
  if (event.body.key !== hub.key.key) {
    fail(hub, session, id, {
      code: "attach-sequencer-key",
      message: "The sequencer event names another service's key.",
      hint: "Name the key from this service's challenge.",
    });
    return;
  }
  const verdict = hub.verdict(sequencer);
  if (!verdict.ok) {
    fail(hub, session, id, {
      code: verdict.code,
      message: "The sequencer event failed its checks.",
    });
    return;
  }
  const nowMs = hub.clock.now();
  if (timeMs(lastRt) - nowMs > ATTACH_RT_AHEAD_S * 1000) {
    fail(hub, session, id, {
      code: "attach-rt-future",
      message: "The uploaded history is from more than 300 s in the service's future.",
      hint: "Check this device's clock, then attach again.",
    });
    return;
  }
  const verdicts = upload.entries.map((entry) => hub.verdict(entry.event));
  const now = foldEntries(
    emptyNow(upload.genesis),
    upload.entries.map((entry, index) => ({ entry, verdict: verdicts[index] ?? { ok: true } })),
  );
  const rt = isoAt(Math.max(nowMs, timeMs(lastRt)));
  const admitted = admit(now, event, rt);
  if (!admitted.ok) {
    fail(hub, session, id, admitted.error);
    return;
  }
  const entries = [
    ...upload.entries.map((entry) => withReceipt(entry, hub.key.secret)),
    sequenceEvent(upload.cursor, sequencer, rt, hub.key.secret),
  ];
  const checked = verifyLog(id, entries);
  if (!checked.ok) {
    fail(hub, session, id, checked.error);
    return;
  }
  const world = newWorld(upload.genesis, entries, [...verdicts, verdict], hub.key);
  const written = hub.store.createLog(
    id,
    entries.map((entry) => JSON.stringify(entry)),
  );
  if (!written.ok) {
    fail(hub, session, id, written.error);
    return;
  }
  session.upload = null;
  hub.addWorld(world);
  hub.log(`attached world ${id} (${entries.length} entries)`);
  hub.admitOwner(session, world);
}

/**
 * The owner attaching a world this service already holds (its device may have crashed before it
 * recorded the first attach): every uploaded entry must be the stored one, and the sequencer the
 * stored entry k + 1. Then it is answered like the first attach; anything else is refused.
 */
function replay(hub: Hub, session: Session, world: ServiceWorld, frame: AttachFrame): void {
  const exists: AppError = {
    code: "attach-world-exists",
    message: "This service already holds that world, with another history.",
    hint: "Open it with have 0 to compare, or attach it to another service.",
  };
  if (session.key !== world.owner) {
    fail(hub, session, world.id, exists);
    return;
  }
  const upload = session.upload?.kind === "replay" ? session.upload : null;
  let n = upload?.n ?? 0;
  for (const entry of frame.entries) {
    if (entry.n !== n + 1 || world.chainAt(entry.n) !== entry.chain) {
      fail(hub, session, world.id, exists);
      return;
    }
    n = entry.n;
  }
  session.upload = { kind: "replay", world: world.id, n };
  if (!frame.last) return;
  session.upload = null;
  if (n < 1 || world.entryAt(n + 1)?.event.id !== frame.sequencer?.id) {
    fail(hub, session, world.id, exists);
    return;
  }
  hub.admitOwner(session, world);
}

export function handleAttach(hub: Hub, session: Session, frame: AttachFrame): void {
  const id = frame.world;
  if (session.upload !== null && session.upload.world !== id) {
    fail(hub, session, id, {
      code: "attach-busy",
      message: "Another attach is in progress on this connection.",
      hint: "Finish it first.",
    });
    return;
  }
  const known = hub.worlds.get(id);
  if (known !== undefined) {
    replay(hub, session, known, frame);
    return;
  }
  const held = hub.broken.get(id);
  if (held !== undefined) {
    fail(hub, session, id, held);
    return;
  }
  let upload = session.upload?.kind === "new" ? session.upload : null;
  if (upload === null) {
    const started = startUpload(hub, session, frame);
    if (!("genesis" in started)) {
      fail(hub, session, id, started);
      return;
    }
    upload = started;
  }
  const error = addEntries(hub, upload, frame.entries);
  if (error !== null) {
    fail(hub, session, id, error);
    return;
  }
  session.upload = upload;
  if (frame.last) finish(hub, session, upload, frame.sequencer);
}
