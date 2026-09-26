// The world probe (rev 6 phase 3, D10): an adversarial client that talks to a running world service
// over its real WebSocket and HTTP with throwaway Ed25519 keys, to prove the service refuses what
// main would already block. It is its own test (Rule 0): each scenario prints one JSON line per
// step — {scenario, step, expect, got, ok} — and a summary line, and the process exits non-zero if
// any step did not get its expected refusal (or, for a control step, its expected acceptance).
//
//   UNMAPPED_SERVICE_TEST=1 bun run service -- --port 8787 --data "$TMPDIR/svc"
//   bun run world:probe -- --service ws://127.0.0.1:8787 <scenario> [options]
//
//   physics | protocol | frames | door | rumors     one scenario (self-contained, fresh keys)
//   all                                            the five above, in that order
//   join --link <unmapped://join?…> --key-file <path> [--name <name>]
//                                                  redeem an invite as a probe key, written to <path>
//   rumors --world <id> --key-file <path> [--advance <days>]
//                                                  the rumor refusals on an existing world, as that
//                                                  member key (one `join` wrote)
//   door [--visitor-key-events <n>] [--new-visitor-keys <n>]
//                                                  the service's visitor flags, if not the defaults
//
// `door` and `rumors` move the service's test clock (POST /v1/test/advance, UNMAPPED_SERVICE_TEST=1)
// by one day each. Keys are made in memory; the only key file read is one this probe wrote.
//
// What each scenario must catch if the service regresses (the steps below name these):
//
// physics (D18)
//   P1. A genesis pinned to a physics version the service does not reproduce is attached, stored
//       or served, instead of refused `physics-newer` (and never stored: a later open finds nothing).
//   P2. An `open` whose physics list lacks the world's version is served instead of `physics-newer`.
//
// protocol (phase 4 D5–D6, world protocol 2)
//   R1. A protocol-1 client opens a world that holds co-owner kinds (`owner.add`) or a chain opt-in
//       (`chain`) and would fold it differently, instead of `protocol-newer`.
//   R2. A protocol-1 reader already subscribed keeps receiving entries after a co-owner is added.
//   R3. A protocol above the service's is served instead of `protocol-unsupported`.
//
// frames (D2, D5, D9)
//   F1. A malformed frame is acted on or leaves the socket open: not JSON, an unknown message or
//       field, binary, over FRAME_MAX_BYTES; or a frame of exactly FRAME_MAX_BYTES is refused.
//   F2. A socket acts before auth, accepts a forged or replayed auth or a second one, or is never
//       closed when it does not authenticate within the auth timeout.
//   F3. An event is sequenced with a bad signature, a forged id (content changed after signing),
//       another key's signature over this connection, an unknown kind or format, over 128 KiB, a
//       body its schema refuses, another world, a `seen` beyond the head, or a program the DSL
//       refuses (the service must run the verdict, not only the signature check).
//   F4. A refused event closes the socket; a flood closes it or is answered frame by frame.
//   F5. A forged attach upload is stored: a world another key made, one without its genesis, a cut
//       chain, an entry changed after signing, an uploaded receipt, a sequencer naming another
//       service, or receipt times more than 300 s ahead of the service's clock.
//   F6. One connection holds more than 8 open worlds, by opening or by attaching them.
//
// door (D8, D9)
//   D1. A friends world is read without an invite.
//   D2. A proof copied from a logged `member.join` admits another key (`invite-proof-invalid`, at
//       the open and in a `member.join`), or another key's signed join is taken over this socket.
//   D3. A forged invite, one by a non-owner, an expired, a used-up or a revoked one admits a key,
//       at the open or in a `member.join`.
//   D4. A visitor in a public world cannot leave a note, signpost or profile — or can claim or
//       write a `witness`.
//   D5. The visitor limits fail: a visitor key writes past its daily share (`quota-visitor-key`),
//       more new visitor keys than the cap come from one address (`quota-visitor-keys`), a key
//       already known is counted as new, or a member is refused because visitors spent theirs.
//   D6. A removed member keeps reading or reopens, its past events leave the log, or a member or a
//       visitor reads a private world.
//
// rumors (D13, D14)
//   U1. A rumor is sequenced that does not name its slot's cited label (`rumor-uncited`), names a
//       known label its slot does not allow (`rumor-names-other`), is for a slot the beat did not
//       open (`rumor-slot-unknown`) or a beat the world never had (`rumor-beat-unknown`).
//   U2. A visitor's rumor is sequenced (`access-visitor-kind`).
//   U3. A valid rumor from a member is refused, or does not stand in the fold; a second variant of
//       one slot by one author is taken (`quota-variant`).
//   U4. The service's beat does not equal the recomputation over the log it served, or that log's
//       chain or receipts do not verify.
//
// every scenario
//   A frame the service sends does not read with `readFromService` (main would drop the service).

