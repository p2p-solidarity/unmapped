// E2E setup for the browser proof (rev 6 phase 4, D7, p4-browser) without the desktop app: a small
// world made with a throwaway owner key and attached to a world service exactly as the desktop's
// `world.attach` does (local entries with null receipts, then the owner's `sequencer` in the last
// `attach` frame), plus owner invites and owner notes.
//
// The world plays on the shipped built-in revision (`aether-land-1.3.0.json`, the one New Game
// starts on): the script validates it as the app installs it (`prepare`), packs it reproducibly as
// main does (`packCartridgeReproducibly`), checks that `unpackCartridge` reads the pack back as that
// exact revision, uploads it by hash (`PUT /v1/worlds/<id>/blobs/<hex>`, signed by the owner) and
// only then announces it with a `pack` event, so a browser can draw the land. The desktop can join
// the same world (it ships 1.3.0). Its seed is a fresh seed code unless `--seed` names one.
//
// The one witnessed chunk is the DSL's own worked example (`CHUNK_EXAMPLE`, the program the prompts
// teach with), kept from the first pass so the "places witnessed" list has an entry; the script
// writes no other place and no scene of its own.
//
//   bun --tsconfig-override tsconfig.node.json scripts/seed-shared-world.ts make \
//     --service ws://127.0.0.1:8799 --out <dir> [--name "Glass Harbor"] [--seed ABCD2345]
//   … invite --out <dir> [--uses 1] [--days 7]      → prints another invite link
//   … note --out <dir> --text "…"                   → the owner leaves a note (a live-sync check)
//   … remove --out <dir> --key <k…>                 → the owner removes that member's key
//
// <dir>/owner.json holds the owner's secret: keep <dir> in a scratch directory.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CHUNK_EXAMPLE,
  parseChunk,
  serializeDialogue,
  serializeErrands,
  serializeScene,
  witnessIndexOf,
} from "@dsl/index";
import type { CartridgeRevision, ContentHash } from "@shared/cartridge";
import { unpackCartridge } from "@shared/cartridgePack";
import { inviteLink } from "@shared/history/access";
import { base32, base64Url, fromBase64Url } from "@shared/history/ids";
import { type LogCursor, logStart, sequenceEvent } from "@shared/history/log";
import {
  authorKeyFor,
  blobAuthHeader,
  newSecretKey,
  signEvent,
  signInvite,
  signWsAuth,
} from "@shared/history/sign";
import type {
  EventBodies,
  EventKind,
  GenesisEvent,
  LogEntry,
  StoredEvent,
  UnsignedEventOf,
  WitnessBody,
} from "@shared/history/types";
import { sha256 } from "@shared/integrity";
import { PHYSICS_SUPPORTED, PHYSICS_VERSION } from "@shared/physics";
import { randomSeedCode } from "@shared/seedCode";
import {
  type FromService,
  readFromService,
  type ToService,
  WORLD_PROTOCOL,
} from "@shared/worldProtocol";
import { publishCartridgeInputSchema } from "../src/main/cartridges/schemas";
import { prepare } from "../src/main/cartridges/validate-revision";
import aetherLand from "../src/main/game/aether-land-1.3.0.json";
import { blobPathOf, httpBase } from "../src/main/histories/blobClient";
import { packCartridgeReproducibly } from "../src/main/histories/packs";

const argv = process.argv.slice(2);
const command = argv[0] ?? "";
function flag(name: string, fallback?: string): string {
  const at = argv.indexOf(`--${name}`);
  const value = at >= 0 ? argv[at + 1] : undefined;
  if (value !== undefined) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`--${name} is required`);
}

interface Owner {
  secret: string;
  world: string;
  url: string;
}

const iso = (ms: number) => new Date(ms).toISOString();
const ownerFile = () => join(flag("out"), "owner.json");

