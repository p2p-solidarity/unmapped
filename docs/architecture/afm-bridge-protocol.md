# FoundationModels bridge protocol

`native/afm-bridge` is a deliberately small macOS Foundation Models spike. It is a
persistent process that reads one UTF-8 JSON object per line from stdin and
writes one JSON object per line to stdout. Human-readable diagnostics go only
to stderr, so stdout is safe for an Electron transport.

The wire format is versioned independently from the Swift package:

```text
request line  ->  accepted event  ->  exactly one terminal event
```

The terminal event is `result`, `error`, or `cancelled`. `seq` starts at 1 for
each `requestId` and increases for every event belonging to that request.

## Request envelope

```json
{
  "v": 1,
  "requestId": "req-123",
  "method": "capabilities",
  "payload": {}
}
```

Supported methods are `capabilities`, `planWorld`, `generateEvents`,
`generateLayout`, and `cancel`. `planWorld` remains intentionally unsupported;
the spike implements the two local generation methods only.

`generateEvents` accepts:

```json
{"sceneId":"room-1","brief":"A roadside shrine.","language":"en-US"}
```

It asks AFM for an ordered typed event sequence, then deterministically assigns
stable IDs, subject IDs, edges, entry, and terminal nodes. Unsatisfied model-authored
preconditions are removed rather than emitting an impossible graph, and the validator
still rejects any remaining precondition that no earlier effect can satisfy. This avoids
pretending that `@Generable` can enforce cross-array references. The result contains a
repository-compatible `eventPlan`, typed `subjectRequirements`, and measured duration
and token usage. Required nullable fields are encoded explicitly; effect values are never
omitted.

`generateLayout` accepts the same three fields plus the complete, previously
validated `eventPlan` and its `subjectRequirements`. The bridge treats both as immutable
and rejects, for example, an altar event resolved to a tree. Its result contains `source`,
a matching `ast`, and metrics. Layout coordinates are deterministically
clamped/deconflicted using the same principle as the repository DSL numeric limits;
the TypeScript `SceneArtifactService` still reparses the source and owns final asset,
AABB, exit-clearance, and grid-reachability acceptance.

## Event envelopes

Accepted:

```json
{"v":1,"requestId":"req-123","seq":1,"type":"accepted"}
```

Successful terminal result:

```json
{"v":1,"requestId":"req-123","seq":2,"type":"result","payload":{"protocolVersion":1}}
```

Typed terminal error:

```json
{
  "v": 1,
  "requestId": "req-456",
  "seq": 2,
  "type": "error",
  "error": {
    "code": "bridge.unsupported_operation",
    "message": "planWorld is not implemented by this spike.",
    "hint": "Use generateEvents followed by generateLayout, or route this operation to another provider.",
    "retryable": false
  }
}
```

The unavailable path is also typed. If the helper was built without
`FoundationModels`, generation returns `bridge.unavailable` with a hint to use
a macOS SDK that contains the framework or another inference provider. On a
machine older than macOS 27, the same code is returned with a macOS 27 hint.
`capabilities` remains usable in both cases and reports the compile-time and
runtime availability separately.

## Cancellation

Send a new request with a fresh request ID:

```json
{"v":1,"requestId":"cancel-1","method":"cancel","payload":{"targetRequestId":"req-123"}}
```

The cancel request receives its own accepted/result pair. If the target is
still active, the target receives its one terminal `cancelled` event. A target
that already reached a terminal event is reported as `cancelled: false` in the
cancel result. Cancellation is best-effort and request IDs are never reused.

When stdin reaches EOF, the helper finishes every already accepted request before
exiting. This preserves the terminal-event guarantee for pipes and eval runs.

## Main-process provider

`AppleLocalSceneProvider` is the only TypeScript module that understands the method payloads.
It validates capabilities, event plans, subject requirements, and layouts with strict runtime
schemas, then returns the provider-neutral `SceneDraft`. A caller abort cancels whichever native
stage is active. `createManagedAppleLocalSceneProvider` owns one lazily spawned helper and registers
its close operation with the app lifecycle supplied by the caller.

Electron main now creates that managed provider once per macOS app session, resolves the helper
from the development or packaged location, performs a typed capability round trip during boot, and
exposes the read-only capability result through preload. The provider currently advertises only
`new-room`; state-aware `repair-room` and `expand-room` remain disabled rather than silently ignoring
their existing scene state.

Development resolves the helper at `native/afm-bridge/.build/debug/afm-bridge`. A packaged macOS
app resolves it at `<resources>/afm-bridge`; the release build script and Electron Builder macOS
resources configuration place it there. Non-macOS builds skip the Swift build and can route to a
different provider.

## FoundationModels boundary

The package conditionally imports `FoundationModels` and keeps its `@Generable`
draft schemas behind that compile-time guard. Availability is read from
`SystemLanguageModel.default.availability`, preserving
`deviceNotEligible`, `appleIntelligenceNotEnabled`, and `modelNotReady` as
typed unavailable results. Generation uses only the installed public typed
`respond(... generating:)` API. No hardcoded world, event chain, layout, or model
output is emitted. Generation methods are advertised only when both the runtime model
and guided generation are available. Capabilities also expose the native layout
vocabulary; the TypeScript eval compares it with `src/shared/world.ts` to detect drift.

The event schema deliberately generates an ordered sequence, not model-authored
foreign keys. The bridge compiles that sequence into a linear causal graph and then
validates it. The layout schema emits typed spatial data; OpenUI source and `SceneAST`
are both serialized from that one value so they cannot diverge inside the helper.
Partial or rejected values never appear as successful results.

## Build and run

On macOS with Swift 6 and an SDK containing the framework:

```sh
cd native/afm-bridge
swift build
echo '{"v":1,"requestId":"cap-1","method":"capabilities","payload":{}}' | \
  .build/debug/afm-bridge
```

The first line emitted by the command is JSON. Startup and shutdown messages
are on stderr. Run the real three-case eval, including the TypeScript artifact
acceptance gate, from the repository root:

```sh
bun --tsconfig-override tsconfig.test.json native/afm-bridge/Eval/run.ts
```

The main-process integration smoke uses the real provider adapter instead of speaking NDJSON
directly:

```sh
bun run eval:afm-provider
```

The Electron smoke starts the actual main bundle, lets its lifecycle-owned provider spawn the
helper, performs the capability round trip, and shuts down through the registered cleanup:

```sh
bun run eval:afm-main
```

The eval fixture contains inputs only; it never substitutes sample model output. It also
executes the cancellation contract, checks the shared vocabulary, and runtime-validates
the event-plan wire shape before passing it to the repository service.
`planWorld` still returns a typed unsupported error. Scene-generation UI, PCC routing, and Windows
provider support remain outside this slice. macOS packaging includes the signed release helper at
`Contents/Resources/afm-bridge`; distribution notarization remains a separate release concern.
