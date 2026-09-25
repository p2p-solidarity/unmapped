# Rev 6 phase 4 — Open and lasting (開放與長久)

Status: design for the phase-4 implementation run (2026-09-26). It has been reconciled with phase 3
and with a review of the first draft. Direction: `docs/rev6-ai-brief.md` §1 (items 7, 9, 10, 11) and
§4, and `docs/rev6-engineering.html` ("後面三段", "待工程設計的問題": 額度記帳). It builds on phase 2
(`docs/plans/rev6-phase2.md`) and on phase 3 (`docs/plans/rev6-phase3.md`, cited as P3 D1–D18).
Where a phase-3 file is named, phase 4 extends it after phase 3 has landed.

## Done looks like (from the direction doc)

1. **Licences.** When charging goes live, every model we serve or ship has a commercial licence,
   and the build proves it: each model has a dated licence record, and one switch refuses the rest.
2. **Survival.** With our servers off, someone else brings a world back up from its exported files.
   They verify it offline, import it into any world service, and visit it without a model call.
   While any owner key is alive, the world's history can keep being written.
3. **The rest.** Accounts with a free allowance, bring-your-own-key, and a path to subscriptions.
   Genesis provenance and a fingerprint per beat on a chain, with no wallet needed by anyone. For
   mobile: the architecture's seams, proven by the smallest browser client (D7).

## Hard constraints

**Keys resolve one way, everywhere** (user decision, 2026-09-26; also P3 D7):
- A key is the one saved in System → Model, else that provider's own `.env` variable. Main resolves
  it through `resolveApiKey` / `resolveKey` / `pickApiKey` (`src/main/inference/{keyStore,keys}.ts`).
  Since 1a10a9d, a saved key that no longer decrypts falls back to `.env`.
- Every new credential gets its own `.env` name and the same order: the Qwen-Image provider, any
  commercial image provider, and the hosted gateway itself.
- `.env` stays the local fallback after the gateway goes live, and is never removed.
- With no key anywhere, the error is `no-api-key` with today's hint wording ("Enter one in
  System → Model …, or add OPENAI_API_KEY to .env"). If phase 2 renames the panel to Settings,
  the hints follow.
- The gateway resolves its upstream keys the same way on its host.
- D2 fixes the order between own keys and the hosted quota.

**Model calls stay on devices** (P3 D7, D10). The world service never calls a model and never sees
a key. The gateway is a model endpoint that a device may call; it never sees a world.

**The six rev-6 invariants hold.** Two bind hardest here: walking never waits for AI (quota, sign-in
and billing are never on the walking path), and the chain can be switched off entirely.

**Rule 2.** No fake plans, prices, quotas or licences. Every number comes from the gateway, the
billing provider, or a dated record with its source.

**Rule 6.** Provider keys, device keys and gateway tokens live in main only. No secret crosses IPC
to a renderer, which sees only a `KeyStatus` or an account status. The browser proof (D7) holds no
gateway token and no provider key.

**Direction item 11, recorded honestly.** Two exceptions already exist, both decided by a person:
the lineage contracts are deployed on Sepolia (`contracts/README.md`), and the app claims
cartridge ENS names (`app/title/CartridgeName.tsx`, `chain:claimName` in `src/main/chain/ipc.ts`).
Phase 4 wires neither further, and leaves `UnwrittenLedger` undeployed and unextended. D6 is a new,
separate contract.

## What phase 3 decided that this plan builds on

- **Identity (P3 D7).**
  - Each device has one Ed25519 key, `<userData>/identity/device.key`, kept in safeStorage by
    `src/main/identity/`. It is never regenerated over an unreadable file.
  - An event's `author` is `"k" + base32(public key)`. There is no person-level key.
  - The owner is the genesis author. Access, invites and attach need its key.
  - **Adoption.** A world that was never attached, restored on another device, is adopted: a new
    genesis with `from: { instanceId, world, head }`, and every event re-signed under the new key.
  - An attached world restored on another device is read-only there (`world-device-not-member`)
    until that device redeems an invite.
- **Genesis (P3 D1).** `GenesisBody` holds `name`, `cartridge: CartridgeRef`, `seed`, `language`,
  `physicsVersion`, `createdAt`, `access`, `gates` and `from`. It holds no pack hash and no owner
  name.
- **Events, log and receipts (P3 D2–D4).**
  - An event's `id` is `"h" + base32(sha256(canonicalJson(the event without id and sig)))`, so it
    covers `v`, `world`, `kind`, `author`, `at`, `seen` and `body`. `sig` signs
    `"unmapped-event:v1\n" + id`.
  - `LogEntry { n, rt, chain, event, rsig }`, where `chain(n) = sha256(chain(n−1) + "\n" + n +
    "\n" + rt + "\n" + id)`.
  - `rsig(n)` signs `"unmapped-receipt:v1\n" + chain(n)` with the key that P3 D2's **key schedule**
    gives entry n. The schedule is built from the admitted `sequencer` entries, and `verifyLog`
    checks it.
  - The fold is `applyEntry(now, entry, verdict)`. The verdict comes from `entryVerdict`
    (`src/dsl/history/verdict.ts`: `verifyEvent` plus `validateEventBody`).
  - `FOLD_VERSION` versions the fold's snapshots.
- **Saves and backups (P3 D1, D6).**
  - A save has `saves/<id>/world.json` (the pin) and `saves/<id>/progress.json` (`WorldProgress`:
    errands, episodes, places) beside an unchanged `save.json`.
  - A `.spire-backup` carries both files plus `history/log.jsonl` and `history/outbox.jsonl`.
- **Packs and blobs (P3 D3, D10).**
  - The cartridge pack is announced by an owner `pack` event
    `{ cartridge, pack, bytes }` (latest wins); a shipped built-in revision needs none.
  - Work packs are named in `place` / `chapter` bodies (`work.pack`).
  - Blobs live in `<userData>/blobs/<sha256>`, and on the service at
    `GET /v1/worlds/<id>/blobs/<sha256>`.
  - A joiner unpacks the cartridge and requires its id, version and hash to equal the genesis's.
- **Places (P3 D3).** A place body carries `at` (the entrance chunk, chosen by the writer), and its
  id is `legacyId ?? "p" + 8 base32 chars of the event id`.
- **Invites (P3 D8).**
  - The format is `Invite { v, world, svc, by, key, nonce, exp, uses, sig }`, where `key` is a
    one-time invite key.
  - The link is `unmapped://join?i=…&k=<secret>`.
  - `member.join` is `{ invite, name, proof }`, with the proof signed by the invite secret. The log
    therefore never holds a usable invite.