function readOwner(): { secret: Uint8Array; world: string; url: string } {
  const owner = JSON.parse(readFileSync(ownerFile(), "utf8")) as Owner;
  const secret = fromBase64Url(owner.secret);
  if (secret === null) throw new Error("owner.json does not hold a key");
  return { secret, world: owner.world, url: owner.url };
}

/** One authenticated socket to the service, with every frame it sends kept for `until`. */
async function connect(url: string, secret: Uint8Array) {
  const ws = new WebSocket(`${url.replace(/\/+$/, "")}/v1/ws`);
  const frames: FromService[] = [];
  const waiting: Array<() => void> = [];
  ws.addEventListener("message", (message) => {
    const read = readFromService(String(message.data));
    if (!read.ok) throw new Error(`service frame: ${read.error.message}`);
    frames.push(read.value);
    for (const wake of waiting.splice(0)) wake();
  });
  const until = async <T extends FromService>(match: (frame: FromService) => frame is T) => {
    const deadline = Date.now() + 15_000;
    for (;;) {
      const hit = frames.find(match);
      if (hit !== undefined) return hit;
      const refused = frames.find((frame) => frame.t === "refused" || frame.t === "rejected");
      if (refused !== undefined) throw new Error(`service: ${JSON.stringify(refused)}`);
      if (Date.now() > deadline) throw new Error("service did not answer in time");
      await new Promise<void>((resolve) => {
        waiting.push(resolve);
        setTimeout(resolve, 250);
      });
    }
  };
  const challenge = await until((frame): frame is Extract<FromService, { t: "challenge" }> => {
    return frame.t === "challenge";
  });
  const send = (message: ToService) => ws.send(JSON.stringify(message));
  send({
    t: "auth",
    key: authorKeyFor(secret),
    sig: signWsAuth(secret, challenge.nonce, challenge.key),
  });
  return { ws, frames, until, send, serviceKey: challenge.key };
}

function witnessBody(cx: number, cz: number): WitnessBody {
  const draft = parseChunk(CHUNK_EXAMPLE, {
    coord: { cx, cz },
    biome: "countryside",
    ground: "grass",
    hole: null,
    lore: [],
    language: "en",
  });
  if (!draft.ok) throw new Error(`CHUNK_EXAMPLE: ${draft.error.message}`);
  const { scene, dialogues, errands, keepsakes, lore } = draft.value;
  const programs = {
    cx,
    cz,
    scene: serializeScene(scene),
    dialogues: Object.fromEntries(dialogues.map((d) => [d.npcId, serializeDialogue(d)])),
    ...(errands.length === 0 ? {} : { errands: serializeErrands({ errands, keepsakes }) }),
  };
  const index = witnessIndexOf(programs);
  if (!index.ok) throw new Error(`witness index: ${index.error.message}`);
  return { ...programs, lore, index: index.value };
}

/** The shipped 1.3.0 revision as the app installs it, and its reproducible pack, read back. */
function builtInPack(): { revision: CartridgeRevision; bytes: Uint8Array; hash: ContentHash } {
  const input = publishCartridgeInputSchema.safeParse(aetherLand);
  if (!input.success) throw new Error(`aether-land-1.3.0.json: ${input.error.issues[0]?.message}`);
  const revision = prepare(input.data);
  if (!revision.ok) throw new Error(`aether-land-1.3.0.json: ${revision.error.message}`);
  const bytes = packCartridgeReproducibly(revision.value);
  if (!bytes.ok) throw new Error(`pack: ${bytes.error.message}`);
  const back = unpackCartridge(bytes.value);
  const manifest = revision.value.manifest;
  if (!back.ok || back.value.manifest.contentHash !== manifest.contentHash) {
    throw new Error(`the pack does not read back as ${manifest.cartridgeId}@${manifest.version}`);
  }
  return { revision: revision.value, bytes: bytes.value, hash: sha256(bytes.value) };
}

