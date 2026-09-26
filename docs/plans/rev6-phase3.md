# Rev 6 phase 3 — Everyone's world (三 · 大家的世界)

Status: design, revised 2026-09-26 after a code review. **WP1a and WP1b exist and are being
implemented**: `src/shared/canonical.ts`, `src/shared/history/{ids,event,bodies,sign,log,access,
types,fold,admit,beat,decay,rumor}.ts`, `src/shared/worldProtocol.ts`. "Changes to WP1a/WP1b" below
lists what this revision asks of that code. Direction: `docs/rev6-ai-brief.md` §1/§4,
`docs/rev6-engineering.html` ("後面三段 · 三", "待工程設計"). Builds on phase 2
(`docs/plans/rev6-phase2.md`). Where this doc and `plan.md` §8 disagree, this doc wins.

## Done looks like

1. While you are offline, a friend enters your world and sees the places you witnessed; no model
   rewrites them.
2. Two people online at once watch one place develop: the same model stream on both screens, the
   place appearing for both at the same history entry.
3. Places nobody visits for long fade back into fog. History is never deleted; the old look
   becomes a legend (傳說).
4. Residents pass on news of what other members did. Each rumor is bound by its beat to one event
   in the history, must name it, and may name no other place, resident, item, title or person the
   world knows except the cited ones and the listener. The validator checks names, not tone: a
   rumor may color what happened, never who or where.

## Changes to WP1a/WP1b (already written)

1. Genesis body per D1: drop `pack` and `ownerName`; `from` becomes required,
   `{ instanceId, world?, head? }`.
2. New owner-only kinds `pack` (D10) and `hide` (D8). Rumor candidates drop `gift` (D14).
3. `PlaceBody` per D3: `at` replaces `near` and `direction`. `admit` checks the spot
   (`place-spot-taken`); `entranceFor` and the `placeSpot` import leave admit and the fold.
4. Invites carry a one-time key; `member.join` carries `proof`; the link gains `&k=` (D8).
5. Receipts follow the schedule in D2: `verifyLog` builds it from the `sequencer` entries.
6. `applyEntry`, `foldEntries` and `withPending` take verdicts instead of a `VerifyEvent` (D4).
7. `WitnessIndex` gains `errands` and `keepsakes`; admit resolves errand places and
   `errand.done` refs against them (D3).
8. Lore: links and id checks use live lore only; non-live nodes are re-identified in views (D4).
9. Parents: a note, deed, chapter or `gift.take` whose parent is a variant is a variant (D3).
10. Visits: one per author per UTC receipt day (`visit-today`); care touches are kept per
    (chunk, day) and dropped after 180 days at each beat (D13).
11. `ChapterBody` gains `more` and the `work` / `closed` kinds (D3).
12. `EventDraft` carries `seen` from the renderer (D2).
13. `validateRumor` adds the reverse label check and ASCII-only case folding (D14).
14. Determinism rules in D4 (no `Math.hypot/cos/sin`, `localeCompare`, `Intl`, `toLocale*`).
15. `FOLD_VERSION` for snapshots (D4); the beat fingerprint as its own recorded entry (D18).

## D1. A world is a genesis plus a shared log; personal progress has its own file

- **Identity.** `worldId` is the id of the world's `genesis` event. Its body, exactly:

```ts
interface GenesisBody {
  name: string;               // instance.meta.name
  cartridge: CartridgeRef;    // { cartridgeId, version, contentHash } — the content hash is the identity
  seed: string;               // save.seed ?? cartridge.cartridgeId
  language: string;           // save.language ?? bibleLanguage(pinned bible) ?? "und"
  physicsVersion: number;     // physicsOf(runtimePin)
  createdAt: string;          // instance.meta.createdAt (also the envelope `at`)
  access: AccessPolicy;       // "friends"
  gates: StoryGate[];         // the pinned story's episodes: { id, cx, cz }, ≤ 8
  from: { instanceId: string; world?: string; head?: Head };  // world + head only when adopted (D7)
}
```

  Every field is read from disk: the instance meta, the save, the pinned cartridge and the runtime
  pin. So one instance on one device always yields the same genesis. There is no pack hash (a pack
  is only a way to fetch the cartridge: the `pack` event, D10) and no owner name (that is a
  `profile` event). Idempotency is by `from.instanceId`: `histories/index.json` maps instance ids
  to world ids, and is rebuilt from every log's line 1 when missing.
- **Storage owners** (added to Rule 9):

| Path | Owner | Holds |
| --- | --- | --- |
| `<userData>/histories/<worldId>/log.jsonl` | `main/histories/` | sequenced entries (line n = entry n), append-only |
| `…/outbox.jsonl`, `…/refused.jsonl` | same | own events awaiting a receipt (a queue, rewritten atomically); refused ones move to `refused.jsonl`, never deleted, their count shown |
| `…/link.json`, `…/snapshot.json` | same | sync state (service URL, pinned key, cursor); a fold cache (D4) |
| `<userData>/histories/index.json` | same | `instanceId → worldId` (a cache of every genesis `from`) |
| `<userData>/blobs/<sha256>` | `main/blobs/` | cartridge and work packs, verified on read, no eviction yet |
| `<userData>/identity/device.key` | `main/identity/` | the Ed25519 device key, safeStorage-encrypted |
| `saves/<saveId>/world.json` | `main/histories/` | `{ v: 1, worldId, migrated: { at, source: SourceDigest, skipped: Skipped[] } \| null }` |
| `saves/<saveId>/progress.json` | `main/histories/` | this player's progress in the world (`WorldProgress`) |

- **`save.json` keeps its exact legacy shape.** `saveStateSchema` and `landProgressSchema` are
  `.strict()` (`main/instances/schemas.ts:96-228`), so no new field may go there without breaking
  older builds. Personal world progress goes in `progress.json` (`src/shared/worldProgress.ts`):
  `{ v: 1, worldId, errands: Record<"<witnessId>:<errandId>", ErrandStage>, episodes:
  Record<episodeId, { cleared, summary, found[], felled[], met[], playId? }>, places:
  Record<placeId, { cleared, playId? }> }`. Position, inventory, flags, home, door dials, felled
  foes and `storyCarry` stay in `save.json` exactly as today. `karma.jsonl` stays the private
  ledger (it holds dialogue choices); public facts become `deed` events.