- **Service (P3 D9–D10).**
  - `src/service/` runs on Bun (`bun run service -- --port 8787`), keeps JSONL files, and imports
    only `@shared` / `@dsl`.
  - Per-world caps: member and owner events ≤ 64 MiB; visitors share one budget (≤ 8 MiB ever);
    blobs ≤ 256 MiB, each ≤ 32 MiB.
  - Visits: one per author per UTC day.
- **Claims (P3 D15–D16).**
  - The answers are `written`, `writing`, `granted`, `refused` or offline, with a 1.5 s timeout.
  - A lease lasts 90 s, is renewed by deltas, and lasts 10 min at most.
  - The claimant runs the model; viewers spend nothing.
- **Beats and rumors (P3 D13–D14).**
  - A `beat` counts only if it equals `computeBeat`.
  - Its `fingerprint` = sha256 of canonical `{world, upTo, chain, at, season, fog, slots, care}`.
  - Rumor candidates are the owner's and members' `deed`, `chapter`, `place`, `member.join` and
    `witness` events: never gifts, notes or visitor events.
  - A member device writes the batch on a `rumors:<beatId>` claim (purpose `rumor`). This happens
    only when P3's per-device "Write rumors in the background" switch is on: by default it is on
    for the owner, off for members.

## Decisions

### D1. An account is a gateway record of device keys; history never mentions it

**What an account is.** `{ id: "a" + base32(128 random bits), keys: [{ key, addedAt, addedBy }],
passkeys, grants, entitlements }`, kept by the gateway. It holds no password, no email in clear, no
world id and no content. Phase 4 adds no person-level key.

**Signing in.**
- Main signs `"unmapped-gateway:v1\n" + nonce + "\n" + gatewayKey` with the device key, following
  P3 D9's `auth` pattern. An unknown key creates an account holding just that key.
- The gateway returns an **account token**: `ugk_` plus 256 random bits, stored hashed, one per
  device, revocable, and expiring after 90 idle days.
- Main saves the token with `writeKeyRecord({ provider: "hosted", … })` (D2). The renderer only
  ever learns "signed in".

**Tokens for `.env` are never shown on screen.** They come from `bun run gateway -- token
<accountId>`, or main writes the line `UNMAPPED_GATEWAY_KEY=…` into a file the player picks in a
native save dialog.

**A second device joins by pairing code.**
- It does not sign in, which would make a second account; accounts never merge. Instead it asks
  for an 8-character code with a request signed by its key, and shows the code next to its key
  fingerprint.
- A device already in the account enters the code, checks the fingerprint, and signs
  `"unmapped-account:v1\nadd\n" + accountId + "\n" + newKey`. Codes are single-use and last 10 min.
- Removal is the same statement with `remove`. The removed device's tokens stop at once.
- A passkey registered on the gateway's web page can sign `add` too. That is the way back in when
  every device is lost. Desktop builds loaded from `file://` cannot run WebAuthn (`prf.ts`).

**Authorship stays per device.** History is signed by device keys, exactly as P3 D2 defines. The
world service never learns account ids, and the gateway never learns world ids. A player's two
devices are two authors that share one `profile` name. To own a world from several devices, a player
adds D5's co-owners, which are ordinary history events. Pairing offers this for **attached** worlds
("also make this device a co-owner of your shared worlds?") but never implies it.

A never-attached world has exactly one sequencing device: its log's receipts are null. So restoring
it on any other device, a co-owner included, still runs P3's adoption into a new world. Adoption
re-signs the copy but leaves out `owner.add`, `owner.remove` and `chain` (D5): the adopter starts as
the only owner, provenance is off, and the adoption notice lists what it left out. An attached
world restored on a co-owner's device opens with owner rights; P3's `world-device-not-member` covers
only non-members.

**Losing every device.** Declined: wrapping the device key in the Data Key. The Data Key's only
portable unwrap path is passkey PRF, and packaged builds cannot run it (`prf.ts`). So it would add a
second secret store without a recovery path that works. Recovery comes from redundancy instead:
- worlds: a co-owner, which the door panel suggests before a world is shared;
- the account: a second device or a passkey;
- progress: `.spire-backup`.

Without any of these, the player loses the account and the door, and their worlds become mirrors
(D5). The screens say so.

**Free allowance and abuse.** Device keys are free to make, so the free allowance is unlocked by a
`Verifier`. The first one checks an email code; the gateway keeps only `HMAC(pepper, normalised
address)`, so one address funds one account per period. With no verifier configured, only the
gateway CLI grants allowance, which is how E2E runs.

**Where it runs.** `src/gateway/`, in the service's layout: Bun, run with `bun run gateway -- --port
8788 --data <dir>`, JSONL folded into memory at start, and importing only `@shared` / `@dsl`. Rule 8
becomes `shared ← dsl ← { main, renderer, service, gateway, browser }`. The gateway is a separate
process from the world service, so anyone can run a world service with no money and no provider
keys in it.

**With no account, everything except hosted generation works:** all of phase 3 (play, witnessing
with an own key or a local model, attach, invite, join, sync, beats, rumors), plus Create, `.world`
files and backups.

### D2. Keys, routing, the gateway, and quota

**Key binding (main only).**
- **Two type families.** `KeyProvider` = `openai | openui-gateway | custom | hosted | qwen-image`.
  It stays separate from `ProviderKind`, which gains only `hosted`.
- **`endpointFor(provider, env)`** in `keys.ts` becomes the only source of an endpoint:
  - presets for `openai` and `openui-gateway`;
  - for `hosted`, `UNMAPPED_GATEWAY_URL`, else a `GATEWAY_URL` constant baked into release builds,
    else none;
  - for `qwen-image`, `QWEN_IMAGE_BASE_URL`, else `http://127.0.0.1:8091/v1`;
  - for `custom`, the URL the key was typed for.
- **Every check goes through it.** `boundEndpoint`, `parseKeyRecord`, `pickApiKey`, `describeKey`
  and `isTrustedInferenceConfig` all use `endpointFor`. Today they read the static
  `PROVIDER_PRESETS[p].baseUrl`, so a saved hosted token would read as `key-unreadable` and its
  `.env` check would fail.
- **The renderer never chooses a hosted or Qwen URL.** `parseConfig` rewrites a `hosted` config's
  `baseUrl` and `apiKeyEnv` from `endpointFor`, and refuses the config when no gateway is
  configured.
- **New `.env` names.** `ENV_NAME` gains `hosted → UNMAPPED_GATEWAY_KEY` and
  `qwen-image → QWEN_IMAGE_API_KEY`.
