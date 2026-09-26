// Physics is versioned (@shared/physics): a world pins the version it was made on, and a continent
// refuses to merge worlds on different versions. That promise breaks silently when someone changes
// terrain, fight or lore code without bumping the version. What this guards, over many seeds:
//   1. The ground, fords, props and wildlife of the land change (a world's land moves under it).
//   2. A fight formula changes (the same save hits and gets hit differently).
//   3. Lore heat or dungeon generation changes (the same world prompts or plays differently).
//   4. The version is bumped without recording what the new physics produces.
//   5. The beat changes (rev 6 phase 3, D13, D14, D18): care points, the decay table, the fog
//      thresholds, the season length or the rumor slot picker — every client and the world
//      service would fold the same history differently.
//   6. An admit rule starts refusing an entry an earlier build admitted, or admits one it refused
//      (rev 6 phase 4, D5: validators count as physics) — a world's history would fold one way on
//      the old build and another on the new. Co-owners (world protocol 2) must leave every rule
//      over the phase-3 kinds as it was.
// When this fails on purpose: bump PHYSICS_VERSION, keep the old generators reachable for worlds
// pinned to the old one (PHYSICS_SUPPORTED), and record the new fingerprint below.

import { createHash } from "node:crypto";
import { chunkTerrain, groundAt, isFord, wildMonsters } from "@shared/chunks";
import { applyDamage, monsterHp } from "@shared/combat";
import { seedFromText } from "@shared/endless";
import { foeDamage, foeSpeed } from "@shared/foes";
import { BEAT_EVERY_MS, computeBeat } from "@shared/history/beat";
import { HISTORY_LIMITS } from "@shared/history/bodies";
import {
  CARE_POINTS,
  DECAY_PPM,
  FADING_BELOW,
  FOG_CARE_BELOW,
  FOG_QUIET_DAYS,
  FOG_SAFE_RINGS,
  SEASON_DAYS,
  SEASONS,
} from "@shared/history/decay";
import { applyEntry, emptyNow } from "@shared/history/fold";
import { sha256Bytes } from "@shared/history/ids";
import { type LogCursor, logStart, sequenceEvent } from "@shared/history/log";
import {
  RUMOR_KINDS,
  RUMOR_NAME_MIN,
  RUMOR_RINGS,
  RUMOR_SHOW_BEATS,
  RUMOR_WRITE_BEATS,
} from "@shared/history/rumor";
import {
  authorKeyFor,
  signatureVerdict,
  signEvent,
  signInvite,
  signJoinProof,
} from "@shared/history/sign";
import type {
  EventBodies,
  EventKind,
  GenesisEvent,
  StoredEvent,
  UnsignedEventOf,
  WorldNow,
} from "@shared/history/types";
import { activate, type LoreNode, regionalTone } from "@shared/lore";
import { generateMaze } from "@shared/maze";
import { checkPhysics, PHYSICS_SUPPORTED, PHYSICS_VERSION } from "@shared/physics";
import { awardKill, damageAtLevel, levelFor, NEW_RUN } from "@shared/progression";
import type { Tile } from "@shared/world";
import { describe, expect, it } from "vitest";

/** What each physics version produces. Never edit an entry; add one for a new version. */
const RECORDED: Record<number, string> = {
  1: "sha256:3f8a852e7e03aac940620b07964a4e908353b66be0f71af69348ca359d1730f6",
};

/**
 * What each physics version's beat produces: the constants, then care, fog, seasons and rumor
 * slots over scripted histories. Recorded under version 1 when the beat was first defined (no
 * earlier build folded a history). Never edit an entry; add one for a new version (D18).
 */
const BEAT_RECORDED: Record<number, string> = {
  1: "sha256:4fe10b1f0780096109ab86ee9177bdee4788b40504768ae646fdd5affb1c41d4",
};

/**
 * What admit decides over one scripted history of the phase-3 kinds (door, conflicts, spots, quotas,
 * parents, each refused once and admitted once). Recorded under version 1 on the build before the
 * phase-4 owner kinds (HEAD f764630). Never edit an entry; add one for a new version.
 */
const ADMIT_RECORDED: Record<number, string> = {
  1: "sha256:b1ff333be1d8f6b4c10a32d9f8d781d981d827492517016670f5a1dcc2c08344",
};

const SEEDS = [0, 1, 12_345, seedFromText("aether-land"), seedFromText("K7QM-2PXD")];
const COORDS = [
  { cx: 0, cz: 0 },
  { cx: 1, cz: 0 },
  { cx: -1, cz: 2 },
  { cx: 3, cz: -4 },
  { cx: 10, cz: 10 },
];
const BASES: readonly Tile[] = ["grass", "sand", "snow"];