- **The content moves into history**: witnessed chunks with dialogue, errands and lore; places
  (including otherworld links); written chapters; `storyMore`; notes, signposts, gifts; deeds;
  visits; beats; rumors. After migration the legacy land fields in `save.json`
  (`land.places`, `land.storyMore`, `land.episodes[*].stage`, `land.errands`) are frozen: read by
  catch-up (D6), never written by this build.

## D2. The event envelope, the order, and receipts

```ts
interface HistoryEvent {
  v: 1;
  world: string;      // worldId; "" only in the genesis
  kind: EventKind;
  author: string;     // "k" + base32(Ed25519 public key)
  at: string;         // author's clock; display only
  seen: number;       // see below
  body: unknown;      // per-kind strict zod schema (shared/history/bodies.ts)
  id: string;         // "h" + base32(sha256(canonicalJson(event without id and sig)))
  sig: string;        // base64url Ed25519(author, "unmapped-event:v1\n" + id)
}
interface LogEntry { n: number; rt: string; chain: string; event: StoredEvent; rsig: string | null }
// chain(0) = worldId; chain(n) = "sha256:" + hex(sha256(chain(n−1) + "\n" + n + "\n" + rt + "\n" + id))
```

- Ids are content-addressed and spelled in lowercase unpadded base32, so a duplicate submit is
  harmless and ids are safe file names. One sequencer gives each world one total order. `rt` is the
  only clock the fold uses. There is no DAG.
- **`seen`** is the head `n` the renderer's fold had **when the generation started** (for traces:
  when the player wrote them). The renderer passes it in the draft, and main refuses a draft whose
  `seen` exceeds its current head. A slow write that lands after a sync therefore becomes a
  variant, never a refusal.
- **Receipt rule** (exact; phase 4 aligns to it):

```
rsig(n) = base64url(Ed25519(K, utf8("unmapped-receipt:v1\n" + chain(n))))

Key schedule. Let s1 < s2 < … be the n of the log's admitted `sequencer` entries; entry si
installs key Ki = its body.key.
  - No `sequencer` entry: every rsig is null (a local-only world, sequenced by its own device).
  - n < s2 (every n when there is only s1): rsig verifies with K1. This covers the uploaded prefix
    1..s1, which attach re-receipts with the new key, and everything after it until a rehost.
  - si ≤ n < si+1 for i ≥ 2: rsig verifies with Ki (a rehost switches keys from its own entry on).
  - Once a log has s1, no rsig in it is null.
Attach. The owner uploads entries 1..k (rsig null). The frame marked `last` carries the owner's
`sequencer` event naming the service's own key. The service sequences it as entry k + 1 = s1 with
its own rt (≥ rt(k)), keeps n, rt and chain of 1..k unchanged, and signs receipts for 1..s1 with
K1. It refuses `attach-rt-future` when rt(k) is more than 300 s ahead of its clock, and refuses a
`sequencer` event that names any other key. `verifyLog` reads and verifies the `sequencer`
events first, builds the schedule, then checks every receipt.
```

## D3. Event kinds

| Kind | Writer | Body | Fold rule | Care |
| --- | --- | --- | --- | --- |
| `genesis` | owner | D1 | the world's id | – |
| `access` | owner | `{ policy }` | latest wins | – |
| `sequencer` | owner | `{ url, key }` | D2 schedule | – |
| `pack` | owner | `{ cartridge: ContentHash, pack: ContentHash, bytes }` | latest wins; `cartridge` must equal the genesis's content hash | – |
| `hide` | owner | `{ id, hidden: boolean }` | latest per id wins; views only (D8) | – |
| `invite.revoke` / `member.remove` | owner | `{ nonce }` / `{ key }` | from their n on; earlier events stay | – |
| `member.join` | joiner | `{ invite, name, proof }` (D8) | valid invite + proof; a use counts once | – |
| `profile` | any writer | `{ name }` | latest wins | – |
| `witness` | owner, member | `{ cx, cz, scene, dialogues, errands?, lore, index, supersedes? }` | first per chunk live; race loser variant; on a fogged or hidden chunk the new one is live and the old one a legend | 3 |
| `place` | owner, member | see below | all stand | 2 |
| `chapter` | owner, member | see below | first per episode live; the rest variants | 2 |
| `story.more` | owner, member | `{ episode }` | first per id live; id is the next free `eN` | – |
| `note` | any writer | `{ coord, anchors: witnessId[] ≤ 8, text, contests: noteId \| null, name, via? }` | all stand | 2 |
| `signpost` | any writer | `{ coord, text ≤ 40, toward }` | all stand; ≤ 3 per author per chunk | 1 |
| `gift` / `gift.take` | any writer | `{ coord, item, for, words }` / `{ gift }` | first valid take wins | 2 / 2 |
| `visit` | any writer | `{ chunks ≤ 64 }` | one per author per UTC receipt day | 1 per (author, chunk, day) |
| `deed` | owner, member | `{ what, ref }` (`ref` = event id, or `<witnessId>:<errandId>`) | ref must resolve; one per author and ref | 3 |
| `beat` | beater | D13 | valid only if equal to the recomputation | – |
| `rumor` | owner, member | `{ beat, slot, text ≤ 200 }` | first valid per slot live; the rest variants | 0 |

**Place body** (exact):

```ts
interface PlaceBody {
  kind: PlaceKind;                          // "side" | "dungeon" | "otherworld"
  title: string;                            // one line, ≤ PLACE_LIMITS.titleChars
  at: { cx: number; cz: number };           // the entrance chunk, decided by the writer
  seed: number;                             // uint32
  source?: string;                          // side / dungeon only: the Scene program
  dialogues?: Record<string, string>;       // side / dungeon only: each resident's words
  work?: WorkRef & { pack: ContentHash };   // otherworld only: the exact revision and its pack
  legacyId?: string;                        // migrated only: the old "p1"…"p999" id
}
```

- The writer runs `placeSpot(here, taken, wishedDirection(wish))` over the fold's current gates
  and places. Migration copies the old `cx/cz` into `at`.
- `admit` refuses `place-spot-taken` when `at` is the origin (home), a story gate (genesis gates
  and live `story.more`), or the `at` of an earlier live place, and `place-spot-far` when |cx| or
  |cz| is over 64. The fold never runs `placeSpot` (its `Math.hypot` stays out of the fold).
- On `place-spot-taken`, the renderer recomputes the spot and resubmits. That costs no model call.
- A place's id is `legacyId ?? "p" + eventId.slice(1, 9)`. `PLACE_ID` and `parsePlaceTarget`
  (`shared/places.ts:89,193`) widen to `/^p(?:[0-9]{1,3}|[a-z2-7]{8})$/`.