import { DEFAULT_DOOR_LIMITS, doorScenario } from "./lib/probeDoor";
import { framesScenario } from "./lib/probeFrames";
import { joinScenario, rumorsScenario } from "./lib/probeRumors";
import { closeAll, type Endpoint, endpointOf } from "./lib/probeSocket";
import { Steps } from "./lib/probeSteps";
import { physicsScenario, protocolScenario } from "./lib/probeVersions";

const USAGE =
  "Usage: bun run world:probe -- --service ws://127.0.0.1:8787 " +
  "<physics|protocol|frames|door|rumors|all|join> [options] (see scripts/world-probe.ts)";

const args = process.argv.slice(2).filter((arg) => arg !== "--");

function option(name: string): string | null {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (index < 0) return null;
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} needs a value.`);
  return value;
}

function count(name: string, fallback: number): number {
  const text = option(name);
  if (text === null) return fallback;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a whole number ≥ 1.`);
  return value;
}

type Scenario = (endpoint: Endpoint, steps: Steps) => Promise<void>;

function scenarios(): Record<string, Scenario> {
  const door = {
    visitorKeyEvents: count("--visitor-key-events", DEFAULT_DOOR_LIMITS.visitorKeyEvents),
    newVisitorKeys: count("--new-visitor-keys", DEFAULT_DOOR_LIMITS.newVisitorKeys),
  };
  const advanceText = option("--advance");
  const rumors = {
    world: option("--world"),
    keyFile: option("--key-file"),
    advanceDays: advanceText === null ? null : count("--advance", 1),
  };
  return {
    physics: physicsScenario,
    protocol: protocolScenario,
    frames: framesScenario,
    door: (endpoint, steps) => doorScenario(endpoint, steps, door),
    rumors: (endpoint, steps) => rumorsScenario(endpoint, steps, rumors),
    join: (endpoint, steps) => {
      const link = option("--link");
      const keyFile = option("--key-file");
      if (link === null || keyFile === null) throw new Error("join needs --link and --key-file.");
      return joinScenario(endpoint, steps, {
        link,
        keyFile,
        name: option("--name") ?? "World probe",
      });
    },
  };
}

const ALL = ["physics", "protocol", "frames", "rumors", "door"];

async function run(name: string, scenario: Scenario, endpoint: Endpoint): Promise<boolean> {
  const steps = new Steps(name);
  try {
    await scenario(endpoint, steps);
  } catch (error) {
    steps.broke(error);
  }
  const { unreadable } = await closeAll();
  steps.check(
    "every frame the service sent reads with readFromService",
    "0 unreadable",
    `${unreadable.length} unreadable`,
    unreadable.length === 0 ? undefined : unreadable.slice(0, 3).join(" | "),
  );
  return steps.summary();
}

async function main(): Promise<number> {
  const service = option("--service");
  const known = scenarios();
  const named = args.find(
    (arg, index) => !arg.startsWith("--") && !args[index - 1]?.startsWith("--"),
  );
  if (service === null || named === undefined || (named !== "all" && known[named] === undefined)) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  const endpoint = endpointOf(service);
  let ok = true;
  for (const name of named === "all" ? ALL : [named]) {
    const scenario = known[name];
    if (scenario !== undefined) ok = (await run(name, scenario, endpoint)) && ok;
  }
  return ok ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(
      `world probe: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(2);
  },
);
