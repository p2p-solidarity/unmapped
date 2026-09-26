# E2E · rev 6 phase 4 · p4-quota (D2 routing and the allowance)

Plan item 2 of `docs/plans/rev6-phase4.md`, the parts assigned to this run: with no allowance the
call is refused `quota-exhausted` with its ways out; the gateway CLI grants; calls spend until the
allowance is exhausted and the Account panel reads the gateway's numbers; a cancelled call releases
its hold; a local model adds no gateway line and fails locally; an invalid `OPENAI_API_KEY` goes
direct, fails `auth` at OpenAI and adds no gateway line. **Pass** for those. The watcher and rumor
items of plan item 2 were not run (below).

Model: `test-chat` through the fixture upstream, which answers only "Hello." (Create's `dsl-parse`
after a hosted call is expected). The one call that left this machine is step 7's, to
api.openai.com with a clearly fake key, refused 401 (costs nothing).

## Replay

```bash
# SP, services and app A as in milestone-rev6-p4-account (A signed in, account granted 20,000,
# B's six calls spent 2,010). blank() and drive() are defined there.
D=docs/e2e/milestone-rev6-p4-quota
drive 9340 $D/run-a1-no-allowance.json            # before any grant
drive 9340 $D/run-english.json                    # only when a restart lands on another Vite port
curl -X POST 'http://127.0.0.1:8791/__fixture/mode?to=hang-stream'
drive 9340 $D/run-a2-cancel-release.json; curl -H "authorization: Bearer <token>" http://127.0.0.1:8788/v1/quota
drive 9340 $D/run-a3-cancel.json
curl -X POST 'http://127.0.0.1:8791/__fixture/mode?to=no-usage'
drive 9340 $D/run-a4-spend.json
drive 9340 $D/run-a5-exhausted.json
drive 9340 $D/run-a6-local.json                   # nothing on 127.0.0.1:11434
# restart A with OPENAI_API_KEY=sk-e2e-fake-invalid-key-not-real-0000000000
drive 9340 $D/run-a7-bad-env-key.json
```

Environment: run-a1 … run-a4 on the shared working tree (main `51817a3` + other sessions'
uncommitted edits + this run's fixes); other sessions' i18n edits kept reloading the dev renderer
(Vite HMR) mid-step, so the gateway, the fixture and A were restarted from a **snapshot**
(`git archive 51817a3` + this run's fixes, `node_modules` symlinked, no `.env`) on the same
`SP/gw` and `SP/udA` for run-a5 … run-a7. `gateway-upstreams.json` / `gateway-costs.json` are the
gateway's files; `gateway-ledger.jsonl` is its whole ledger at the end (26 lines: 2 grant,
12 reserve, 10 settle, 2 release — every hold ended, `reserved` 0).
run-a4 and run-a5 shoot to the same two file names; the kept `a-04` / `a-05` are run-a5's (run-a4's
`a-04` caught the title after another session's edit reloaded the page mid-step).

## What was checked

Account `ajbsvnshdt6okxovaszfrreh63m`; request ids are main's chat ids, matched to the gateway's
`settle|release <account> <id>` lines (`gateway.log.txt`, `main.log.txt`).

| # | Expected | Observed |
| --- | --- | --- |
| 1 | No allowance: `quota-exhausted` with its ways out, nothing held | `fail 6b94add1… · hosted test-chat · 16 ms · quota-exhausted` (screen lost to a renderer reload) and the replay `fail 9ac2bf37… · 20 ms · quota-exhausted`: "This account's allowance for the month is used up. It resets 2026-10-01T00:00:00.000Z." / "Use your own key or a local model, subscribe, or wait for the reset." (`a-01`); no ledger line for either (refused before the hold) |
| 2 | The CLI grants | `bun run gateway -- grant ajbsvnshdt6okxovaszfrreh63m 20000 --data $SP/gw` → `{"period":"2026-09","granted":20000,"used":0,"reserved":0,…}` (handed to the running gateway on loopback); ledger `grant` 03:30:35.824Z, `source: operator`. Later `grant … 40000` → granted 60,000 (for p4-images-hosted) |
| 3 | A running call holds its reservation; Cancel releases it (`release … abort`) and `reserved` returns to 0 | Fixture `hang-stream`; "Write the world" → ledger `reserve e114575e… credits 16974` 03:36:47.781Z; `GET /v1/quota` → `used 2010, reserved 16974` (`a-02`); Cancel → main `fail e114575e… · 3355 ms · aborted`, gateway `release ajbsvnshdt6okxovaszfrreh63m e114575e… abort` 03:36:51.123Z; `GET /v1/quota` → `used 2010, reserved 0` (`a-03`) |
| 4 | Spend until exhausted: a call with no reported usage is charged its hold, then the next is refused | Fixture `no-usage`; "Write the world" → `done 4e6e6c5a… · 78 ms · max 1400` (no tokens) ↔ `settle … 4e6e6c5a… in - out - credits 16974/16974 (reserved)`; its repair call `fail 4d4cdf43… · 6 ms · quota-exhausted`. `GET /v1/quota` → `granted 20000, used 18984, reserved 0` |
| 5 | Exhausted: the next call is refused with the numbers | `fail 36e7be57… · 48 ms · quota-exhausted`: "This call may cost up to 16974 credits; 1016 are left this month. It resets 2026-10-01T00:00:00.000Z." (`a-04`) |
| 6 | The Account panel reads the gateway's numbers (a share, credits, this computer's tokens and calls) | "Allowance this month (2026-09) · 5% of the allowance left · 18,984 of 20,000 gateway credits used · 0 held for calls running · resets 10/1/2026, 9:00:00 AM · This computer this month: 1 call through the gateway, 0 input and 0 output tokens · 1 call without reported tokens" (`a-05`) = 2,010 (B, 6 × 335) + 16,974 (the charged hold); A's one finished hosted call is the charged-hold one, whose tokens the fixture never reported |
| 7 | A local model: the route says local, no gateway line, the call fails locally | Settings → Model → On this computer → Ollama → Use this model: `data-route="local"` "Next call: Ollama · this computer · qwen3.5:4b" (`a-06`); "Write the world" → `fail fd3a7c25… · bible · ollama qwen3.5:4b · 1602 ms · connection-refused`, screen "Could not reach http://127.0.0.1:11434/v1." / "check the endpoint (http://127.0.0.1:11434/v1) in Settings → Model and that the server is running" (`a-07`); ledger 19 lines before and after, no gateway log line |
| 8 | An invalid `OPENAI_API_KEY`: the route says `.env`, the call goes direct and fails `auth`, no gateway line, never retried on the gateway | A restarted with `OPENAI_API_KEY=sk-e2e-fake-invalid-key-not-real-0000000000`; Cloud API → OpenAI → Use this model: `data-route="direct"` "Next call: OpenAI · key from .env · gpt-5.4-mini" (`a-08`); "Write the world" → `fail aed11706… · bible · openai gpt-5.4-mini · 503 ms · auth`, screen "The provider rejected the credentials: 401 Incorrect API key provided: sk-e2e-f*…0000…" (`a-09`); ledger still 19 lines, no gateway log line. The idea step's model check (`new-world-no-model` above it) also asked OpenAI with that key and was refused; its request is not logged |