function land(): unknown[] {
  const out: unknown[] = [];
  for (const seed of SEEDS) {
    for (const base of BASES) {
      const origin = { floor: { width: 16, depth: 16, tile: base } };
      for (const coord of COORDS) {
        out.push(chunkTerrain({ seed, coord, origin }), wildMonsters(seed, coord, origin));
      }
      for (let wx = -40; wx <= 40; wx += 7) {
        for (let wz = -40; wz <= 40; wz += 9) out.push(groundAt(seed, wx, wz, base));
      }
    }
  }
  for (let wx = -48; wx <= 48; wx += 3) out.push(isFord(wx, 16), isFord(16, wx), isFord(wx, wx));
  return out;
}

function fights(): unknown[] {
  const out: unknown[] = [];
  const combat = { playerHp: 120, monsterHpBase: 30, monsterHpPerLevel: 6 };
  for (const level of [1, 2, 5, 12, 30]) {
    out.push(monsterHp(combat.monsterHpBase, combat.monsterHpPerLevel, level));
    out.push(foeDamage(combat, level), foeSpeed(level), damageAtLevel(12, level));
    out.push(levelFor(level * 37, 10));
    out.push(
      awardKill(
        NEW_RUN,
        [
          { kind: "score_run", value: 10 },
          { kind: "stat_growth", value: 5 },
        ],
        level,
      ),
    );
  }
  const foe = { id: "a", hp: 40, maxHp: 40, x: 0, z: 0, radius: 0.4, height: 1 };
  out.push(applyDamage(foe, 17.6), applyDamage(foe, 99));
  return out;
}

function loreAndPlaces(): unknown[] {
  const node = (id: string, cx: number, cz: number, links: string[] = []): LoreNode => ({
    id: `${id}@${cx},${cz}`,
    kind: "place",
    label: id,
    text: "",
    coord: { cx, cz },
    links,
    tone: (cx - cz) / 10,
  });
  const graph = [
    node("a", 0, 0),
    node("b", 1, 0, ["a@0,0"]),
    node("c", 3, 3, ["b@1,0"]),
    node("d", -2, 5),
  ];
  const hot = activate(graph, { coord: { cx: 1, cz: 1 }, karma: [] });
  const mazes = SEEDS.map((seed) =>
    generateMaze({
      width: 21,
      depth: 15,
      seed,
      entrance: { x: 1, z: 1 },
      exit: { x: 19, z: 13 },
      braid: 30,
    }),
  );
  return [hot, regionalTone(hot), mazes];
}