/** Stores the pack on the service by its hash, as the owner (`PUT …/blobs/<hex>`, signed). */
async function uploadPack(url: string, world: string, secret: Uint8Array, bytes: Uint8Array) {
  const hash = sha256(bytes);
  const path = blobPathOf(world, hash);
  const ts = Math.floor(Date.now() / 1000);
  const response = await fetch(`${httpBase(url)}${path}`, {
    method: "PUT",
    headers: {
      "X-Unmapped-Auth": blobAuthHeader(secret, { method: "PUT", path, ts, body: bytes }),
      "Content-Type": "application/octet-stream",
    },
    body: new Uint8Array(bytes),
  });
  if (!response.ok) throw new Error(`blob upload: ${response.status} ${await response.text()}`);
}

async function make(): Promise<void> {
  const url = flag("service");
  const name = flag("name", "Glass Harbor");
  const pack = builtInPack();
  const { cartridgeId, version, contentHash } = pack.revision.manifest;
  const owner = newSecretKey();
  const author = authorKeyFor(owner);
  const start = Date.now() - 60_000;
  const genesis: GenesisEvent = signEvent(
    {
      v: 1,
      world: "",
      kind: "genesis",
      author,
      at: iso(start),
      seen: 0,
      body: {
        name,
        cartridge: { cartridgeId, version, contentHash },
        seed: flag("seed", randomSeedCode()),
        language: "en",
        physicsVersion: PHYSICS_VERSION,
        createdAt: iso(start),
        access: "friends",
        // As the desktop's genesis names them (dsl/history/migrate.ts): the story's gates.
        gates: (pack.revision.story?.episodes ?? []).map(({ id, cx, cz }) => ({ id, cx, cz })),
        from: { instanceId: `e2e-browser-proof-${start}` },
      },
    },
    owner,
  );
  const entries: LogEntry[] = [];
  let cursor: LogCursor = logStart(genesis.id);
  const add = (event: StoredEvent, ms: number) => {
    const entry = sequenceEvent(cursor, event, iso(ms), null);
    cursor = { n: entry.n, chain: entry.chain, rt: entry.rt };
    entries.push(entry);
  };
  const write = <K extends EventKind>(kind: K, body: EventBodies[K], ms: number) => {
    const unsigned = { v: 1, world: genesis.id, kind, author, at: iso(ms), seen: cursor.n, body };
    add(signEvent(unsigned as UnsignedEventOf<K>, owner), ms);
  };
  add(genesis, start);
  write("profile", { name: flag("owner-name", "Mira") }, start + 1_000);
  const witness = witnessBody(1, 0);
  write("witness", witness, start + 2_000);
  const anchor = entries[entries.length - 1]?.event.id ?? "";
  write(
    "note",
    {
      coord: { cx: 1, cz: 0, x: 16, z: 16 },
      anchors: [anchor],
      text: flag("note", "The ford is shallow at dawn."),
      contests: null,
      name: flag("owner-name", "Mira"),
    },
    start + 3_000,
  );
  write(
    "signpost",
    {
      coord: { cx: 0, cz: 0, x: 16, z: 20 },
      text: "East to the crossing",
      toward: { cx: 1, cz: 0 },
    },
    start + 4_000,
  );

  const socket = await connect(url, owner);
  const sequencer = signEvent(
    {
      v: 1,
      world: genesis.id,
      kind: "sequencer",
      author,
      at: iso(Date.now()),
      seen: cursor.n,
      body: { url, key: socket.serviceKey },
    },
    owner,
  );
  socket.send({ t: "attach", world: genesis.id, entries, last: true, sequencer });
  const opened = await socket.until(
    (frame): frame is Extract<FromService, { t: "opened" }> =>
      frame.t === "opened" && frame.world === genesis.id,
  );
  // The pack is on the service before any event names it, so no friend is sent to a missing blob.
  await uploadPack(url, genesis.id, owner, pack.bytes);
  const announce = signEvent(
    {
      v: 1,
      world: genesis.id,
      kind: "pack",
      author,
      at: iso(Date.now()),
      seen: opened.head.n,
      body: { cartridge: contentHash, pack: pack.hash, bytes: pack.bytes.length },
    },
    owner,
  );
  socket.send({ t: "submit", world: genesis.id, events: [announce] });
  const packed = await socket.until(
    (frame): frame is Extract<FromService, { t: "entries" }> =>
      frame.t === "entries" && frame.entries.some((entry) => entry.event.id === announce.id),
  );
  socket.ws.close();
  const dir = flag("out");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const record: Owner = { secret: base64Url(owner), world: genesis.id, url };
  writeFileSync(ownerFile(), `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  console.log(`world ${genesis.id} "${name}" attached at ${url}, head ${opened.head.n}`);
  console.log(`cartridge ${cartridgeId}@${version} ${contentHash}, seed ${genesis.body.seed}`);
  console.log(`pack ${pack.hash} (${pack.bytes.length} bytes) announced, head ${packed.head.n}`);
  console.log(`witnessed "${witness.index.name}" at 1,0`);
  printInvite(owner, genesis.id, url);
}

function printInvite(secret: Uint8Array, world: string, url: string): void {
  const inviteSecret = newSecretKey();
  const nonce = base32(crypto.getRandomValues(new Uint8Array(20)));
  const days = Number(flag("days", "7"));
  const invite = signInvite(
    {
      v: 1,
      world,
      svc: url,
      by: authorKeyFor(secret),
      key: authorKeyFor(inviteSecret),
      nonce,
      exp: iso(Date.now() + days * 86_400_000),
      uses: Number(flag("uses", "1")),
    },
    secret,
  );
  console.log(inviteLink(invite, inviteSecret));
}

/** The owner opens the world, submits one event and waits until the service sequences it. */
async function ownerSubmits<K extends EventKind>(kind: K, body: EventBodies[K]) {
  const { secret, world, url } = readOwner();
  const socket = await connect(url, secret);
  socket.send({
    t: "open",
    world,
    have: 0,
    chain: null,
    protocol: WORLD_PROTOCOL,
    physics: [...PHYSICS_SUPPORTED],
  });
  const opened = await socket.until(
    (frame): frame is Extract<FromService, { t: "opened" }> => frame.t === "opened",
  );
  const unsigned = {
    v: 1,
    world,
    kind,
    author: authorKeyFor(secret),
    at: iso(Date.now()),
    seen: opened.head.n,
    body,
  };
  const event = signEvent(unsigned as UnsignedEventOf<K>, secret);
  socket.send({ t: "submit", world, events: [event] });
  const entries = await socket.until(
    (frame): frame is Extract<FromService, { t: "entries" }> =>
      frame.t === "entries" && frame.entries.some((entry) => entry.event.id === event.id),
  );
  socket.ws.close();
  const n = entries.entries.find((entry) => entry.event.id === event.id)?.n;
  return { id: event.id, n, head: entries.head.n };
}

async function note(): Promise<void> {
  const { id, head } = await ownerSubmits("note", {
    coord: { cx: 0, cz: 0, x: 16, z: 16 },
    anchors: [],
    text: flag("text"),
    contests: null,
    name: flag("owner-name", "Mira"),
  });
  console.log(`note ${id} sequenced, head ${head}`);
}

/** The owner removes a member's key (`member.remove`): the service stops serving that key. */
async function remove(): Promise<void> {
  const key = flag("key");
  const { id, n, head } = await ownerSubmits("member.remove", { key });
  console.log(`member.remove ${id} of ${key} sequenced as entry ${n}, head ${head}`);
}

if (command === "make") await make();
else if (command === "invite") {
  const { secret, world, url } = readOwner();
  printInvite(secret, world, url);
} else if (command === "note") await note();
else if (command === "remove") await remove();
else {
  console.error("usage: seed-shared-world.ts make|invite|note|remove --out <dir> [...]");
  process.exit(1);
}
