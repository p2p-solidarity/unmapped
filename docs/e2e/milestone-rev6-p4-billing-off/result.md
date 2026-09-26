# E2E · rev 6 phase 4 · p4-billing-off (D3 with no billing provider, D1/D2 with no gateway)

Plan item 4, the "off" half: a gateway without `STRIPE_*` answers `billing-not-configured` and the
Plan panel shows that error with no plans or prices; an app with no `UNMAPPED_GATEWAY_URL` shows
`gateway-not-configured` in Plan and Account, offers no "Free allowance" in Settings → Model, and
Create still runs on a local model, failing with the local model's own error when none runs.
**Pass.** Stripe test mode (`p4-billing-test`) is not part of this run.

Model: none reachable on the no-gateway app (the point of the check); the gateway half used the
fixture upstream (`test-chat`, no model).

## Replay

```bash
# Gateway half: services and app A as in milestone-rev6-p4-account; the gateway is started with
# STRIPE_SECRET_KEY= STRIPE_WEBHOOK_SECRET= (empty) and no saved billing key.
D=docs/e2e/milestone-rev6-p4-billing-off
drive 9340 $D/run-a-gateway-no-stripe.json
# App half: a fresh userData and no gateway at all.
mkdir -p $SP/udC
blank UNMAPPED_GATEWAY_URL= AETHER_TEST_USER_DATA=$SP/udC bun run dev --remoteDebuggingPort 9341 &
drive 9341 $D/run-c-no-gateway.json
drive 9341 $D/run-c2-create-local.json
```

Environment: run-a on the shared working tree; run-c and run-c2 on the snapshot tree
(`git archive 51817a3` + this run's fixes, no `.env`), app C started with `UNMAPPED_GATEWAY_URL`,
`OPENAI_API_KEY`, `THESYS_API_KEY`, `UNMAPPED_GATEWAY_KEY` and `UNMAPPED_COMMERCIAL` all set to
the empty string (checked in its process environment: length 0 each).

## What was checked

| # | Expected | Observed |
| --- | --- | --- |
| 1 | A gateway without `STRIPE_*` sells nothing | start line `models 2  commercial off  billing off  … TEST MODE`; `GET /v1/plans` → `{"error":{"code":"billing-not-configured","message":"This gateway sells no plans.","hint":"The operator sets up a billing provider (STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET)."}}` |
| 2 | Settings → Plan shows that error, with no plans and no prices | `[data-plans]`: "Plan · Error · billing-not-configured · This gateway sells no plans. · The operator sets up a billing provider (STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET)."; `[data-plan]` count 0; no currency or "per month/year" text (`a-00`) |
| 3 | No gateway: Model offers no allowance | C's Cloud API chips: `OpenAI`, `OpenUI Gateway`, `Custom API` — no "Free allowance" (`c-00`); the default model is Apple on-device, route "Next call: Apple on-device · this computer · system" |
| 4 | No gateway: Account and Plan say `gateway-not-configured`, never idle | Account: "Error · gateway-not-configured · This build has no generation gateway configured. · Set UNMAPPED_GATEWAY_URL in .env to the gateway's address and restart, or use your own key or a local model in Settings → Model." (no `[data-account]`); Plan: the same error, `[data-plan]` count 0 (`c-01`) |
| 5 | Create still runs with a local model; with none running it shows the local error, no fake success | Create → Start a new game → "A salt marsh where the herons keep the calendar." → Write the world → main `[inference] fail 833aa011… · bible · apple-fm system · 1430 ms · connection-refused`; screen "Error · connection-refused · Could not reach http://127.0.0.1:11535/v1. · select Apple on-device in Settings → Model (it starts fm serve); run `sudo fm license` once first", above it the readiness `new-world-no-model` (`c-02`). Settings → Model had already said why: `fm serve` "exited before becoming ready … YOU HAVE NOT AGREED TO THE APPLE FOUNDATION MODELS CLI LEGAL NOTICE & TERMS" (accepting them is a person's `sudo` step, not done here) |

## Notes

- The snapshot tree has no built `afm-bridge` (`[apple-local] native-helper-start: spawn …/afm-bridge ENOENT`),
  so Apple's scene bridge is absent there; the bible call goes to `fm serve`'s OpenAI endpoint either way.
- With no gateway, C's Model default was Apple on-device (`defaultConfig`: no `OPENAI_API_KEY`, no
  gateway → Apple FM), as D2's defaults say.