function fingerprint(): string {
  const text = JSON.stringify({ land: land(), fights: fights(), more: loreAndPlaces() });
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

const BEATER = sha256Bytes("physics:beater");
const dayAt = (day: number) => new Date(Date.UTC(2026, 0, 1) + day * 86_400_000).toISOString();

/** One owner writes a small land over five months and beats along the way. */
function beatHistory(seed: number): unknown[] {
  const author = authorKeyFor(BEATER);
  const hash = `sha256:${"ef".repeat(32)}` as const;
  const genesis: GenesisEvent = signEvent(
    {
      v: 1,
      world: "",
      kind: "genesis",
      author,
      at: dayAt(0),
      seen: 0,
      body: {
        name: "Fingerprint",
        cartridge: { cartridgeId: "fingerprint", version: "1.0.0", contentHash: hash },
        seed: `seed-${seed}`,
        language: "en",
        physicsVersion: 1,
        createdAt: dayAt(0),
        access: "friends",
        gates: [
          { id: "e1", cx: 4, cz: 0 },
          { id: "e2", cx: -3, cz: 3 },
        ],
        from: { instanceId: `fingerprint-${seed}` },
      },
    },
    BEATER,
  );
  let now: WorldNow = emptyNow(genesis);
  let cursor: LogCursor = logStart(genesis.id);
  const append = (event: StoredEvent, day: number) => {
    const entry = sequenceEvent(cursor, event, dayAt(day), null);
    cursor = { n: entry.n, chain: entry.chain, rt: entry.rt };
    now = applyEntry(now, entry, signatureVerdict(event));
  };
  const put = <K extends EventKind>(kind: K, body: EventBodies[K], day: number) => {
    const unsigned = {
      v: 1,
      world: genesis.id,
      kind,
      author,
      at: dayAt(day),
      seen: now.head.n,
      body,
    };
    const event = signEvent(unsigned as UnsignedEventOf<K>, BEATER);
    append(event, day);
    return event;
  };
  const out: unknown[] = [];
  const beat = (day: number) => {
    const computed = computeBeat(now, dayAt(day));
    out.push(computed.ok ? computed.value : computed.error.code);
    if (computed.ok) put("beat", computed.value.body, day);
  };
  append(genesis, 0);
  let state = seed >>> 0;
  const next = (range: number) => {
    state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
    return (state >>> 8) % range;
  };
  const chunks: { cx: number; cz: number }[] = [];
  for (let index = 0; index < 8; index += 1) {
    const coord = { cx: next(13) - 6, cz: next(13) - 6 };
    chunks.push(coord);
    const npcs = ["ada", "bo", "cy"].slice(0, 1 + next(3));
    put(
      "witness",
      {
        ...coord,
        scene: "S",
        dialogues: Object.fromEntries(npcs.map((id) => [id, "D"])),
        lore: [],
        index: {
          name: `W${index}`,
          npcs: npcs.map((id) => ({ id, name: id, role: "elder" })),
          errands: [],
          keepsakes: [],
        },
      },
      index * 3,
    );
  }
  beat(22);
  for (let index = 0; index < 3; index += 1) {
    const at = { cx: next(13) - 6, cz: next(13) - 6 };
    put("place", { kind: "side", title: `P${index}`, at, seed: index, source: "S" }, 25);
  }
  const lantern = put(
    "chapter",
    { episodeId: "e1", title: "C", more: null, kind: "land", source: "S", seed: 1 },
    26,
  );
  put("deed", { what: "chapter.cleared", ref: lantern.id }, 27);
  const item = {
    id: "i",
    name: "Lamp",
    kind: "charm" as const,
    power: 1,
    perk: "",
    curse: null,
    meshDna: [],
    archetype: [],
    flavor: "",
  };
  put("gift", { coord: { cx: 1, cz: 1, x: 0, z: 0 }, item, for: null, words: "" }, 28);
  for (const day of [30, 37, 44, 51]) put("visit", { chunks: chunks.slice(0, 2) }, day);
  for (const day of [52, 75, 100, 140, 230]) beat(day);
  out.push(now.season, now.touches, now.lastTouch);
  return out;
}

const WRITER = sha256Bytes("physics:writer");
const PASSER = sha256Bytes("physics:passer");
const TICKET = sha256Bytes("physics:ticket");

/** A small land's door and rules over one day: what each event became (live, variant, refused). */
function admitHistory(): unknown {
  const owner = authorKeyFor(BEATER);
  const hash = `sha256:${"cd".repeat(32)}` as const;
  const genesis: GenesisEvent = signEvent(
    {
      v: 1,
      world: "",
      kind: "genesis",
      author: owner,
      at: dayAt(0),
      seen: 0,
      body: {
        name: "Admit",
        cartridge: { cartridgeId: "admit", version: "1.0.0", contentHash: hash },
        seed: "seed-admit",
        language: "en",
        physicsVersion: 1,
        createdAt: dayAt(0),
        access: "friends",
        gates: [{ id: "e1", cx: 4, cz: 0 }],
        from: { instanceId: "admit-1" },
      },
    },
    BEATER,
  );
  let now: WorldNow = emptyNow(genesis);
  let cursor: LogCursor = logStart(genesis.id);
  const append = (event: StoredEvent) => {
    const entry = sequenceEvent(cursor, event, dayAt(1), null);
    cursor = { n: entry.n, chain: entry.chain, rt: entry.rt };
    now = applyEntry(now, entry, signatureVerdict(event));
  };
  const put = <K extends EventKind>(
    kind: K,
    body: EventBodies[K],
    who = BEATER,
    seen = now.head.n,
  ) => {
    const unsigned = {
      v: 1,
      world: genesis.id,
      kind,
      author: authorKeyFor(who),
      at: dayAt(1),
      seen,
    };
    const event = signEvent({ ...unsigned, body } as UnsignedEventOf<K>, who);
    append(event);
    return event;
  };
  const witness = (name: string) => ({
    cx: 2,
    cz: 0,
    scene: "S",
    dialogues: { ada: "D" },
    lore: [],
    index: {
      name,
      npcs: [{ id: "ada", name: "Ada", role: "elder" as const }],
      errands: [],
      keepsakes: [],
    },
  });
  const note = {
    coord: { cx: 1, cz: 1, x: 2, z: 3 },
    anchors: [],
    text: "N",
    contests: null,
    name: "P",
  };
  const side = (cx: number, cz: number) => ({
    kind: "side" as const,
    title: "P",
    at: { cx, cz },
    seed: 1,
    source: "S",
  });
  append(genesis);
  put("note", note, PASSER);
  const invite = signInvite(
    {
      v: 1,
      world: genesis.id,
      svc: "wss://s.example",
      by: owner,
      key: authorKeyFor(TICKET),
      nonce: "abcdefghijklmnop",
      exp: dayAt(30),
      uses: 1,
    },
    BEATER,
  );
  const proof = signJoinProof(TICKET, invite, authorKeyFor(WRITER));
  put("member.join", { invite, name: "Writer", proof }, WRITER);
  put("member.join", { invite, name: "Again", proof }, WRITER);
  put("access", { policy: "public" }, WRITER);
  put("access", { policy: "public" });
  put("note", note, PASSER);
  put("witness", witness("Visitor"), PASSER);
  const seenBefore = now.head.n;
  put("witness", witness("First"), WRITER);
  put("witness", witness("Knew"));
  put("witness", witness("Race"), BEATER, seenBefore);
  put("member.remove", { key: owner });
  put("hide", { id: genesis.id, hidden: true });
  put("place", side(0, 0));
  put("place", side(70, 0));
  put("place", side(3, 3));
  for (let index = 0; index < 4; index += 1) {
    put("signpost", { coord: { cx: 1, cz: 1, x: 0, z: index }, text: "S", toward: null }, PASSER);
  }
  const item = {
    id: "i",
    name: "Lamp",
    kind: "charm" as const,
    power: 1,
    perk: "",
    curse: null,
    meshDna: [],
    archetype: [],
    flavor: "",
  };
  const gift = put("gift", { coord: { cx: 1, cz: 1, x: 5, z: 5 }, item, for: null, words: "" });
  put("gift.take", { gift: gift.id }, PASSER);
  put("gift.take", { gift: gift.id }, WRITER);
  put("visit", { chunks: [{ cx: 2, cz: 0 }] }, PASSER);
  put("visit", { chunks: [{ cx: 2, cz: 0 }] }, PASSER);
  put("deed", { what: "place.crossed", ref: genesis.id });
  const fingerprint = `sha256:${"0".repeat(64)}`;
  put(
    "beat",
    { upTo: now.head.n, at: dayAt(1), season: 0, fog: [], slots: [], fingerprint },
    PASSER,
  );
  put("member.remove", { key: authorKeyFor(WRITER) });
  put("note", note, WRITER);
  const events = Object.values(now.events).map((ref) => [ref.n, ref.kind, ref.status, ref.author]);
  return { ignored: now.ignored, events };
}

function beatFingerprintOfPhysics(): string {
  const constants = {
    CARE_POINTS,
    DECAY_PPM,
    FOG_CARE_BELOW,
    FOG_QUIET_DAYS,
    FOG_SAFE_RINGS,
    FADING_BELOW,
    SEASON_DAYS,
    SEASONS,
    BEAT_EVERY_MS,
    RUMOR_KINDS,
    RUMOR_RINGS,
    RUMOR_WRITE_BEATS,
    RUMOR_SHOW_BEATS,
    RUMOR_NAME_MIN,
    rumorSlots: HISTORY_LIMITS.rumorSlots,
  };
  const text = JSON.stringify({ constants, histories: [1, 2, 3, 4].map(beatHistory) });
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

describe("physics version", () => {
  it("has recorded what the current physics produces (4)", () => {
    expect(
      RECORDED[PHYSICS_VERSION],
      `record the fingerprint of physics ${PHYSICS_VERSION}`,
    ).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(BEAT_RECORDED[PHYSICS_VERSION], `record the beat of physics ${PHYSICS_VERSION}`).toMatch(
      /^sha256:[a-f0-9]{64}$/,
    );
    expect(PHYSICS_SUPPORTED).toContain(PHYSICS_VERSION);
  });

  it("produces exactly the recorded care, fog, seasons and rumor slots (5)", () => {
    expect(
      beatFingerprintOfPhysics(),
      "the beat's constants or output changed: bump PHYSICS_VERSION and record it",
    ).toBe(BEAT_RECORDED[PHYSICS_VERSION]);
  });

  it("admits and refuses exactly what the recorded build did (6)", () => {
    const text = JSON.stringify(admitHistory());
    expect(
      `sha256:${createHash("sha256").update(text).digest("hex")}`,
      "an admit rule changed: bump PHYSICS_VERSION, keep the old rule for worlds pinned to it",
    ).toBe(ADMIT_RECORDED[PHYSICS_VERSION]);
  });

  it("produces exactly the recorded land, fights, lore and dungeons (1–3)", () => {
    expect(
      fingerprint(),
      "terrain, combat, lore or maze output changed: bump PHYSICS_VERSION and record it",
    ).toBe(RECORDED[PHYSICS_VERSION]);
  });

  it("refuses to open a world made on physics this build does not have", () => {
    expect(checkPhysics(PHYSICS_VERSION).ok).toBe(true);
    const newer = checkPhysics(PHYSICS_VERSION + 1);
    expect(newer.ok ? null : newer.error.code).toBe("physics-newer");
    const gone = checkPhysics(0);
    expect(gone.ok ? null : gone.error.code).toBe("physics-unsupported");
  });
});