**Chapter body**: `{ episodeId, title, more: storyMoreEventId | null } & ({ kind: ChapterKind,
source, dialogues?, seed } | { kind: "work", work: WorkRef & { pack } } | { kind: "closed" })`.
- `work` is a Rule 13 chapter that was played as an AI work (`EpisodeProgress.work`).
- `closed` is one whose draft was never published: its gate reads as told, and nobody rewrites it.

**Witness index**: `{ name, npcs: [{id, name, role}], errands: [{id, giver, place: loreId | null,
reward}], keepsakes: [{id, name}] }`. `validateEventBody` requires it to equal the parsed programs.
`admit` requires every errand `place` to be live lore or the witness's own lore, and an
`errand.done` ref to name an errand in that witness's index.

**Parents.** A child whose parent is a variant is a variant. This applies to a note's `anchors` and
`contests`, a deed's `ref`, a chapter's `more`, and a `gift.take`'s `gift`. Pending children follow
their parent when its receipt arrives.

## D4. "Now" is a pure fold over entries and verdicts

```ts
/** What the checks the fold cannot run found for one event: its id and signature (verifyEvent,
 *  shared) and its DSL body (validateEventBody, src/dsl). Main and the service compute it with
 *  `entryVerdict` (src/dsl/history/verdict.ts); the renderer receives it with each entry. */
export type EntryVerdict = { ok: true } | { ok: false; code: string };
export interface VerdictEntry { entry: LogEntry; verdict: EntryVerdict }

export function applyEntry(now: WorldNow, entry: LogEntry, verdict: EntryVerdict): WorldNow;
export function foldEntries(now: WorldNow, entries: readonly VerdictEntry[]): WorldNow;
export function withPending(now: WorldNow, outbox: readonly { event: StoredEvent; verdict: EntryVerdict }[], rt: string): WorldNow;
```

- `applyEntry` runs `readEvent` and `admit` itself. It skips an entry with `!verdict.ok` under
  `verdict.code`, just like one that fails admit. A skipped entry stays in the log and in `ignored`.
  Repeated ids are skipped as `event-duplicate`, so a `member.join` use counts once.
- **Lore views.** Link checks and duplicate-id checks use live lore only: lore of live, unfogged,
  unhidden witnesses. Non-live nodes (from legends, variants, or fogged or hidden live witnesses)
  appear in `worldLore(now)` with the id `#<witnessEventId>:<loreId>`, and their links into the same
  witness are rewritten the same way. `activate()`'s id map can then never collide, and a re-witness
  may reuse the old slugs. The prompt shows `#…` nodes as "old tale".
- **Hidden** events (D8) stay in the fold's indexes, so citations and links resolve, but every view
  skips them: land, notes, variant lists, rumors and prompts.
- **Snapshots.** Main and the service write `snapshot.json` = `{ foldVersion, head: {n, chain},
  now }` every 1,000 entries and on close. A snapshot is loaded only if `FOLD_VERSION` matches and
  entry n of the log has that chain; otherwise the log is refolded. `WorldNow` is plain JSON.
  `FOLD_VERSION` bumps with any change to the fold, admit, beat or rumor rules.
- **Determinism.** The fold, admit, beat and rumor code use:
  - integer or exactly representable arithmetic only;
  - `Date.parse` of strict ISO text only;
  - code-unit string comparison only;
  - no `Math.hypot/cos/sin/pow`, `localeCompare`, `Intl`, `toLocale*` or `toLowerCase` (the
    rumor check folds ASCII A–Z only).

  Geometry that needs trigonometry stays with the writer, and admit only checks the result is
  free: a place's `at` comes from `placeSpot` (`Math.hypot`), a `story.more` gate from
  `trailPlace` (`cos/sin`). `hashOrder` (Intl-based) is only for hashed ASCII file lists, never in
  the fold. Sort orders:
  fog keys by (cx, cz) ascending; residents by (cx, cz, npc code units); slots by (kind priority,
  n); lore by (cx, cz), then file order.

## D5. Validation layers and caps

| Step | Code | Run by |
| --- | --- | --- |
| `readEvent`: envelope, per-kind body, caps | `shared/history/event.ts` | service, main, renderer |
| `verifyEvent`: id and signature | `shared/history/sign.ts` | service, main (in the verdict) |
| `verifyLog`: chain and the receipt schedule | `shared/history/log.ts` | main |
| `validateEventBody`: programs parse; index matches; dialogues pair up; gift items round-trip | `dsl/history/validate.ts` (`validateWitness` moves here) | service, main (in the verdict) |
| `admit`: door, membership, conflicts, parents, spots, links, history-derived quotas | `shared/history/admit.ts` | service, main (before signing), every fold |

- **Order of checks.** Main runs every step before it signs a renderer draft, since the renderer is
  untrusted (Rule 6). The service runs them again before sequencing.
- **Refusals feed repairs.** A model draft refused by `validateEventBody` or `admit` for content
  (lore links, index, size) goes back to the model as a repair round, and it counts toward Rule 7's
  two.
- **Caps.** The event total is ≤ 128 KiB of UTF-8 canonical JSON, and that is the binding limit.
  Field caps are in characters (UTF-16 units), as everywhere in the repo, and only bound shape.
  (Scene 64 Ki, 12 dialogues of 8 Ki, errands 16,000 chars, and so on. Together they can exceed
  128 KiB; the total wins.) A new witness is at most ~3,200 output tokens, far below the cap.
  Other caps: note 280, signpost 40, gift words 120, rumor 200, name 60; 64 members and 64 places
  per world.
- **Gift items.** `validateEventBody` round-trips `gift.item` through a new `serializeItem` and
  `parseItem` (`itemLibrary`, clamped). The item must come back unchanged. A taken gift enters the
  inventory as `gift-<8 of event id>`. `worldContext`'s inventory section never shows items with that
  prefix, because their names and perks are another player's words.

## D6. Migration from today's saves (lazy, idempotent, never destructive, never lossy)

- **When.** `world.ensure(instanceId)` runs when Play opens a save with open land. It shows a
  loading state, then a report.