The device line after the fix in `src/main/account/hostedUsage.ts` (below): A's first reading after
the restart that picked it up, with two `quota-exhausted` refusals, one upstream error and one
cancel in its `usage.jsonl` and nothing finished, was "This computer this month: 0 calls through
the gateway, 0 input and 0 output tokens" (read by the eval in the first, interrupted run-a4).

## Found on the way

1. **The fixture upstream died mid-run** (fixed, `tests/fixtures/gateway/serveUpstream.ts`). The
   first cancel attempt (`39cd3cde`) coincided with a renderer reload; the hanging call kept
   running in main, Bun's default 10 s idle timeout closed the fixture's request, and the fixture
   process exited on the unhandled `AbortError` it put into the served stream. The gateway released
   the hold (`release … 39cd3cde… error`, main `gateway-upstream-unreachable · 12127 ms`). The served
   fixture now has `idleTimeout: 0` and passes no abort signal into the served body, so a hang lasts
   until the client leaves and leaving never crashes it; the in-memory fake the tests use is unchanged.
2. **Refused calls were counted as device calls** — fixed in `src/main/account/hostedUsage.ts`
   (see milestone-rev6-p4-account, "Found on the way" 1).
3. **Main does not abort a hosted call when the renderer reloads.** `39cd3cde` stayed open for 12 s
   after the page that asked for it was gone, holding 16,974 credits. Release builds do not
   hot-reload, but a renderer crash would do the same; not changed (main's `inference/ipc.ts` is
   another package).
4. **Create's idea step names no model on the hosted route:** "Using hosted · (3 ms)" — the model id
   is blank (the gateway default) where the route line says `test-chat`. Not changed (the idea step
   is outside this run's files).
5. **"This draft: N calls"** in Create counts refused calls too (8 calls, 0 in / 0 out after these
   steps). It is the draft's attempts, not the gateway's; left as is.

## Not run

- "B watching A's `granted` stream adds no gateway line" and "a rumor batch leaves B's allowance
  alone until B turns on the rumor switch": they need an attached shared world with claims and
  beats (phase 3's service), outside this run's assignment.