- **Resolution.** `resolveProviderKey(provider)` (saved, then `.env`) serves image providers and
  the hosted route. `resolveApiKey(config)` maps a config to its provider and calls it.
- **`custom` still never reads `.env`.** This deliberate Rule 6 exception stays: an env secret
  never goes to a URL the renderer picked.
- **A 401 on a saved hosted token.** Main clears that record (`clearKeyRecord`) and shows "signed
  out", so a valid `UNMAPPED_GATEWAY_KEY` is used next. `resolveKey` falls back only for unreadable
  records, so without this a revoked but readable token would shadow `.env`. Keys the player typed
  for other providers are never deleted automatically.
- **`.env.example`** gains every new variable, each with a comment.

**Routing order.** `routeFor(config)` (`src/main/inference/route.ts`) returns
`{ route: "local" | "direct" | "hosted", config, key }`. Its `config` is the *effective* config:
kind, baseUrl and model. `runChat` passes it to both `streamChat` and `recordUsage`, so the ledger
records what actually ran.
1. Local kinds (`apple-fm`, `ollama`, `llamacpp`, `vllm`) → direct, with no key and no gateway.
2. `custom` → its saved key for that exact URL, or no key → direct.
3. `openai` / `openui-gateway` → the saved key, else that provider's `.env` → **own key, direct**.
4. Only when step 3 finds no key, or the player selected `hosted`, and only when a gateway URL is
   configured: the saved account token, else `UNMAPPED_GATEWAY_KEY` → **hosted gateway, metered**.
   The model is the selected id if the gateway's `/v1/models` lists it, else the gateway's
   default. The Model panel names the route and model before any call ("OpenAI · no key → free
   allowance · <model>").
5. Nothing → `no-api-key` with today's hint, plus "or sign in to use the free allowance" when a
   gateway URL exists.

No step runs after a failure. An `auth` error at step 3 is never retried at step 4.
`quota-exhausted` shows its ways out (own key, local model, subscribe, the reset date) instead of
rerouting. Why: the player's own key always beats our quota (the Immersive Translate model),
`.env` keeps working forever, and a silent route change would change who pays and which model
writes the world.

**Defaults and the quote.**
- `defaultConfig` checks, in order: `OPENAI_API_KEY` → `openai`; a configured gateway → `hosted`
  (direction item 9: the free allowance comes first); Apple FM; llama.cpp. Dev builds have no
  gateway URL, so their behaviour is unchanged.
- Phase 2's quote: `callPrice` gains `{ kind: "allowance" }` for `hosted`, and `LOCAL_PROVIDERS`
  gains the missing `vllm`.

**The gateway speaks OpenAI.**
- **Endpoints:**
  - `POST /v1/chat/completions` (streaming, `include_usage`);
  - `POST /v1/images/generations` and `/v1/images/edits`;
  - `GET /v1/models` (a licence and a `default` flag per model);
  - `GET /v1/status` (`{ commercial, billing }`).
- **Body.** The app sends a neutral body; `usesReasoningParams` is false for `hosted`.
- **Grammar.** GBNF travels in an extension field, `grammar`. Today `buildChatBody` adds it only
  for `llamacpp`; the gateway forwards it only to llama.cpp upstreams.
- **Shared code.** `buildChatBody` and the think filter move from `main/inference/{client,think}.ts`
  to `src/shared/chatWire.ts`, so main and the gateway run one copy.
- **Headers.** `X-Request-Id` (the chat id) and `X-Unmapped-Purpose`. No world scope is sent.
- **New errors** in `mapProviderError`:

  | Status | Error |
  | --- | --- |
  | 402 | `quota-exhausted`, with `resetsAt` |
  | 401 on `hosted` | `account-signed-out` |
  | 404 | `gateway-model-unavailable` |
  | 409 | `request-in-flight` or `request-settled` |
  | 429 | `gateway-busy` |

**Quota (gateway side).**
- **Credits** come from the operator's dated cost records: schema in `src/gateway/costs.ts`, data in
  the gateway's data dir. Each record is `{ model, upstream, perMillion: { input, cachedInput,
  output } | perImage, source, asOf }`.
  - OpenAI rows may be copied from `src/shared/pricing.ts`.
  - A self-hosted upstream gets the operator's own dated cost, with its source.
  - A model with no record, text or image, is not served (`gateway-model-unpriced`).
  - The app shows credits as a share of the allowance plus tokens and calls, never as money.
- **The period** is the calendar month in UTC. The allowance is the free grant (once verified) plus
  active entitlements (D3).
- **Execution, not just billing, is deduplicated** by `(account, X-Request-Id)` for 24 h:
  - in flight → 409 `request-in-flight`, and nothing runs;
  - settled → 409 `request-settled`, and nothing is replayed (a real retry uses a new id);
  - unknown → the call runs.
- **Reserve, then settle.** Before forwarding, the gateway reserves `weight(prompt estimate +
  maxTokens)`. When the stream ends it settles on the provider-reported usage; on abort or error it
  releases the rest. At start-up, reservations older than the 10-min stream cap are released.
- **Missing usage.** When the upstream reports none, the reservation is charged and marked
  `charged: "reserved"`. A per-account rate cap answers `gateway-busy`.
- **The ledger** is append-only JSONL: one process per data dir, fsync per write, with `reserve`,
  `settle`, `release`, `grant` and `entitlement` lines.
  - A settle line is a `UsageRecord` plus `{ account, requestId, credits, charged }`, with `scope`
    always `null`.
  - `GET /v1/quota` → `{ period, granted, used, reserved, resetsAt, plan }`. Main re-reads it after
    each hosted call and broadcasts `account:quota`.
  - The app's own `usage.jsonl` still gets a line on every route; its schema does not change.

**"Has someone written here?" (P3 D15).** The world service answers this; the gateway plays no
part.
- A live witness in the local fold is drawn without a call.
- An attached, online world sends `claim` (1.5 s):
  - `written` → sync;
  - `writing` → join that stream;
  - `granted` → generate through `routeFor` and relay;
  - `refused` → an error state;
  - timeout or offline → generate through `routeFor`; the result may become a 異聞.
- A local-only world generates through `routeFor`.

Consequences:
- Quota is spent only by a `granted` claimant or an offline writer, and only on the hosted route.
- A hosted failure mid-claim ends the stream with `end: "abort"`, which releases the lease.
- A lapsed lease, such as a slow local model sending no delta for 90 s, refunds nothing. Its
  result is still submitted and becomes live or a variant, so paid work is never thrown away.
- P3's per-author caps still apply. The gateway adds only its rate cap.
- Automatic rumor batches (P3 D14) run under P3's own "Write rumors in the background" switch. On
  own-key and local routes its defaults stay as phase 3 set them. When the device's route would be
  hosted, the switch defaults to off even on the owner's device, and the panel says the batches
  would use the allowance. So an allowance is never spent in the background unless the player turns
  that on.

### D3. Subscription: entitlements behind a replaceable billing provider

- **Entitlements.** The gateway keeps an append-only log and derives the current state from it:
  `{ accountId, source: "free" | "operator" | "billing:<provider>", plan, creditsPerPeriod,
  status: "active" | "past_due" | "canceled", validFrom, validUntil }`. The log is built from
  provider events, deduplicated by the provider's event id, and ordered by the provider's
  timestamps, never by arrival.
- **Provider interface** (`src/gateway/billing/provider.ts`):
  - `plans()`;
  - `checkout(account, planId, returnUrl) → { url }`;
  - `portal(account) → { url }`;
  - `parseWebhook(raw, headers) → BillingEvent`, signature-checked;
  - `id` and `mode: "test" | "live"`.

  The first implementation is Stripe (Checkout, Billing, customer portal). A plan's credits come
  from catalogue metadata (`unmapped_credits` on the Price), so no plan, price or credit amount
  exists in our code.
- **Settings → Plan.** `GET /v1/plans` answers `ready` (the provider's own names, prices and
  currency) or `error` `billing-not-configured`. With no gateway at all the panel shows `error`
  `gateway-not-configured`, never `idle` (Rule 2). Checkout and the portal open in the system
  browser via `app.openExternal`.
- **Nothing charges real money in development.** The gateway refuses to start with a live key
  (`sk_live_` / `rk_live_`) unless all four hold: `GATEWAY_BILLING_LIVE=1`, `NODE_ENV=production`,
  `GATEWAY_COMMERCIAL=1`, and every served model is commercial.
- **Tests.** A fixture provider (`tests/fixtures/billing/`) serves the failure-list tests. E2E runs
  in Stripe test mode, once a person has made the account.

### D4. Image providers declare their licence; one switch refuses non-commercial ones

**Licence records.** `src/shared/licence.ts` holds `{ id, name, commercial, source, checkedAt,
notes }` for both text and image models, and both the app and the gateway use it. Every claim is
written with its source in `docs/licenses/models.md`. A third-party claim is marked "reported,
unconfirmed" until an E2E checks it.

| Record | Covers | Commercial | Source / notes |
| --- | --- | --- | --- |
| `qwen-research` | Qwen-Image-2.1 | no | Qwen Research License (`https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE`); commercial grant on request; "Built with Qwen". Model card: 7B, RGBA, ≤ 10 references, `QwenImage21Pipeline`. Reported, unconfirmed: released 2026-09-20, no paid 2.1 API, ≈ 16 GB GPU at Q8 |
| `apache-2.0` | Qwen-Image, Qwen-Image-2512 weights | yes | `https://github.com/QwenLM/Qwen-Image`; the self-hostable commercial replacement |
| `openai-terms` | gpt-image-1 / 1-mini | yes (a contract, not a model licence) | Output is assigned to the customer, but it is not exclusive, third-party rights are not cleared, and the terms can change. `https://openai.com/policies/row-terms-of-use/` + the API Services Agreement; re-read before charging. `actors.png` was drawn under these terms (record in `actors.json`) |
| `cc0` | built-in CC0 art | yes | `docs/licenses/ninja-adventure-cc0.md` |

