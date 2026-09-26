# FoundationModels bridge protocol

`native/afm-bridge` is a deliberately small macOS Foundation Models spike. It is a
persistent process that reads one UTF-8 JSON object per line from stdin and
writes one JSON object per line to stdout. Human-readable diagnostics go only
to stderr, so stdout is safe for an Electron transport.

The wire format is versioned independently from the Swift package:

```text
request line  ->  accepted event  ->  partial events (chat only)  ->  exactly one terminal event
```

The terminal event is `result`, `error`, or `cancelled`. `seq` starts at 1 for
each `requestId` and increases by one for every event belonging to that request,
so a chat's partial events are numbered between `accepted` and its terminal event.
No partial event is written after the terminal one.

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
`generateLayout`, `chat`, and `cancel`. `planWorld` remains intentionally unsupported.

`chat` answers one step of a conversation for Settings → Model's "Apple on-device" choice, so the
app needs no `fm serve`, no port and no `sudo fm license`. Main sends the same messages and tools
it would send any Chat Completions server:

```json
{
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "", "toolCalls": [{"id": "call_1", "name": "give_item", "arguments": "{\"count\":2}"}]},
    {"role": "tool", "content": "{\"ok\":true}", "toolCallId": "call_1", "name": "give_item"}
  ],
  "tools": [{"name": "give_item", "description": "...", "parameters": {"type": "object", "properties": {}}}],
  "maxTokens": 700,
  "minTokens": 280,
  "temperature": 0.85
}
```

The budget is the model's own. The bridge counts the transcript and the prompt (and a program's
schema) with `SystemLanguageModel.tokenCount`, keeps 24 tokens for the chat template, and gives the
answer what is left, at most `maxTokens`. When less than `minTokens` is left it answers
`bridge.context_exceeded` with the three numbers before generating anything; main reports that as
`model-context-too-small`, the code every provider uses. Main's own estimate (`fitOutput`) is not
used for Apple: it reads CJK text about 1.75× longer than this model's tokenizer does.

An optional `program` asks for a guided answer instead of free text (never together with tools):

```json
{"root": "Bible", "args": [
  {"name": "premise", "description": "…", "kind": "text"},
  {"name": "rules", "description": "…", "kind": "list", "minItems": 3, "maxItems": 6}
]}
```

The model fills those arguments, in that order, under guided generation, and the bridge writes the
program `root = Bible("…", ["…", …])` with JSON string escapes (which OpenUI Lang shares). While it
streams, every argument before the one being generated is closed and that one is left open, so each
partial event extends the text before it. Main derives the shape from the dialect's schema
(`programShape` in `src/dsl`); only the world bible sends one today. In free text, 4 of 4 bible
runs grew the rules list to the token cap; guided, 7 of 7 parsed (docs/e2e/milestone-apple-create).

A free-text answer has a loop guard: a passage of at least 8 characters appearing five times among
the last 40 pieces (split at line breaks and list or sentence punctuation) ends the answer just
before its second copy.

System messages become the transcript's instructions (with the tool definitions); everything else
becomes prompt, response, tool-call and tool-output entries. The last message must be a user
message (the new prompt) or tool results, which are followed by a fixed line asking the model to
answer now. Tool `parameters` accept the JSON Schema subset `defineTool` emits (object; string with
optional enum; number or integer with minimum/maximum; boolean; array), converted to a
`DynamicGenerationSchema` so the model's arguments are decoded against it.

Text streams as `partial` events, `{"delta": "..."}`. The `result` payload is
`{"text", "toolCalls": [{"id", "name", "arguments"}], "usage": {"input", "cached", "output"},
"maxTokens", "finish"}`, where `maxTokens` is the budget the bridge gave and `finish` is `stop`,
`length` (the budget ran out) or `repetition` (the loop guard cut it).
When the model calls a tool, the bridge records the call, ends the turn and returns it with the
text so far — the host runs the tool and sends the conversation again, as with any provider.
Generation errors are typed: `bridge.context_exceeded` (before or during generation), `bridge.refused` (guardrail or refusal),
`bridge.unsupported_language`, `bridge.busy` (rate limit, concurrent request, assets not ready),
else `bridge.generation_failed`. `chat` is advertised under the same availability as the
generation methods.

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

`AppleLocalSceneProvider` is the only TypeScript module that understands the scene method payloads;
`appleChat.ts` owns the chat payloads (strict zod on every partial and result) and is what
`runChat` calls for `apple-fm`. A chat request's timeout restarts at every partial event, so it
measures silence rather than answer length. A config saved for the old `fm serve` route is read as
Apple-in-app (`parseConfig`).
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