- **Plan.** `planMigration(files) → UnsignedEvent[]` lives in `src/dsl/history/migrate.ts`. It is
  pure but needs the DSL (Rule 8), to build each witness `index` with `parseScene` / `parseErrands`.
  Main signs the plan; Ed25519 is deterministic. Every migrated event has `seen: 0` and a fixed
  `at` (its karma line's, else the genesis `createdAt`), so the same content always gets the same
  id. The order:
  1. `genesis`, then `pack` when the revision is not a shipped built-in, then `profile` with the
     display name the renderer passes to `ensure`. The profile is not part of the genesis, so a
     later name is just a later `profile`.
  2. One `witness` per chunk: lore-run order (`loreRuns` in `backupLand.ts`), then the rest by
     (cx, cz).
  3. Notes in file order. Old note ids map to event ids, and `contests` and anchors (lore id → its
     witness id) are rewritten; a missing target becomes `null` and is reported. A visitor's note
     keeps its `name`, with `via: "continent"`.
  4. `place` with `legacyId` and `at` = the old cx/cz. A collision moves it with `placeSpot`, and the
     move is reported.
  5. `story.more`.
  6. `chapter` from each `episodes[id].stage`, or `work` / `closed` for Rule 13 AI-work chapters.
  7. `deed` for karma "cleared chapter" / "crossed" lines and finished errands.
- **Personal progress.** `progress.json` is built from the legacy `land.errands` (keys re-mapped to
  `<witnessId>:<errandId>`), `episodes` progress and `places[].cleared/playId`.
- **Nothing is dropped.** A chunk that fails `validateEventBody` or exceeds 128 KiB stays out of the
  history. It is still drawn on this device from the frozen `chunks/` folder (`legacyOnly`), is
  listed one by one in `world.json.migrated.skipped` and in the land status, and never blocks Play.
  If the shared world later has a live witness there, the shared one is shown and the local one is
  listed as a local variant.
- **Commit.** Main writes `histories/.staging-<instanceId>-<pid>/`, renames it to
  `histories/<worldId>/`, updates `index.json`, then writes `progress.json` and finally `world.json`.
  `world.json` is the commit point. It records `SourceDigest`: counts plus sha256 of `chunks/`
  (code-unit-sorted `path:sha256` lines), `lore.jsonl`, `notes.jsonl`, and
  `canonicalJson({places, storyMore, episodes, errands})` of the legacy land fields.
- **Catch-up.** On every open, the digest is recomputed. A mismatch means an older build wrote to
  the save, or a crash happened after the rename but before the pin (`index.json` finds the world by
  `from.instanceId`). Main then re-plans from the current files and appends the events whose ids are
  not in the log (deduped by content id). It merges any legacy personal progress that advanced into
  `progress.json` without ever regressing it, updates the digest, and the screen says what it added
  ("An older build changed this save: 2 things added").
- **Source files.** `chunks/`, `lore.jsonl`, `notes.jsonl` and the legacy land fields are never
  written again by this build. `checkpointInstance` refuses a checkpoint that changes a legacy land
  field (`legacy-land-changed`) and a `karma` array that does not extend the stored one
  (`karma-not-append-only`). Play stops calling `instances.witness/appendNote`; they remain for
  legacy reads and backup validation.
- **Backups.** A `.spire-backup` gains `world.json`, `progress.json`, `history/log.jsonl` and
  `history/outbox.jsonl`. Restore writes the history when it is absent or when one side is a chain
  prefix of the other. Otherwise both are kept (`histories/<id>/restored-<ts>.jsonl`) and
  `backup-history-diverged` is shown. For a restore on another device, see D7.

## D7. Identity and keys

- **Device key.** One Ed25519 key per device, created by main when absent and kept with safeStorage.
  It never leaves main. `@noble/curves` gives the same bytes in V8 and JavaScriptCore and signs
  deterministically (WebCrypto Ed25519 also exists in Electron 44 and Bun).
- **Key errors never regenerate.** If safeStorage is unavailable, or `device.key` exists but cannot
  be read or decrypted, main shows `identity-keychain-unavailable` / `identity-key-unreadable` with
  a hint, and never overwrites the file. That is unlike `vault/store.ts` `getOrCreateKey`, which
  regenerates when its stored key does not decode. Play still opens: the history reads without a
  key (verifying needs only public keys), unmigrated saves open from their legacy files, and
  writing, sharing and migrating wait with the error shown.
- **Restored on another device, never attached: adopt.** Opening a world whose owner key is not this
  device's, with no service ever attached, runs an automatic adoption, and the screen says so. It
  creates a new genesis with `from: { instanceId, world: oldWorldId, head }`, re-signs every event
  of the copy under this device's key (same bodies and `at`, new `world`, so new ids), re-maps
  `progress.json` keys (place ids, witness ids) and re-pins `world.json`. The old history directory
  stays untouched.
- **Restored on another device, attached.** The world is read-only, with the Rule 2 error
  `world-device-not-member` and the hint "open it on the device that made it, or ask its owner for
  an invite". Redeeming an invite in this save's door panel (`world.join(link, instanceId)`) makes
  this device a member. Co-owner devices are phase 4.
- **Model keys** (user decision). Every model call in this phase runs on the calling member's device
  through main's `resolveApiKey` → `resolveKey` (`inference/keyStore.ts`, `keys.ts`). That covers
  witnessing (including the claimant of a together-stream), places, chapters and rumor batches.
  - **One order everywhere:** the key saved in System → Model, else the provider's own `.env`
    variable (today `OPENAI_API_KEY`). A saved key that no longer decrypts falls back to `.env`.
  - **The service holds no keys in phase 3.** It never sees a key and makes no model call, and
    stream viewers spend nothing.
  - **Later model calls on a service or gateway** resolve their key the same way on their host.
    Every new provider gets its own `.env` name, and a hosted gateway never removes `.env` as the
    local default.

## D8. The world's door (access), invites and hiding

| Policy | Read and sync | Write |
| --- | --- | --- |
| `private` | owner | owner |
| `friends` (default) | owner, members | owner, members: every non-owner kind |
| `public` | anyone with the world id | members as in `friends`; visitors only `profile`, `note`, `signpost`, `gift`, `gift.take`, `visit` |

**Invite format** (exact):

```
Invite = { v: 1, world, svc, by, key, nonce, exp, uses, sig }
  key   = "k" + base32(one-time invite public key)      nonce = 16–52 base32 chars
  uses  = 1..20 (default 1)                              exp   = strict ISO time
  sig   = Ed25519(by, "unmapped-invite:v1\n" + canonicalJson(invite without sig))
Link    = "unmapped://join?i=" + base64url(utf8(canonicalJson(invite)))
          + "&k=" + base64url(invite secret key, 32 bytes)
member.join body = { invite, name, proof }
  proof = base64url(Ed25519(invite secret, "unmapped-join:v1\n" + world + "\n" + nonce + "\n" + joiner key))
```

- **Why the proof.** The log (readable by anyone in a public world) holds only the owner-signed
  invite and the proof bound to the joiner's key. The invite secret stays in the link. Copying a
  logged `member.join` gives another key nothing to prove with (`invite-proof-invalid`).
- **`verifyInvite(now, invite, proof, joiner, rt)`** checks: same world, `by` = owner, the
  signature, `rt < exp`, not revoked, uses left, and the proof. The invitee also checks that the
  genesis hashes to `world` and that `genesis.author === by`.
- **`member.remove`** stops reads and writes from its n on; the member's past events stay.
- **`hide { id, hidden }`** (owner only) is the moderation tool. Views skip hidden events (D4). A
  hidden live witness leaves its chunk re-witnessable, as if fogged. Nothing leaves the log.

## D9. Service protocol: one WebSocket per service, JSON frames ≤ 256 KiB

`ToService` and `FromService` are as implemented in `shared/worldProtocol.ts`, with two changes:
`open` carries `join?: { invite: Invite; proof: string }` instead of `invite?`, and the `attach`
frame with `last: true` carries `sequencer: StoredEvent` (D2).

- **Sync.** Sync is "after my `n`", with a chain check. On a mismatch, main stops syncing that
  world (`history-diverged`) and never merges silently.
- **Blobs.** Blobs go over HTTP: `PUT` / `GET /v1/worlds/<id>/blobs/<sha256>`, with a signed
  `X-Unmapped-Auth` header valid for ±300 s.
- **Both sides check every frame** with the readers in `worldProtocol.ts`.
- **Anti-flood.** Every limit below is a host flag. Exceeding one returns `rejected` / `refused`
  with a `quota-*` code and a hint; only protocol violations close the socket.

| Scope | Limits |
| --- | --- |
| Connection / IP | authenticate within 10 s; ≤ 8 open worlds; ≤ 20 frames/s, presence ≤ 5/s; ≤ 10 sockets per IP; ≤ 5 new visitor keys per IP per day (a key is new the first time it writes on this service) |
| Member or owner × world | ≤ 30 events/min, ≤ 1,000/day; `witness` ≤ 60/day, `place` ≤ 10, `chapter` + `story.more` ≤ 20, `note` + `signpost` ≤ 50, `gift` ≤ 20; `visit` 1/day (admit); ≤ 1 variant per target; ≤ 2 live claims; ≤ 1 open stream (≤ 64 KiB, ≤ 20 deltas/s) |
| All visitors × world (one shared budget) | ≤ 200 events and ≤ 512 KiB per day in total; ≤ 20 events per visitor key per day; ≤ 8 MiB ever. Exhausting it refuses visitors only (`quota-visitors`) and never touches members |
| World | member and owner events ≤ 64 MiB (then only owner kinds: `world-full`); visitor events count only against their own 8 MiB; blobs ≤ 256 MiB, each ≤ 32 MiB |
| Owner key | ≤ 20 attached worlds |

## D10. The world service: `src/service/`, Bun, file store

- **Code.** `src/service/main.ts`, run as `bun run service -- --port 8787 --data <dir>`, on
  `Bun.serve`, with its key in `<data>/service-key.json` (0600). It imports only `@shared` and
  `@dsl`. Rule 8 becomes `shared ← dsl ← { main, renderer, service }`, and nothing imports it.
- **Storage.** `<data>/worlds/<id>/{log.jsonl, blobs.txt, snapshot.json}` and
  `<data>/blobs/<sha256>`. Presence, streams and claims live in memory only.
- **Scope.** The service stores and relays signed history, computes verdicts, runs `admit` and
  beats, holds claim leases, and relays presence and streams. It never calls a model or holds a key
  in phase 3, and it never changes or deletes an entry.
- **Packs.** The owner's `pack` event announces the cartridge blob. A work pack is announced in its
  `place` or `chapter` body. The service treats packs as opaque. A joining client fetches the blob,
  checks its sha256, unpacks it (`unpackCartridge`), and requires the manifest's `cartridgeId`,
  `version` and `contentHash` to equal the genesis's before `installCartridgePack`. A shipped
  built-in revision needs no pack.
  - `works/pack.ts` refuses a received work whose `workId@version` already exists locally with
    another content hash (`publishRevision` never overwrites, `works/store.ts:285`). Received works
    are listed in `histories/<id>/received-works.json`, so the otherworld picker ("this device's AI
    worlds") never shows them.
  - Packing is made reproducible anyway: a fixed zip mtime (1980-01-01) and entries inserted in
    `hashOrder` of path, in `cartridges/pack.ts` and `works/pack.ts`. That way identical revisions
    share one blob.
- **Hosting.** Behind TLS on the internet. Main accepts only `wss://`, or `ws://` on loopback.
- **Test mode.** `UNMAPPED_SERVICE_TEST=1` enables `--beat-every <dur>` and
  `POST /v1/test/advance {days}`. Main has the matching `UNMAPPED_TEST_CLOCK_DAYS`, which it honors
  only when `AETHER_TEST_USER_DATA` is set; it shifts main's rt and local-beat clock.
  `scripts/world-probe.ts` talks to the socket directly with throwaway keys, to prove that the
  service refuses what main would already block.

## D11. Main syncs; the device works offline first

- **Socket.** `main/histories/sync.ts` keeps one socket per service URL (Node's built-in
  `WebSocket`). It is open while an attached world is open in Play, and briefly when the library
  refreshes, with backoff from 1 to 30 s.
- **Appending.** A local-only world appends straight to its log. An attached world appends to the
  outbox and sends at once; offline, the outbox waits. On quit, main flushes for up to 2 s.
- **IPC** (`window.seed.world.*`, every payload zod-checked in main):
  - `ensure(instanceId, name)`
  - `read(worldId)` → snapshot plus verdict entries plus pending
  - `append(worldId, draft & { seen })`
  - `claim(worldId, target)` (1.5 s timeout → `claim-offline`)
  - `stream`, `presence`, `attach(worldId, url)`, `invite(worldId, {uses, days})`, `setAccess`,
    `hide`
  - `join(link, instanceId?)`: fetch and verify the pack, install it, `createInstance` with the
    genesis seed and language (or reuse `instanceId`), write `world.json` and `progress.json`, sync

  Events to the renderer: `world:entries` (with verdicts), `world:status` (link state, pending,
  refused and ignored counts), `world:presence`, `world:stream`.
- **Refused events** stay listed with their codes and hints until the player dismisses them (Rule
  2). They are never dropped silently.

## D12. Continents and P2P

- **Continents are frozen**, unchanged, for local-only worlds. A continent's `worldId` is still
  the instance id, not the history's world id.
  - Continent land comes from the fold via `useLandStore`.
  - Chunk entries are write-once (`mayWrite`, `continentHello.ts:117-121`), and each machine's
    continent doc lives for one session. A chunk that fogs or is re-witnessed mid-session therefore
    reaches peers at their next join; until then they keep what they received.
  - A visitor's note (`keepVisitorNotes`) is no longer kept automatically. The owner sees it as
    "left by <name>, not kept yet" and confirms it into an owner-signed `note` with the visitor's
    `name` and `via: "continent"`. At most 10 notes per visiting world per day are offered.
  - An attached world refuses to open a continent (`continent-world-attached`).
- **P2P acceleration is deferred.** History always goes through the sequencer.

## D13. Beats: care, forgetting, seasons, a rumor batch

- **Body.** The `BeatBody` is as implemented (`upTo`, `at`, `season`, `fog`, `slots`,
  `fingerprint`). A beat is valid only if it deep-equals `computeBeat(now, at)`.
- **Who beats.** The service beats every 6 h. For a local-only world, the owner's device beats on
  open once 6 h have passed. One catch-up beat suffices, because care depends only on T.
- **Care.** Care is in whole micro-points, from the literal `DECAY_PPM` table (14-day half-life,
  0 after day 180) and `CARE_POINTS`.
  - Visits count once per (author, chunk, UTC day).
  - The fold keeps touches summed per (chunk, day), plus the last touch per chunk. Each beat drops
    days older than 180 (they weigh 0). The fold state is therefore bounded by chunks × 181, not by
    visits.
- **Forgetting.** A live chunk fogs when `care < 100_000` µpt, it has been untouched for ≥ 28 days,
  and it lies more than one ring from the origin.
  - The town ring never fogs, and neither does home. Home is the origin in every save today:
    `emptyProgress` sets (0, 0) and nothing moves it. A later phase that lets home move must first
    add a `home` event so beats can exempt it.
  - Chapters, places and traces never fog.
- **Seasons.** `season = floor((T − rt_genesis) / 7 days) mod 4`. The season tints both looks
  (`engine/palette/hd2d.ts` and `land2d.ts`) and adds a `world:season` prompt line.
- **Fingerprint.** `sha256(canonical{world, upTo, chain, at, season, fog, slots, care})`. No chain
  code in phase 3.

## D14. Rumors: the beat picks what, a member's model writes how, a validator checks names

- **Candidates** are events in (previous beat, `upTo`] of kind `deed`, `chapter`, `place`,
  `member.join` or `witness`, written by the owner or a member (never a visitor), live, not hidden,
  and not pending.
  - Notes and gifts are never candidates: player-typed text and player-made item names never reach
    an NPC's mouth.
  - The first 6 by (kind priority, n) that have a listener become slots. A listener is a resident of
    a live chunk 1–3 rings away, chosen by `hashIndex`.
- **Writing.** A member client with a model claims `rumors:<beatId>` and writes the whole batch in
  one call.
  - The prompt (`dsl/prompts/rumor.ts`) names the language with `languageName(genesis.language)`
    (Rule 10). The output is `Rumors(Rumor(slot, text)…)`, with at most two repairs, and validator
    refusals count as repairs.
  - Each rumor is its own event with usage purpose `rumor`. Unfilled slots expire after 4 beats:
    silence, never filler.
- **Rumor switch.** A per-device setting in Settings → Shared worlds, "Write rumors in the
  background". It is on by default on the owner's device and off by default on a member's device,
  where it would spend the member's key on someone else's world. It writes at most one batch per
  beat, and every batch shows in usage.
- **`validateRumor(now, e)`**, run by the service and clients alike, requires:
  - the beat is among the last 4 and has the slot;
  - one line of 1–200 characters;
  - the text contains the cited event's label.

  Then the reverse check. Every label the fold knows that appears in the text must be allowed.
  Known labels are place names and resident names from witness indexes, keepsake and gift item
  names, place, chapter and story titles, and member names, each of at least 2 characters. Allowed
  are the cited label, the slot's place name, the names of the cited event's author and subject,
  and the listener's name and chunk name. Allowed labels are masked longest first before the
  search. The check folds ASCII A–Z only.

  A rumor never cites anything itself; its citations are fixed by the beat. Talking to the listener
  shows the stored words plus a "They say…" row, with no model call.

## D15. "Has someone written here?" and 異聞

Before `witness(coord)` generates:

1. The local fold is checked. A live witness is drawn, with no call.
2. If the world is attached and online, the client sends a `claim` and waits at most 1.5 s:

| Answer | What the client does |
| --- | --- |
| `written` (n) | syncs to n, then draws the chunk |
| `writing` (sid, by) | joins the stream (D16); no call of its own |
| `granted` (sid) | generates and relays; the lease is 90 s, renewed by deltas, 10 min at most |
| `refused` | shows the Rule 2 error ("only members write this world") |
| timeout or offline | generates locally; the result may become a variant |

3. A local-only world just generates.

Chapters use `chapter:eN`, `story.more` uses `more:eN`, and rumor batches use `rumors:<beat>`. A
place spot taken meanwhile is recomputed without a model call (D3). 異聞 come only from offline
writes or claim timeouts. The lower n is live and the other a variant, listed on both clients. An
errand accepted from a losing variant stays in `progress.json` but is no longer offered.

## D16. Witness together

- **The claimant runs the model.** The claimant uses its own key or local model (D7) through
  `generateChunk` → `generateProgram`. The renderer forwards `onDelta` every 100 ms as
  `world.stream`. The service relays it and keeps the text so far (≤ 64 KiB) for late viewers.
- **Viewers.** `app/land/together.ts` (the `chapterJobs.ts` pattern) marks the chunk `developing`
  and feeds `TogetherPanel`, which reuses `StreamPreview`'s partial-program reading. Both machines
  read the same text.
- **What is committed.** Only the claimant's validated `witness`. When it is sequenced, both folds
  flip the chunk at the same `n` and the reveal plays for both. On an abort, a failure after two
  repairs, or a disconnect, viewers get `end: "abort"`, the lease is released, and the chunk is
  unwritten again.

## D17. Presence on engine2d

- **Types.** `Presence` and `EMOTES` are in `shared/worldProtocol.ts`. Presence is sent at most 4
  times a second on change, plus a 2 s heartbeat. The service stamps `from`, and names come from
  the fold.
- **Interpolation** (`engine2d/remoteMotion.ts`, pure). Draws at `now − 300 ms` with linear
  interpolation.
  - With no newer sample, it extrapolates for up to 200 ms, then holds.
  - A jump of more than 8 tiles snaps.
  - A player is dropped after 10 s without a sample.

  `LandView2D` passes `sampleRemotePlayers(now)` as `others`, so both looks draw the same positions.
- **Emotes.** An `emote` action opens a six-way wheel on key **T** and pad **LB**. `G` is taken by
  `grab` (`input.ts:91`), so `"lb"` joins `PadControl` (`PAD_BUTTON.lb` = 4 already exists). The
  bubble lasts 3 s and is drawn by `presenceLayer.ts` in both looks. Presence is never saved.

## D18. Physics and versions

- **The genesis pins `physicsVersion`.** Open, join and attach run `checkPhysics`. The service
  refuses a world it cannot reproduce, and an `open` whose `physics` lacks the world's version
  (`physics-newer`).
- **Recording.** The care points, `DECAY_PPM`, fog thresholds, season length and the slot picker are
  recorded as their own entry in `tests/shared/physics.test.ts`
  (`BEAT_RECORDED[1]`). `RECORDED[1]` is never edited, as that file requires. This does not change
  any pinned world's output, because no earlier build folds a history. Any later change bumps
  `PHYSICS_VERSION` and adds entries to both records.
- **Format versions are separate.** The envelope `v`, `WORLD_PROTOCOL` and `FOLD_VERSION` version
  the format, not physics. An unknown kind or `v` is kept in the log, skipped, and counted as "from
  a newer build".

## Work packages

**Schedule.** WP1a and WP1b exist and pick up the changes listed at the top. Any work on a phase-2
file waits until phase 2's E2E runs and commit: `shared/places.ts`, `shared/input.ts`,
`main/instances/schemas.ts`, `app/land/places.ts`, `app/land/Otherworld*.ts(x)`, `PlayScreen.tsx`,
`WorldsScreen.tsx` and `app/library/**`. That puts WP5 and WP8 entirely after phase 2, and the
marked parts of WP3 and WP6.

**Shared registries** take only small appended edits: `shared/ipc.ts`, `preload/index.ts`,
`main/ipc.ts`, `i18n/strings/index.ts`, `i18n/strings/errors*.ts`, `game.css`, the `package.json`
scripts, and one-line layer hooks in `engine2d/canvasRenderer.ts` and `hd2d/renderer.ts`. Every
package that adds UI strings owns its own `i18n/strings/<ns>.ts`.

| Package | Starts | Owns |
| --- | --- | --- |
| WP1a protocol core | now (exists) | `shared/canonical.ts`, `shared/history/{ids,event,bodies,sign,log,access,types}.ts`, `shared/worldProtocol.ts`, `shared/worldProgress.ts`, `package.json` deps, `tests/shared/history-envelope.test.ts` |
| WP1b fold and beat | now (exists) | `shared/history/{fold,admit,beat,decay,rumor}.ts`, `tests/shared/history-fold.test.ts`, `BEAT_RECORDED` in `tests/shared/physics.test.ts` |
| WP2 DSL | now | `dsl/history/{validate,verdict,migrate}.ts`, `dsl/{schemas,parse,prompts}/rumor.ts`, `serializeItem`, `dsl/index.ts`, the import switch in `main/instances/{land,backupLand}.ts` |
| WP3 main | now (`schemas.ts` after phase 2) | `main/identity/**`, `main/histories/**`, `main/blobs/**`, `main/works/pack.ts`, `main/cartridges/pack.ts`, `main/instances/{store,backup,backupShape,schemas}.ts`, `scripts/fixtures/legacy-land.ts`, `tests/fixtures/legacy-land/**` |
| WP4 service | now | `src/service/**`, `tests/service/**`, `scripts/world-probe.ts`, `tsconfig.node.json` include |
| WP5 land on history | after phase 2 | `renderer/history/**`, `state/landStore.ts`, `app/land/{loadLand,witness,notes,places,chapters,chapterJobs,errands,traces,OtherworldState,OtherworldPicker}.ts(x)`, `app/land/{TracePanel,VariantsPanel}.tsx`, `engine2d/{traceLayer.ts,LandView2D.tsx}`, `app/hud/LandStatus.tsx`, `app/Hud.tsx`, `app/PlayScreen.tsx`, `app/usePersistWorld.ts`, `narrative/witness.ts` (legend section), `shared/{places,land,story}.ts`, `i18n/strings/landHistory.ts` |
| WP6 together and presence | now (`shared/input.ts` after phase 2) | `app/land/{together.ts,TogetherPanel.tsx,EmoteWheel.tsx,ContinentSection.tsx}`, `net/{worldPresence,continentSync,continentActions}.ts`, `engine/remoteRoster.ts`, `engine2d/{remoteMotion,presenceLayer}.ts`, `shared/input.ts` (emote, `lb`), `i18n/strings/together.ts`; appends one line each to `LandView2D.tsx` and `Hud.tsx` |
| WP7 beat and rumor UX | now | `narrative/rumor.ts`, `app/land/{rumors,talk}.ts`, `shared/usage.ts` (`rumor`), `harness/builtins/worldContext.ts` (season, `#` legends, gift items hidden), `engine/palette/{hd2d,land2d}.ts` (season tint), `i18n/strings/rumors.ts` |
| WP8 door and library | after phase 2 | `app/land/{WorldDoorSection,DoorPanel}.tsx`, `app/library/JoinWorld.tsx`, `app/WorldsScreen.tsx`, `app/title/SharedWorldsPanel.tsx` (services and the rumor switch), `net/worldServices.ts`, `i18n/strings/world.ts` |

**Interfaces.** Packages meet through the types in D1–D17. WP5 calls WP6's
`relayFor(worldId, sid)` and `developing(coord)`. Isolated tests cover only what E2E cannot reach,
and each test file lists its failure modes first (Rule 0): forged signatures, ids and chains; the
receipt schedule; an invite proof replayed by another key; expired, overused or revoked invites; a
visitor writing a `witness`; verdict-skipped entries; a parent variant not propagating; a second
visit on one day; a race that loses data; legend lore ids colliding in `activate()`; arrival-order
dependence (many seeds); a snapshot unequal to a refold; locale-dependent sorting; a migration that
is not byte-identical or touches its source; a catch-up that duplicates; an adoption that loses
progress keys; a device key regenerated over a corrupt file; a rumor naming an uncited label; a beat
mismatch; malformed frames; quotas, including visitors against members; a checkpoint that changes
legacy land.

## E2E flows (`docs/e2e/milestone-rev6-p3-<flow>/`)

**Setup.** Throwaway userData. A on CDP 9333, B on 9334, C on 9335 when needed. The service:
`UNMAPPED_SERVICE_TEST=1 bun run service -- --port 8787 --data "$TMPDIR/svc"`, entered in
Settings → Shared worlds as `ws://127.0.0.1:8787`.

**Fixture.** The legacy fixture is reproducible. `bun scripts/fixtures/legacy-land.ts <userData>`
writes a pre-phase-3 save of the built-in world from committed programs in
`tests/fixtures/legacy-land/`, with no model. It contains:
- chunks with lore and errands, plus one deliberately oversized chunk;
- notes, including a continent visitor's note and a contesting note;
- a course place, and an otherworld with its `works/` revision;
- `storyMore`, a land chapter stage, and an episode played as an AI work;
- karma.

Afterwards, update the progress page with measured numbers only.

| Flow | Proves | Checks |
| --- | --- | --- |
| `migrate` | D6 | Counts per kind equal the fixture's. Source sha256 unchanged. The oversized chunk is `legacyOnly`, reported and still drawn. A rerun adds 0 entries. 0 `[inference]` lines |
| `older-build` | D1, D6 | The phase-2 commit, in a `git worktree`, opens a copy of the migrated userData, shows the land, witnesses 1 chunk and leaves 1 note. The new build then reports the catch-up and adds exactly those 2 events |
| `backup` | D6, D7 | Export → wipe → import restores the world, progress and history. Import onto a diverged history keeps both copies (`backup-history-diverged`). Restore on another userData adopts: new world id, land intact, witnessing works |
| `offline-visit` | Done 1 | A plays a New game, witnesses 2 chunks, attaches, invites, quits. B joins from the link (pack verified and installed, same head and chain) and walks A's chunks with 0 witness calls. B witnesses 1 chunk; A restarts and sees it with 0 calls |
| `migrated-share` | D6, D10 | The fixture world is attached. B joins and sees its old chunks, notes and places, and enters the otherworld (work pack fetched, verified, sandboxed) with 0 calls |
| `together` | Done 2 | A is `granted`, B is `writing`. The streamed-text hash is equal on both. Exactly 1 witness call across both logs. Both folds flip at the same `n` |
| `fog` | Done 3 | `advance {days: 92}` plus a beat (92, not 90: the season is `floor(days / 7) mod 4`, so 90 days lands on the same season): mist and a legend on both clients, and the entry still in the log. A re-witness gets `witness:legend` and goes live. The season changes. Fingerprints are equal on the service and both apps |
| `local-beat` | D13 | A local-only world relaunched with `UNMAPPED_TEST_CLOCK_DAYS=92`: the catch-up beat on a pinned open (not the first, migrating open) fogs a chunk and turns the season |
| `rumors` | Done 4 | B's `deed` becomes a slot. A's batch (usage `rumor`) cites it, and the listener names B. `world-probe.ts` submits rumors with an uncited label, a bad slot and a visitor author: the service refuses each with its code. The same via IPC is refused by main |
| `door` | D8 | `private` and `friends`-without-invite are refused. Used, expired and revoked invites are refused, and a replayed `member.join` from another key is refused (`invite-proof-invalid`). After `member.remove`, B can neither read nor write and B's past events stay. In a `public` world, C leaves a note and a signpost, and C's claim to witness is refused |
| `gift-race` | D3 | B and C take one gift: one `gift.take` is live, and the loser's inventory is unchanged, with "someone took it first" |
| `continent` | D12 | A migrated local world opens a continent with another world. A visitor note waits for confirmation, then becomes an owner-signed note. An attached world is refused `continent-world-attached` |
| `presence` | D17 | Interpolated steps stay under 0.3 tiles per frame at 60 Hz for 2 s. The emote bubble shows in both looks on both machines |
| `variant` | D15 | With the service stopped, A and B witness one chunk. After restart: one live copy and one 異聞 on both, both in the log |
| `physics` | D18 | `world-probe.ts` attaches a genesis with physics 2: `physics-newer`. A backup pinned to physics 2 is refused on import |

## Out of scope

Accounts and co-owner devices; ownership moves or a rehost after the service is gone (the D2
schedule already allows a rehost); the generation gateway, quotas, billing and service-side model
calls (D7's key rule applies when they come); P2P acceleration and reworking continents; LRU blob
eviction; mobile; chain writes; writing or walking a variant on purpose; moving home; fighting
together; per-world sprites; moderation beyond `hide`, the visitor limits, caps and validators.

## Accepted risks

- **Freshness on a first join.** A joiner with no cursor yet can prove that the history it is given
  is consistent (`verifyLog`: signatures, order, receipts under the D2 schedule), but not that it is
  complete. A dishonest service could hand it a correctly signed but stale prefix, for example one
  that stops before a recent `owner.remove` or `member.remove`. This comes with a single sequencer
  and no consensus. Once a device holds a cursor it refuses anything shorter (a diverged or shorter
  log is `history-diverged`), so the exposure is the first read only.
  - Recorded after the phase-3 trust-path review (2026-09-26).
  - A later mitigation: the inviter's head `{ n, chain }` inside the signed invite, so that a joiner
    refuses a history that ends before it.

## How the six invariants hold

1. **Walking never waits.** Claims time out after 1.5 s in the background, and talking reads stored
   words and rumors.
2. **AI only proposes.** Output is parsed, gets at most two repairs, and passes
   `validateEventBody` + `admit` in main before signing and in the service before sequencing.
3. **The same validation everywhere.** D5's pure functions are shared by main, the service and the
   fold (via verdicts).
4. **History only accumulates.** Fog, variants, legends, hides and removals are views; migration
   and catch-up never touch their source.
5. **Physics is versioned.** The genesis pins it, open, join and attach check it, and the beat
   constants have their own recorded fingerprint.
6. **The chain can be off.** Fingerprints are only computed.