A text model gets a record only when the gateway serves it or a preset names it. A GGUF the player
picks shows "licence: yours to check".

**Registry** (`src/main/images/registry.ts`).
- `ImageProvider` (today in `src/main/works/images.ts`, with phase 2's `ImageOptions`) gains
  `licence` and `locality`.
- The OpenAI provider keeps the id `openai`, so the ledger keeps a single value.
- `imageProvider()` becomes `selectImageProvider()`. The choice is stored in main, in
  `<userData>/images.json` (zod-validated like `inference.json`). The renderer only picks from the
  list main returns.
- The key order is D2's:
  1. a keyless loopback server → direct;
  2. the provider's saved key, then its `.env` (`OPENAI_API_KEY`, `QWEN_IMAGE_API_KEY`) → direct;
  3. the gateway's image endpoint (saved token, then `UNMAPPED_GATEWAY_KEY`);
  4. `no-api-key`, with today's hint naming that provider's variable.

**Every picture carries a licence.** The value is one of:
- a record id;
- `player-supplied`: files picked through `replaceAsset`;
- `unknown`: every picture generated before phase 4, including phase 2's `assets/look.png` and
  works images.

Main writes it in three places:
- in a published cartridge: a hashed `assets/licences.json`, written at publish;
- in an AI world: a main-owned `licences.json` beside the content. It sits outside `contentFiles`
  (`works/store.ts`), the model never writes it, and it travels with the content in P3's work pack;
- in Create: the draft's look candidates.

**The switch is global, not per account.** Commercial mode is on when the build sets
`UNMAPPED_COMMERCIAL=1` (release builds, from the day subscriptions go live), or when the
configured gateway's `/v1/status` says `commercial: true` (required whenever billing is live). It
then applies to every player of that build or gateway, whatever their plan:
- Non-commercial providers cannot be selected, and a call that resolves to one is refused
  (`image-licence-noncommercial`).
- A revision may not add or change a picture whose licence is non-commercial or `unknown`.
- Pictures inherited unchanged from the lineage parent (same hash) are listed in a licence audit
  with a redraw action, but do not block. Mod revisions carry their base's assets unchanged.
- Whether pre-launch pictures may stay in a commercial product is a person's legal call.
- `GATEWAY_COMMERCIAL=1` refuses to start while any served model has a non-commercial record.

**Qwen-Image-2.1 provider** (`src/main/images/qwen.ts`). It is self-hosted: vLLM-Omni (`vllm serve
Qwen/Qwen-Image-2.1 --omni --port 8091`) serves an OpenAI-compatible
`POST /v1/images/generations`.
- It speaks the OpenAI Images API to `endpointFor("qwen-image")`.
- It probes `/v1/models` first; on failure the error is `image-server-unreachable`, with the command
  above as the hint.
- A remote server must use https, key or no key; only loopback may use http.
- Its first E2E confirms two things. `background: "transparent"` must give an alpha channel (else
  `image-no-alpha`). A reference image must go through `/v1/images/edits`; if not, the result says
  `usedReference: false`.

### D5. Co-owners, a `.world` file, and bringing a world back up

**Co-owners (protocol 2).** In phase 3, only the genesis device may write owner kinds, including
`sequencer`, which a rehost needs. Losing that one machine would freeze an attached world.
- **New kinds.** `src/shared/history/{bodies,admit,fold}.ts` gains `owner.add { key }` and
  `owner.remove { key }` (the last owner cannot be removed), and `chain { record: boolean }` for
  D6's opt-in. Every owner may write every owner kind: P3's `access`, `sequencer`, `pack`, `hide`,
  `invite.revoke` and `member.remove`, plus these three.
- **Who counts as owner when.** P3 D2 builds the receipt schedule from *admitted* `sequencer`
  entries, so whether a co-owner's `sequencer` counts depends on who owned the world at its `n`.
  `verifyLog` therefore first makes an ownership pass: the genesis, `owner.add` and `owner.remove`
  in log order, needing only `verifyEvent`. Then it builds P3's schedule unchanged and checks every
  receipt.
- **Co-owner invites.** They use P3 D8's exact `Invite`, link and `member.join { invite, name,
  proof }`. `verifyInvite` accepts a `by` that is an owner at `rt`. Before joining, the invitee checks
  `by` against a link parameter `&o=`: the ≤ 4 `owner.add` entries leading from the genesis author
  to `by`. `&o=` sits outside the signed invite, so P3's `Invite` shape does not change.
- **Protocol 2.** An old build would fold these kinds differently, so `WORLD_PROTOCOL` becomes 2.
  The service refuses a protocol-1 `open` of a world that contains them (`protocol-newer`).

**Validators count as physics.** P3's `FOLD_VERSION` bump only invalidates snapshots. On top of
that, a change to `validateEventBody`, `entryVerdict` or `admit` that refuses an entry an earlier
build admitted also bumps `PHYSICS_VERSION`, and the old rule stays reachable for worlds pinned to
the old version (P3 D18). A later tightening then never fails an old log or `.world`.

**Rehost is P3 D2's schedule, unchanged.**
1. A new service imports the log verbatim; its receipts still verify under K1…Ki.
2. An owner or co-owner submits a `sequencer` event naming the new service's key.
3. The service sequences it at head + 1 as s(i+1), with its own `rt` ≥ `rt(head)`, and signs its
   receipt, and every later one, with K(i+1): "a rehost switches keys from its own entry on".
4. As in P3's attach, the service refuses a `sequencer` event naming any other key.

Phase 4 adds only this path to `world.attach` (skipping the upload, since the service already holds
the log). It restates no receipt rule.

**The `.world` file.** It holds the shared world with no personal state. `save.json`, the
`world.json` pin, `progress.json`, the outbox and `snapshot.json` stay out: they belong to the
`.spire-backup` (P3 D6) or are derived. It is a zip holding:
- **`world.json`:** `{ format: "unmapped.world/1", worldId, head: { n, chain }, protocol,
  physicsVersion, genesisPack, files: [{ path, bytes, sha256 }], exportedAt, exportedBy, services }`.
  `files` is sorted by `@shared/hashOrder` (feac2d3; a hashed ASCII file list, never the fold).
- **`history/log.jsonl`:** sequenced entries only, in P3's exact line format.
- **`blobs/<sha256>`:**
  - `genesisPack`, the blob of the latest `pack` event. For a shipped built-in genesis, which has no
    `pack` event, the exporter packs the pinned revision itself with P3's reproducible
    `packCartridge` (fixed mtime, `hashOrder` entries), so the file never depends on the importing
    build shipping that revision.
  - Every `work.pack` named by a `place` or `chapter` body.
- **`signature.json`:** the exporter's signature over `sha256(canonicalJson(world.json))`, by a
  device key or, for a service export, the service key. It records who exported the file; trust
  comes from the chain, the receipts and the hashes.

**Limits.**
- Blob limits are P3 D9's: ≤ 256 MiB in total, ≤ 32 MiB each.
- The log may hold up to 80 MiB: P3's 64 MiB of member and owner events, 8 MiB of visitor events,
  and 8 MiB for owner kinds and receipts after `world-full`. A larger log is refused at export
  (`world-too-large`).
- All limits are checked from the central directory *before* inflating. The same pre-inflate check
  goes into `unpackCartridge`, which inflates first today, and into P3's work-pack reader, which
  also runs `checkContent` and `workContentHash`.

**Invites.** The log holds only owner-signed invites and proofs bound to joiner keys. The one-time
secrets stay in the links (P3 D8), so a `.world` lets nobody in. Old links also name the old
`svc`, so after a rehost new members need a fresh link.

**Export.** Any member holding the log may export it:
- from the app: main signs, and the native dialog answers `AETHER_TEST_WORLD_PATH` in E2E;
- from the service: `GET /v1/worlds/<id>/export`, under the access policy;
- from the command line: `bun run service -- export`.

**Verifying offline.** `verifyWorldBundle(files)` in `src/dsl/history/worldBundle.ts` is pure. It
lives in `dsl` because it needs `entryVerdict` (Rule 8). Main, the service and
`bun scripts/verify-world.ts <file>` run it. It checks:
1. sizes, every listed hash, and that nothing is unlisted;
2. `verifyLog`: the chain, the ownership pass, then P3 D2's receipt schedule;
3. `entryVerdict` for every entry, under the world's pinned physics, then `foldEntries`; the
   `ignored` list is reported;
4. every `beat` against `computeBeat`;
5. the genesis pack: once unpacked, its `cartridgeId`, `version` and `contentHash` must equal the
   genesis's (P3 D10);
6. every work pack: present, and passing `checkContent` and `workContentHash`;
7. that the physics version is supported.

It returns a report (entries, authors, owners, beats, problems), not a boolean.

**Bringing a world back.**
- **Into any world service.** `bun run service -- import <file> --data <dir>` re-verifies the file,
  stores the log verbatim, stores its blobs, and lists them in `blobs.txt`. The service then serves
  a **mirror**: reads follow the access policy, and submits get `world-mirror-only` until the
  rehost above.
- **Members follow a move link**, `unmapped://world?w=<worldId>&svc=<url>`. A member's main
  switches `link.json` only if the served log extends its own (a chain prefix) and the latest
  admitted `sequencer` names that service's key. Otherwise it shows `history-diverged`.
