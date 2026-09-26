// The `physics` and `protocol` scenarios of scripts/world-probe.ts (rev 6 phase 3 D18; phase 4
// D5–D6 raised the world protocol to 2): a world the service cannot reproduce, or cannot serve to
// an older client, is refused at the door — never stored, never streamed.

import { PHYSICS_SUPPORTED } from "@shared/physics";
import { WORLD_PROTOCOL } from "@shared/worldProtocol";
import { type Endpoint, health, ProbeSocket } from "./probeSocket";
import type { Steps } from "./probeSteps";
import { freshKey, genesisBody, LocalWorld, sign } from "./probeWorld";

/** The client protocol from before co-owners and the chain opt-in (phase 3). */
const PROTOCOL_ONE = 1;

export async function physicsScenario(endpoint: Endpoint, steps: Steps): Promise<void> {
  const served = (await health(endpoint)).physics;
  const newer = Math.max(...served, ...PHYSICS_SUPPORTED) + 1;
  const owner = freshKey();
  const socket = await ProbeSocket.connect(endpoint, owner);

  const unknown = new LocalWorld(
    owner,
    genesisBody("Probe physics newer", { physicsVersion: newer }),
  );
  steps.check(
    `attach a fresh genesis pinned to physics ${newer}`,
    "physics-newer",
    await socket.attach(unknown),
    `the service reproduces physics ${served.join(", ")}`,
  );
  steps.check(
    "the refused world was not stored (open it)",
    "world-unknown",
    await socket.open(unknown.id),
  );

  const [pinned = 1] = served;
  const world = new LocalWorld(owner, genesisBody("Probe physics", { physicsVersion: pinned }));
  steps.require(
    `attach a genesis pinned to physics ${pinned} (control)`,
    "opened:owner",
    await socket.attach(world),
  );
  const reader = await ProbeSocket.connect(endpoint, owner);
  steps.check(
    `open with physics [${newer}], which lacks the world's ${pinned}`,
    "physics-newer",
    await reader.open(world.id, { physics: [newer] }),
  );
  steps.check(
    `open with physics [${pinned}, ${newer}] (control)`,
    "opened:owner",
    await reader.open(world.id, { physics: [pinned, newer] }),
  );
}

export async function protocolScenario(endpoint: Endpoint, steps: Steps): Promise<void> {
  const owner = freshKey();
  const socket = await ProbeSocket.connect(endpoint, owner);
  const world = new LocalWorld(owner, genesisBody("Probe protocol"));
  world.write("profile", { name: "Probe owner" });
  steps.require("attach a world (control)", "opened:owner", await socket.attach(world));

  const old = await ProbeSocket.connect(endpoint, owner);
  steps.require(
    "a protocol-1 open of a world without co-owner kinds (control)",
    "opened:owner",
    await old.open(world.id, { protocol: PROTOCOL_ONE }),
  );
  const pushed = old.mark();
  const coOwner = freshKey();
  const add = sign(world.id, "owner.add", { key: coOwner.key }, owner, socket.head(world.id));
  steps.require(
    "the owner adds a co-owner (owner.add)",
    "accepted",
    await socket.submitOne(world.id, add),
  );
  const dropped = await old.until(
    (frame) => (frame.t === "refused" && frame.world === world.id ? frame.error.code : undefined),
    pushed,
  );
  steps.check(
    "the protocol-1 reader already open is dropped when owner.add is sequenced",
    "protocol-newer",
    dropped ?? old.silence(),
  );
  const late = await ProbeSocket.connect(endpoint, owner);
  steps.check(
    "a protocol-1 open of a world that holds owner.add",
    "protocol-newer",
    await late.open(world.id, { protocol: PROTOCOL_ONE }),
  );
  steps.check(
    `a protocol-${WORLD_PROTOCOL} open of it (control)`,
    "opened:owner",
    await late.open(world.id, { protocol: WORLD_PROTOCOL }),
  );
  const co = await ProbeSocket.connect(endpoint, coOwner);
  steps.check(
    "the co-owner's protocol-1 open",
    "protocol-newer",
    await co.open(world.id, { protocol: PROTOCOL_ONE }),
  );
  steps.check(
    `the co-owner's protocol-${WORLD_PROTOCOL} open (control)`,
    "opened:owner",
    await co.open(world.id),
  );
  steps.check(
    `an open speaking protocol ${WORLD_PROTOCOL + 1}, which the service does not`,
    "protocol-unsupported",
    await late.open(world.id, { protocol: WORLD_PROTOCOL + 1 }),
  );

  const opted = new LocalWorld(owner, genesisBody("Probe chain opt-in"));
  steps.require("attach a second world (control)", "opened:owner", await socket.attach(opted));
  const chain = sign(opted.id, "chain", { record: true }, owner, socket.head(opted.id));
  steps.require(
    "the owner opts it into the chain",
    "accepted",
    await socket.submitOne(opted.id, chain),
  );
  steps.check(
    "a protocol-1 open of a world that holds a chain opt-in",
    "protocol-newer",
    await late.open(opted.id, { protocol: PROTOCOL_ONE }),
  );
}
