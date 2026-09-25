# AFM bridge target-device eval

Run from the repository root after `swift build --package-path native/afm-bridge`:

```sh
bun --tsconfig-override tsconfig.test.json native/afm-bridge/Eval/run.ts
```

The runner keeps one helper process alive, probes capabilities, verifies the native
vocabulary against `src/shared/world.ts`, exercises cancellation, then runs every case
through `generateEvents` → `generateLayout` → the repository `SceneArtifactService`.
The fixture contains request inputs only; there are no saved or fallback model outputs.

To exercise the actual main-process provider adapter and final artifact service with one live
scene, run:

```sh
bun --tsconfig-override tsconfig.test.json native/afm-bridge/Eval/provider-run.ts
```

The integration milestone reported `apple-local` available with a 4,096-token context,
completed `events → layout`, and produced a valid artifact with three causal events, no validation
issues, two reachable required targets, and zero overlaps.

## Measured integration run

Target: Apple M2 Pro (16 GB), macOS 27.0 `26A428`, Xcode 27.0 `27A266a`, Swift 6.4.
On-device availability and guided generation both reported available.

| Case | Event latency | Event cached input | Layout latency | Result |
| --- | ---: | ---: | ---: | --- |
| roadside-shrine | 8,826 ms | 0 tokens | 7,311 ms | accepted |
| snow-signal | 6,336 ms | 159 tokens | 5,343 ms | accepted |
| country-well (`ja-JP`) | 7,027 ms | 159 tokens | 5,429 ms | accepted |

Pass rate: **3/3** through OpenUI parse/round-trip, causal validation, asset checks,
AABB/exit clearance, and deterministic grid reachability. The first event request is
the cold observation; later requests show schema/prompt cache use. Three cases are a
spike, not a product reliability benchmark or TPS claim.

Cancellation is exercised by the same eval against an active `generateEvents` request. The target
received terminal `cancelled`, and the control request returned `{ "cancelled": true }`.

## Decision

The local AFM vertical slice is technically viable on this target machine. Keep the
current result as a spike: next approval should be for a minimal main-process provider
adapter plus capability IPC and a larger 30–50 case corpus. Do not begin PCC routing:
the no-entitlement PCC request still fails even though public availability reports true.