- **With no owner key left**, the world stays a mirror, visitable and readable with zero model
  calls.
- **Into the desktop app** (Worlds → Import world). This is P3's `world.join` path, from a file
  instead of a service:
  1. Check and install the genesis pack (`installCartridgePack`) and the work packs. P3's
     `works/pack.ts` refuses a `workId@version` that already exists locally with another hash, and
     records received works in `received-works.json`.
  2. Write the log by the backup rule: if absent or a chain prefix, write it; otherwise keep both
     and show `world-history-diverged`.
  3. `createInstance` with the genesis `seed`, `language` and **`physicsVersion`**. Today
     `newRuntimePin` stamps the build's version (`cartridges/integrity.ts`, `instances/store.ts`),
     and P3's join needs the same input. Refused with `physics-newer` when `checkPhysics` fails.
  4. Write the `world.json` pin and an empty `progress.json`.
- **Who may write after a desktop import.** A never-attached world imported on a non-owner device is
  adopted (P3 D7, D1 above). An attached one is read-only there until an invite, unless this device
  is an owner or co-owner. A `.world` plus a `.spire-backup` of the same world combine: the backup
  brings `save.json`, the pin and `progress.json`.

### D6. Light chain: genesis provenance and each beat's fingerprint, paid by the service

**The contract** is new: `contracts/src/provenance/WorldProvenance.sol`. Its bytes32 values are
decoded from P3's encodings by `src/shared/provenance.ts`. It has two calls:
- `openStream(worldId, cartridgeHash, ownerKey, genesisSig, sequencerKey, sequencerSig)`, once per
  `(recorder, worldId)`.
  - `cartridgeHash` is the genesis body's `cartridge.contentHash` (P3 D1), the same sha256 that the
    lineage registry and the ENS record `unwritten.hash` carry.
  - `genesisSig` is the genesis event's own `sig`, so there is no new signature format.
  - `sequencerSig` is the service key signing `"unmapped-provenance:v1\n" + chainId + "\n" +
    contract + "\n" + recorder + "\n" + worldId`.
  - Ed25519 signatures are checked offline, never on chain.
- `recordBeats(worldIds[], upTos[], chains[], fingerprints[])`. Each entry is `BeatBody.upTo`,
  `chain(upTo)` and `BeatBody.fingerprint`, exactly as P3 D13 defines them. Per stream, `upTo`
  only rises.

**Trust and comparison.**
- **Which streams count.** A stream counts only if its `sequencerSig` verifies, for that exact
  recorder address, with a key that an admitted `sequencer` entry installs (P3 D2's schedule, after
  D5's ownership pass). Signatures copied under another sender fail and are shown as "unverified
  stream".
- **Comparing with your copy** is an inclusion check at each recorded `upTo`. If the local log
  reaches that `n`, compare `chain(upTo)` and recompute the fingerprint: "matches" or "differs".
  If it does not, the answer is "not synced that far".
- **A retired service's stream freezes** at its last beat. The next sequencer opens its own stream,
  and the app lists streams in sequencer order.

**Who signs and pays: the world service**, and only for attached worlds. Its env holds
`SERVICE_CHAIN_RPC_URL`, `SERVICE_CHAIN_ID`, `SERVICE_CHAIN_KEY` and `SERVICE_PROVENANCE_ADDRESS`.
Players sign nothing. Records are queued after each accepted beat and retried at the next one; a
beat never waits for the chain.

**Off by default, twice.** The service records nothing without its chain env, and it records a world
only while that world's latest `chain` event says `record: true`.

**The app only reads**, in `src/main/chain/provenance.ts`, using its own
`UNMAPPED_PROVENANCE_RPC_URL`, `_CHAIN_ID` and `_ADDRESS` (main only). These are separate from the
`UNWRITTEN_*` ledger variables, whose example is Base Sepolia (84532). Development uses Ethereum
Sepolia, where the dry-run tooling lives.

**Verification.**
- `bun run provenance --dry-run [--from <service data dir>]`, on `scripts/lib/chainExec.ts`'s
  `dryExec` (`eth_simulateV1`, as `lineage:market --dry-run` does):
  - deploys, opens streams, and batches the real beats in that data dir;
  - runs the refusals, checks the signatures offline, and recomputes the fingerprints;
  - writes gas per step to `result.md`.
- The failure list heads the script, and the in-process EVM test is
  `tests/chain/provenance.test.ts`.
- `contracts:build` gains `scripts/build-provenance.mjs`. A live deploy is run by a person only.

### D7. Mobile: the seams, plus the smallest browser proof

The direction says both "暫時不做手機客戶端" (decision 7: no mobile client for now) and
"手機客戶端" (phase 4). Rule 0 also says not to over-engineer. So phase 4 builds the seams and the
smallest real proof, and a full client waits for a person's decision.

**The seams.**
- **Assets by hash:** P3's blobs, plus a browser LRU.
- **Offline-first:** the log and outbox live on the device.
- **AI through the gateway:** D1's device-key auth, with each request signed by a non-extractable
  WebCrypto key (P3 D9's `X-Unmapped-Auth` pattern), so no bearer token ever sits in a page. This
  is designed but not built into the proof.
- **Input through the action map:** touch produces a standard-mapping `PadSnapshot` that `readPad()`
  (`src/renderer/input/gamepad.ts`) merges with real pads. engine2d does not change, and
  `InputDevice` gains `"touch"`.

**The proof, and nothing more.** In a phone-sized browser, a player can open an invite, walk with a
touch stick, read witnessed places and notes, leave a note, and reload offline to still see the
land.

**How the proof is built.**
- **Location.** `src/browser/`, built by `vite.browser.config.ts` (`bun run browser:dev`), named
  apart from the renderer's `tsconfig.web.json`. `browser` may import `renderer`, never the reverse.
- **Shell.** A small shell, `src/renderer/mobile/`, mounts `LandView2D` in the pixel look. While the
  land is up it sets `useSessionStore`'s screen to `"play"`: `currentMode()` in `gamepad.ts` enters
  play mode only then. Its overlays carry `data-layer`.
- **`window.seed` in the page.**
  - `world.join`, `read`, `append` and `presence` run P3's sync (`worldProtocol.ts`, `verifyLog`,
    `entryVerdict`, `foldEntries`) over the browser's WebSocket, with the log, outbox and pin in
    IndexedDB.
  - A non-extractable WebCrypto Ed25519 key signs events.
  - The `member.join` proof is signed with `@noble/curves` from the link's one-time `&k=` secret,
    which is used once and never stored.
  - As a visitor in a public world, the phone's notes count against P3's shared visitor budget.
  - Blobs are fetched by hash, verified, and kept in an IndexedDB LRU sized by
    `navigator.storage.estimate()`.
  - Everything else returns `err("not-on-this-client", …, "Open this on the desktop app.")`.

**Storage risk, stated honestly.** If the browser evicts the site's data, the phone loses its
personal save and its device key, and starts again as a new device. Its earlier notes stay in
history under the old key; its unsent notes and progress are gone. The proof requests
`navigator.storage.persist()`, shows the storage status, and keeps nothing worth losing: only
position and name. Synced, encrypted saves and key recovery wait for the full-client decision.

**Security.**
- The proof is served from its own origin, never a service's.
- Services send blobs as `application/octet-stream` with `nosniff` and `CSP: sandbox`.
- `connect-src` allows `https: wss:` (plus loopback in dev), so rehosted services work.
- The service gains a `--browser-origin` flag for CORS.

**Verification.** Headless Chromium at 375 × 812 with touch emulation, driven by
`scripts/cdp-drive.ts`. The script gains three new actions: `viewport`, `touch`
(`Input.dispatchTouchEvent`) and `offline` (`Network.emulateNetworkConditions`).

## Work packages (one owner each; others only append to shared registries)

| Package | Owns |
| --- | --- |
| integrity (first) | `src/shared/{integrity,cartridgePack,cartridgeSchemas,archive}.ts`: `sha256`, `cartridgeContentHash`, `fileIntegrity`, the pure `unpackCartridge` with pre-inflate limits, `cartridgeManifestSchema` (with the `genesisSchema` it imports from `main/worlds/schemas.ts`), `bibleIntegrity` (`validate-revision.ts`), `validateArchiveEntryNames` (`main/archive.ts`); every sort via `@shared/hashOrder`; thin wrappers in main |
| owners (first) | the owner kinds in `src/shared/history/{bodies,admit,fold}.ts`, the ownership pass in `verifyLog` (`log.ts`), co-owner invites in `access.ts` and the `&o=` link parameter, `WORLD_PROTOCOL = 2`, validators as physics (`tests/shared/physics.test.ts`), adoption leaving out owner kinds (P3's adoption code in `main/histories/`), co-owner rows in `app/land/WorldDoorSection.tsx` |
| account (D1) | `src/shared/account.ts`, `src/main/account/**` (sign-in, pairing, `.env` token export), `app/title/AccountPanel.tsx`, the Settings tabs in `app/title/SystemPanel.tsx`, `i18n/strings/account.ts` |
| gateway | `src/gateway/**` except `billing/`, `tests/gateway/**` except billing, the `tsconfig.node.json` include |
| route (D2) | `src/main/inference/{route,ipc,client,think,keys,keyStore,config}.ts`, `src/shared/{chatWire,quota}.ts`, `src/shared/llm.ts` (`hosted`, `KeyProvider`), `src/shared/pricing.ts` (`vllm`, allowance), `app/title/ModelPanel.tsx`, the hosted-route default of P3's rumor switch (`app/title/SharedWorldsPanel.tsx`, `app/land/rumors.ts`), `.env.example`, `i18n/strings/model.ts` |
| billing (D3) | `src/gateway/billing/**`, `tests/gateway/billing.test.ts`, `tests/fixtures/billing/**`, `src/shared/billing.ts`, `src/main/billing/**`, `app/title/PlanPanel.tsx` |
| images (D4) | `src/main/images/**` (moved from `works/images.ts`), `src/shared/licence.ts`, the image call sites (`works/ipc.ts`, phase 2's look pictures), the works licence sidecar, the publish-time licence audit, `app/title/ImagePanel.tsx`, `docs/licenses/models.md` |
| bundle (D5) | `src/dsl/history/worldBundle.ts`, `src/main/bundles/**`, `src/service/{bundle,mirror}.ts` and the `import`/`export` lines in `src/service/main.ts`, `physicsVersion` in `createInstance` (`main/instances/store.ts`), the pre-inflate check and licence-sidecar entry in `main/works/pack.ts`, the rehost path of `world.attach` in `main/histories/`, the built-in genesis pack at export, `scripts/verify-world.ts`, `app/library/WorldBundleActions.tsx`, move links in `app/library/JoinWorld.tsx` |
| provenance (D6) | `contracts/src/provenance/**`, `contracts/WorldProvenance.json`, `scripts/{provenance.ts,build-provenance.mjs}`, `src/shared/provenance.ts`, `src/service/chain/**`, `src/main/chain/provenance.ts`, `tests/chain/provenance.test.ts` |
| browser proof (D7) | `src/browser/**`, `vite.browser.config.ts`, `src/renderer/mobile/**`, `src/renderer/input/touch.ts` and the merge lines in `gamepad.ts` / `device.ts`, `scripts/cdp-drive.ts`, the service's `--browser-origin` flag and blob headers |

- **Shared registries** take small appended edits from any package: `src/shared/ipc.ts`,
  `src/preload/index.ts`, `src/main/ipc.ts`, `i18n/strings/{index,errors*}.ts`, the `package.json`
  scripts, and lint/line/tsconfig coverage for `src/gateway` and `src/browser`.
- **Tests** go under `tests/**`; vitest collects `tests/**` and `src/**`.
- **Order.** `integrity` and `owners` land first. After that, the contracts fixed in this plan let
  the other packages run in parallel: the gateway API, `routeFor`, `KeyProvider` / `endpointFor`,
  `ImageProvider` + `licence`, the event kinds, the `verifyWorldBundle` report and the
  `recordBeats` fields.
- **Final step.** The integrating session updates `CLAUDE.md` and the progress page:
  - Rule 8: add `service`, `gateway` and `browser`.
  - Rule 9: the gateway data dir, `.world`, and the licence sidecars.
  - Module contracts for the gateway, routing, images, bundles and provenance.

## Failure lists (Rule 0: at the top of each isolated test, written before the code)

- **`tests/gateway/auth.test.ts`:** a forged or replayed challenge signature; a pairing code that is
  reused, expired, or approved by a key outside the account; a removed device's token still being
  accepted.
- **`tests/gateway/quota.test.ts`:** a retry charged twice; an in-flight duplicate executed twice; a
  reservation leaked by an abort or a crash; a settle larger than its reservation; the month
  rollover; an unpriced model served; a ledger line that carries a world scope.
- **`tests/gateway/billing.test.ts`:** a forged or replayed webhook; out-of-order events; a plan
  without credits metadata; a live key in dev.
- **`tests/inference/keys.test.ts`** (additions): a hosted token sent to a renderer-chosen URL; an
  `.env` token sent to the wrong endpoint; a saved token that got a 401 still shadowing `.env`; a
  key sent over plain http to a remote server.
- **`tests/dsl/worldBundle.test.ts`:** a tampered hash; an unlisted entry; a declared size smaller
  than the inflated one; a broken chain; a receipt under a key the schedule does not give that `n`;
  a genesis pack whose manifest differs from the genesis; a beat that does not recompute; a missing
  blob; unsupported physics; a file order that changes under another locale.
- **`tests/shared/history-owners.test.ts`:** the last owner removed; a `sequencer` written by an owner
  removed before it; a co-owner invite whose `&o=` chain does not reach the genesis author; a
  protocol-1 fold that diverges; an adoption that carries over `owner.add` or `chain`.
- **`tests/chain/provenance.test.ts`:** a repeat open; a beat before open; a falling `upTo`; the
  base32/hex → bytes32 encodings.

## E2E flows (one at a time, throwaway userData, `docs/e2e/milestone-rev6-p4-*`)

Setup: the service runs as `UNMAPPED_SERVICE_TEST=1 bun run service -- --port 8787`, and the gateway
as `bun run gateway -- --port 8788`. The gateway's upstream is a local llama-server, so no money is
spent.

1. **p4-account.**
   - A signs in, and B pairs into A's account by code.
   - A revokes B. B's next hosted call gets a 401, main clears the saved token, and B shows
     "signed out".
   - With `UNMAPPED_GATEWAY_KEY` in B's `.env`, the next call succeeds.
2. **p4-quota.**
   - The gateway CLI grants a small allowance. Witness until `quota-exhausted` shows its ways out.
   - Switch to a local model and keep witnessing; no new gateway lines appear.
   - An invalid `OPENAI_API_KEY` sends the next call direct, where it fails `auth` with no gateway
     line.
   - B watching A's `granted` stream adds no gateway line.
   - A rumor batch leaves B's allowance alone until B turns on P3's rumor switch, which defaults
     to off on the hosted route.
   - A cancelled call releases its reservation.
   - Gateway lines are matched against main's `[inference] done <id>` log lines, since a
     `UsageRecord` has no id.
3. **p4-images-hosted.** With no OpenAI key, an AI-world asset goes through the gateway's image
   endpoint. That writes a gateway line with purpose `image`, and `licences.json` names the
   picture's licence.
4. **p4-billing-off** and **p4-billing-test.**
   - Off: the Plan panel shows `error`, with no plans or prices.
   - Stripe test mode: subscribe → the entitlement appears; cancel → back to free.
   - A live key refuses to start.
5. **p4-licence.**
   - Commercial mode on: Qwen-Image-2.1 cannot be selected. Adding a non-commercial or `unknown`
     picture blocks publishing, while an inherited base picture is only listed. The gateway refuses
     to start with a non-commercial model.
   - Commercial mode off: Qwen-Image-2.1 draws a look picture through vLLM-Omni. This needs a GPU
     endpoint that a person provides; otherwise the step is recorded as not run.
6. **p4-rehost** (done statement 2).
   - A attaches a world built with Create (so it has a `pack` event), adds an otherworld place, invites
     B with a P3 link and makes B a co-owner. Both witness and leave notes.
   - S1, the gateway and A's userData are removed.
   - B exports a `.world`, and `verify-world` passes offline.
   - A fresh S2 (port 8789) imports it as a mirror, and a submit is refused.
   - B submits a `sequencer` for S2. Its receipt verifies under the new key, and every older receipt
     still verifies under S1's key.
   - B sends C a co-owner invite (`&o=`), and C joins with a proof.
   - C sees A's land and enters the otherworld (its work pack came from the file) with **zero**
     `[inference] chat` lines.
   - B witnesses a new chunk, and C sees it.
   - The chain up to the old head is identical on S2, B and C.
7. **p4-import-physics.**
   - A `.world` on unsupported physics is refused with `physics-newer`.
   - A never-attached world whose genesis is `aether-land` 1.2.0 has no `pack` event, so its file
     carries the exporter-made `genesisPack`. It is exported with one `owner.add`, then imported on
     another device where 1.3.0 is installed. There it is adopted (a new world id, no `owner.add`
     carried over), and the save is pinned to 1.2.0 and its physics, with a `world.json` pin and an
     empty `progress.json`.
8. **p4-chain.**
   - After a P3 `fog`-style run with `record: true`, `bun run provenance --dry-run --from <S data>`
     reproduces the service's fingerprints and chains, and the refusals fire.
   - With no chain env anywhere, every screen still works.
9. **p4-browser.** At 375 × 812:
   - open an invite and walk by touch;
   - read a note, then leave one, which appears in desktop app B;
   - go offline and reload; the land still draws;
   - take screenshots.
10. **p4-no-servers.** With only the desktop app and a local model, play, Create, witnessing and
    `.world` export/import all work. No screen asks for an account.

Then `bun run check`, a review of the whole diff, fixes, `CLAUDE.md`, and the progress page.

## What a person must do

- **Servers.** Deploy the gateway and a world service (hosts, TLS, data-dir backups).
- **Gateway settings.** Set its upstream keys, its dated cost records, the release build's
  `GATEWAY_URL`, and the free allowance. Set up the verifier's mail provider, or grant allowance by
  hand.
- **Billing.** Set up Stripe, test mode first: products and prices with `unmapped_credits`, the
  webhook secret, and tax/VAT. Go live later, together with `UNMAPPED_COMMERCIAL=1` in release
  builds.
- **Legal.**
  - Terms of service and a privacy policy.
  - Review `docs/licenses/models.md`.
  - Decide what happens to pictures made before launch with an `unknown` or non-commercial
    licence.
  - Ask Alibaba for a commercial grant, but only if Qwen-Image-2.1 must stay.
  - Add "Built with Qwen" wherever it is used.
- **Qwen-Image.** Provide a GPU endpoint for it over https.
- **Chain.** Deploy `WorldProvenance` (gas) and fund each service's chain key.
- **Mobile.** Decide whether a full mobile client gets built.
- **Desktop.** Sign and notarise the desktop builds.

## Out of scope

- **Mobile:** a full mobile client, native apps, store listings and in-app purchases. The browser
  proof leaves out AI, own keys, Create, places, otherworlds, owning worlds, export and the chain.
- **Chain:** player wallets, tokens and NFTs; new lineage or ENS wiring; any change to
  `UnwrittenLedger` or the lineage contracts; content on chain.
- **Worlds:** reviving writes with no owner key left; model calls by the world service; LRU
  eviction on the desktop.
- **Accounts and billing:** team or organisation accounts; invoices and refunds beyond the
  provider's portal; a multi-region gateway.
- **Later work:** per-world sprite sheets, video and music, forks, and fighting together.
