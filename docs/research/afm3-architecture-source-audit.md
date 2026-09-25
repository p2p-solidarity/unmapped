# AFM3 architecture source audit

Research date: 2026-09-20; target-machine spike added 2026-09-21
Scope: primary-source audit of the claims used by the AFM3/OpenUI architecture proposal, plus a reproducible Xcode 27/macOS 27 SDK and runtime probe on the target machine.
Status vocabulary: **Verified** means the cited first-party source says it; **Inference** is a reasoned engineering consequence; **Unverified** means no supporting primary source was found; **Contradicted** means the source says something materially different.

## Executive findings

- Apple exposes an on-device `SystemLanguageModel` and a PCC-backed `PrivateCloudComputeLanguageModel` through Foundation Models on macOS 27. PCC has a 32K context, stronger reasoning, network dependence, and per-user daily limits. **Verified.** [SystemLanguageModel](https://developer.apple.com/documentation/foundationmodels/systemlanguagemodel), [PCC guide](https://developer.apple.com/documentation/FoundationModels/adding-server-side-intelligence-with-private-cloud-compute/)
- `@Generable`/`@Guide` use constrained sampling to produce typed Swift data and avoid malformed output. This is a structural guarantee, not proof of game semantics, graph reachability, or valid OpenUI Lang. The second sentence is an engineering **Inference** from the documented scope.
- Apple’s adapter toolkit page explicitly says 26.0.0 is the last release and is incompatible with OS 27+. **Verified.** It describes adapters for the on-device system model; no public PCC adapter upload, fine-tuning, or adapter-selection API was found. The latter absence is **Unverified** (absence-of-documentation, not proof of impossibility).
- AFM3 Core Advanced’s flash/NAND architecture is real, but the stronger “selects a fixed expert set once and never reselects during generation” wording is **Contradicted**: Apple says it periodically reselects experts during generation. **Verified** details are in Apple’s research article below.
- AFM3-specific 30-token/s, 700-token/s, or 1,000-token/s claims are **Unverified** by Apple’s AFM3 sources. Apple’s older 2024 foundation-model article reports 30 tokens/s on an iPhone 15 Pro, but that is not an AFM3 measurement. OUI-1’s first-party model card reports roughly one second for a light screen on one A100 and 256-token diffusion canvases, not 700/1,000 TPS.
- `AlexWortega/openjev` is an NLI text-classification cross-encoder/reranker/verifier, not a world/DSL generator. Calling it a generator is **Contradicted** by its model tags, model-card task, and the first-party experiment CLI/API.

## Claim-by-claim audit

| Claim | Verdict | Evidence and implication |
| --- | --- | --- |
| `SystemLanguageModel` is the on-device Apple Foundation Model and has a macOS 27 model version. | **Verified** | Apple describes it as the on-device text model, with model versions aligned to macOS 26.0–26.3, 26.4, and 27.0. [Apple API reference](https://developer.apple.com/documentation/foundationmodels/systemlanguagemodel) |
| `PrivateCloudComputeLanguageModel()` is the public PCC entry point on macOS 27. | **Verified** | Apple documents `PrivateCloudComputeLanguageModel()` and availability on iOS/macOS/watchOS/visionOS 27+. [PCC API](https://developer.apple.com/documentation/foundationmodels/privatecloudcomputelanguagemodel), [PCC guide](https://developer.apple.com/documentation/FoundationModels/adding-server-side-intelligence-with-private-cloud-compute/) |
| PCC has 32K context, reasoning levels, network dependence, and a daily usage limit; on-device is offline/unlimited by comparison. | **Verified** | Apple’s capability table explicitly lists 32K vs 4K, multiple reasoning levels vs none, network required vs offline, and daily limit vs unlimited. [PCC guide](https://developer.apple.com/documentation/FoundationModels/adding-server-side-intelligence-with-private-cloud-compute/) |
| A third-party app can select AFM3 Cloud vs AFM3 Cloud Pro by model ID. | **Unverified / not supported by the public API surface** | The public API documents one PCC model class/initializer and no model-ID or Cloud-Pro selector. Apple’s AFM3 research article names Cloud and Cloud Pro as product models, but does not expose a third-party selector. [PCC API](https://developer.apple.com/documentation/foundationmodels/privatecloudcomputelanguagemodel), [AFM3 research](https://machinelearning.apple.com/research/introducing-third-generation-of-apple-foundation-models) |
| `@Generable` gives constrained, typed structured generation. | **Verified** | Apple says the framework converts Swift types to schemas, uses constrained sampling, prevents malformed output, and supports guides such as ranges, enums/choices, and counts. [Guided generation](https://developer.apple.com/documentation/foundationmodels/generating-swift-data-structures-with-guided-generation), [Generable](https://developer.apple.com/documentation/foundationmodels/generable), [Generative app guide](https://developer.apple.com/documentation/foundationmodels/adding-intelligent-app-features-with-generative-models) |
| Guided generation guarantees semantic validity (references exist, map is connected, scene is playable, or OpenUI Lang parses). | **Inference only; not an Apple guarantee** | Apple’s guarantee is format/type validity. The documented schema cannot by itself establish cross-object references, graph properties, or the repository’s parser/limits. Keep the existing parser and semantic validator as the source of truth. [Guided generation](https://developer.apple.com/documentation/foundationmodels/generating-swift-data-structures-with-guided-generation) |
| Apple adapter toolkit 26.0.0 is the last release and is incompatible with macOS/iOS/iPadOS/visionOS 27+. | **Verified** | Apple states this directly in the toolkit version table. It also says adapters target a single system-model version, need an entitlement to deploy, and are approximately 160 MB each. [Adapter training toolkit](https://developer.apple.com/apple-intelligence/foundation-models-adapter/) |
| The public adapter path is for PCC/AFM3 Cloud LoRA. | **Unverified / misleading** | Apple’s adapter page describes custom adapters for the on-device system LLM and the `SystemLanguageModel.Adapter` deployment path. No public PCC upload, fine-tuning, or custom-adapter argument is documented. Do not promise PCC LoRA; treat it as unavailable unless Apple publishes an API. [Adapter training toolkit](https://developer.apple.com/apple-intelligence/foundation-models-adapter/), [Foundation Models index](https://developer.apple.com/documentation/foundationmodels) |
| AFM3 has two on-device models and three PCC server models, including AFM3 Core Advanced (20B sparse, 1–4B active depending on request), AFM3 Cloud, ADM3 Cloud (Image), and AFM3 Cloud Pro. | **Verified** | Apple’s AFM3 research article lists this family and these roles. [AFM3 research](https://machinelearning.apple.com/research/introducing-third-generation-of-apple-foundation-models) |
| AFM3 Core Advanced keeps the full model in flash/NAND, loads selected experts into DRAM, and avoids token-by-token NAND-to-DRAM swapping. | **Verified** | Apple says the full model is stored in flash, NAND bandwidth is too slow for token-by-token swapping, prompt routing selects experts, shared experts remain active, and routed experts are swapped into DRAM when needed. [AFM3 research](https://machinelearning.apple.com/research/introducing-third-generation-of-apple-foundation-models) |
| AFM3 Core Advanced chooses a fixed expert set once per prompt and never reselects while generating. | **Contradicted** | Apple explicitly says the model “periodically reselects them during generation.” Any implementation or performance argument must allow this behavior. [AFM3 research](https://machinelearning.apple.com/research/introducing-third-generation-of-apple-foundation-models) |
| AFM3 Core Advanced runs at about 30 TPS. | **Unverified** | Apple’s AFM3 article gives architecture and quality evaluations but no AFM3 tokens-per-second figure. A separate Apple 2024 article reports 30 TPS on an iPhone 15 Pro for the earlier foundation model, which cannot be relabeled as AFM3. [AFM3 research](https://machinelearning.apple.com/research/introducing-third-generation-of-apple-foundation-models), [2024 Apple foundation-model article](https://machinelearning.apple.com/research/introducing-apple-foundation-models) |
| OUI-1 is a compact OpenUI Lang generator. | **Verified with narrower wording** | Thesys’ first-party Hugging Face card says OUI-1 is a DiffusionGemma 26B-A4B-it fine-tune that writes OpenUI Lang screens, uses 256-token diffusion canvases, has 4B active parameters, and is intended for generative UI rather than general chat. [OUI-1 model card](https://huggingface.co/thesysdev/OUI-1) |
| OUI-1 reliably generates at 700+ or 1,000+ tokens/s. | **Unverified** | The OUI-1 card reports a light screen arriving in about one second on one A100 and describes 256-token canvases; it does not claim 700/1,000 TPS. Keep any speed number labeled as a separate local benchmark, not a source fact. [OUI-1 model card](https://huggingface.co/thesysdev/OUI-1) |
| OpenUI Lang uses up to 67% fewer tokens than JSON. | **Verified as an OpenUI project claim; benchmark scope is limited** | The OpenUI repository README makes this claim, but it is about the language/framework comparison, not proof that every game DSL or OUI-1 output receives that reduction. [OpenUI repository](https://github.com/thesysdev/openui) |
| OUI-1’s 71.7% score is a measured benchmark result. | **Verified with scope** | The model card reports 132/184 (71.7%) on the Generative UI Benchmark under stated serving settings; the benchmark repository documents the 46 briefs, four generations, validators, and exact scoring protocol. It is not a game-world semantic-validity score. [OUI-1 model card](https://huggingface.co/thesysdev/OUI-1), [benchmark repository](https://github.com/thesysdev/generative-ui-bench) |
| `AlexWortega/openjev` is a generator that can produce DSL/world content. | **Contradicted** | The model card tags it `text-classification`, `nli`, `cross-encoder`, and `reranker`; the first-party experiment README says it reads premise/hypothesis pairs and outputs contradiction/entailment/neutral, with a rerank API. It is suitable as a verifier/reranker experiment, not as the generator. [OpenJEV model card](https://huggingface.co/AlexWortega/openjev), [OpenJEV experiments](https://github.com/zefir1990/openjev-experiments) |
| OpenJEV can act as a semantic verifier for generated claims. | **Inference, plausible but needs project evaluation** | Its NLI labels and cross-encoder interface make verifier/reranker use a reasonable architectural hypothesis. The cited repo reports MNLI metrics and game-state experiments, but does not establish correctness for this project’s OpenUI/game DSL. [OpenJEV model card](https://huggingface.co/AlexWortega/openjev), [OpenJEV experiments](https://github.com/zefir1990/openjev-experiments) |

## Target-machine SDK and runtime spike (2026-09-21)

### Decision

The on-device Foundation Models vertical slice is **unblocked on this target Mac**. A standalone, linker-signed Swift executable with no entitlements successfully generated both plain text and a constrained `@Generable` value through `SystemLanguageModel.default`. This is direct device evidence, not an inference from SDK presence.

PCC is **not unblocked for product work**. On this same executable, `PrivateCloudComputeLanguageModel.availability` and `isAvailable` reported available and quota state reported below-limit, but the first generation request failed with an undocumented underlying `ModelManagerServices.ModelManagerError` code `1046`. Apple separately requires a managed PCC entitlement and an eligible account/distribution path. Therefore PCC `availability` is not sufficient proof that the calling binary is authorized, and the repo must not treat it as such.

### Machine and toolchain

| Item | Observed value |
| --- | --- |
| Hardware | Apple M2 Pro, 16 GB, arm64 |
| OS | macOS 27.0, build `26A428` |
| Xcode | 27.0, build `27A266a` |
| Swift driver | Apple Swift 6.4, `swiftlang-6.4.0.34.1`, `clang-2100.3.34.1` |
| macOS SDK | `MacOSX27.0.sdk`, version 27.0 |
| FoundationModels interface | `MacOSX27.0.sdk/System/Library/Frameworks/FoundationModels.framework/Versions/A/Modules/FoundationModels.swiftmodule/arm64e-apple-macos.swiftinterface` |
| Interface compiler/module | Swift 6.4 (`swiftlang-6.4.0.31.4`); FoundationModels module `2.0.68.1.402` |

Reproduction commands:

```sh
xcode-select -p
xcodebuild -version
swift --version
xcrun --sdk macosx --show-sdk-path
xcrun --sdk macosx --show-sdk-version
sw_vers
uname -m
system_profiler SPHardwareDataType
```

The SDK framework is Swift-only in this SDK: it supplies `.swiftinterface`/`.swiftdoc` modules and `FoundationModels.tbd`, but no public `Headers` directory. The link stub has no `allowable-clients`, `parent-umbrella`, or restrictive `flags` entry.

### Public API surface verified from the installed SDK

The installed public Swift interface establishes the following exact availability and signatures:

- `SystemLanguageModel`, `.default`, `.availability`, and `.isAvailable` are available from macOS 26. Its public unavailable reasons are `deviceNotEligible`, `appleIntelligenceNotEnabled`, and `modelNotReady`. A macOS version check or `canImport(FoundationModels)` alone is therefore not a runtime readiness check.
- The macOS 26 session constructors accept `SystemLanguageModel`, tools, instructions, or a transcript. The generic `LanguageModel` conformance and generic session initializer used to pass PCC are macOS 27 APIs.
- `@Generable(description:)`, `@Guide`, `Generable`, typed `respond`, and typed `streamResponse` are macOS 26 APIs. The scaffold's array `maximumCount` guides are also public in that API generation. The macOS 27 deployment target is a valid repository choice, but it is not required merely for typed on-device generation.
- The typed response call is public in this shape:

```swift
let response = try await session.respond(
    to: prompt,
    generating: EventPlanDraft.self,
    options: GenerationOptions(
        samplingMode: .greedy,
        maximumResponseTokens: 256
    )
)
let draft = response.content
```

- `GenerationOptions` publicly provides greedy sampling and seeded random top-K/probability-threshold sampling. macOS 27 responses also expose usage accounting.
- On macOS 27, new code should map `LanguageModelError`, `SystemLanguageModel.Error`, and `LanguageModelSession.Error`. The older `LanguageModelSession.GenerationError` cases remain present but are deprecated in macOS 27.
- `PrivateCloudComputeLanguageModel` is public from macOS 27 and exposes `availability`, `isAvailable`, `quotaUsage`, async language/context properties, and network/quota/service error cases. Its public availability reasons are only `deviceNotEligible` and `systemNotReady`; there is no public `missingEntitlement` case.

Primary source: the installed Xcode SDK interface above. The corresponding Apple reference also says apps must inspect model availability and documents the same on-device reasons: [SystemLanguageModel](https://developer.apple.com/documentation/foundationmodels/systemlanguagemodel).

Useful interface-inspection commands:

```sh
SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"
INTERFACE="$SDK_PATH/System/Library/Frameworks/FoundationModels.framework/Versions/A/Modules/FoundationModels.swiftmodule/arm64e-apple-macos.swiftinterface"
rg -n 'SystemLanguageModel|PrivateCloudComputeLanguageModel|LanguageModelSession|macro Generable|macro Guide|func respond|func streamResponse|GenerationOptions' "$INTERFACE"
rg -n 'entitlement|restricted|distribution' "$INTERFACE"
```

The second search returned no public declaration or annotation requiring a special entitlement for the ordinary on-device `SystemLanguageModel`. Searching SDK entitlement files also found no FoundationModels entitlement for that path. This is consistent with the successful no-entitlement runtime probe, but it is not a blanket statement about every App Store policy or every future OS release.

### Minimal compile-and-run probe

The probe was created under `/tmp`, not in the repository, and compiled as a standalone executable:

```swift
import Foundation
import FoundationModels

@Generable(description: "A tiny structured probe response.")
struct ProbeResult {
    @Guide(description: "The exact literal OK.", .anyOf(["OK"]))
    var status: String
}

@main struct Probe {
    static func main() async {
        let system = SystemLanguageModel.default
        print(system.availability, system.isAvailable, system.contextSize)
        let session = LanguageModelSession(model: system)
        let text = try! await session.respond(
            to: "Reply with exactly the word OK and nothing else.",
            options: GenerationOptions(samplingMode: .greedy, maximumResponseTokens: 8)
        )
        print(text.content, text.usage.input.totalTokenCount, text.usage.output.totalTokenCount)
        let typed = try! await session.respond(
            to: "Return the required status.",
            generating: ProbeResult.self,
            options: GenerationOptions(samplingMode: .greedy, maximumResponseTokens: 16)
        )
        print(typed.content.status)
    }
}
```

```sh
xcrun swiftc -parse-as-library -target arm64-apple-macos27.0 /tmp/afm_probe.swift -o /tmp/afm_probe
codesign -dv --verbose=4 /tmp/afm_probe
codesign -d --entitlements :- /tmp/afm_probe
/tmp/afm_probe
```

The resulting Mach-O was linker-signed/ad hoc (`flags=0x20002(adhoc,linker-signed)`), had no Team ID and printed no entitlement dictionary. Observed output from the second run:

```text
system.availability=available
system.isAvailable=true
system.contextSize=4096
system.variant.displayName=AFM 3 Core
system.supports.current=true
system.generation=success
system.content=OK
system.elapsed=1.554296375 seconds
system.usage.input=65
system.usage.output=3
system.typed=success
system.typed.status=OK
system.typed.elapsed=0.532854458 seconds
```

These timings are two single observations after process launch, not a benchmark or TPS claim. They prove only that plain and typed generation worked on this machine at that moment.

### PCC authorization probe and raw failure

The same no-entitlement executable then inspected and called PCC:

```swift
let pcc = PrivateCloudComputeLanguageModel()
print(pcc.availability, pcc.isAvailable, pcc.quotaUsage.status)
let session = LanguageModelSession(model: pcc)
let response = try await session.respond(
    to: "Reply with exactly the word OK and nothing else.",
    options: GenerationOptions(samplingMode: .greedy, maximumResponseTokens: 8)
)
```

Observed output/error summary:

```text
pcc.availability=available
pcc.isAvailable=true
pcc.quotaUsage=belowLimit(...isApproachingLimit: false)
pcc.generation=error
pcc.error.type=NSError
Error Domain=FoundationModels.LanguageModelError Code=-1
underlying: ModelManagerServices.ModelManagerError Code=1046
```

Neither public FoundationModels API documentation nor the installed public Swift interface assigns a meaning to `ModelManagerError` code `1046`; do not label it as a specific entitlement error. The verified conclusion is narrower: PCC readiness properties did not predict request success for this caller.

A second temporary binary was ad-hoc signed with a self-asserted `com.apple.developer.private-cloud-compute = true` entitlement. `codesign --verify --strict` accepted the file on disk, but Gatekeeper rejected it and launch exited `137` before `main`. This does not identify the exact kernel/signing failure, but it does demonstrate that locally adding the managed entitlement is not a usable bypass. Apple says the entitlement must be assigned to the developer account.

Apple's current first-party requirements are explicit:

- `com.apple.developer.private-cloud-compute` is a Boolean managed entitlement required to use PCC: [entitlement reference](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.private-cloud-compute).
- Eligibility requires App Store Small Business Program enrollment, fewer than two million first-time App Store downloads across the developer's apps, and the PCC entitlement assigned to the account. Eligible apps use PCC through App Store distribution and may test through TestFlight or ad hoc distribution. Losing eligibility starts a six-month migration window: [Accessing Private Cloud Compute](https://developer.apple.com/private-cloud-compute/).
- Apple recommends starting with/evaluating the on-device model, and documents PCC as network-required, quota-limited, 32K-context, and eligible only with the managed entitlement: [PCC integration guide](https://developer.apple.com/documentation/foundationmodels/adding-server-side-intelligence-with-private-cloud-compute).

Consequently, the current self-distributed Electron architecture may use the working on-device model through a Swift helper, but it cannot count on PCC unless the product adopts and validates Apple's account, signing, entitlement, and App Store/TestFlight/ad hoc distribution requirements. PCC must remain optional with a non-PCC fallback.

### Existing bridge baseline and implemented correction

`swift build --package-path native/afm-bridge` passed under this toolchain. Its `capabilities` response reported:

```json
{
  "foundationModels": {
    "compiled": true,
    "runtimeAvailable": true,
    "status": "scaffold_only"
  }
}
```

That was the pre-spike baseline. The implemented bridge now reads
`SystemLanguageModel.default.availability`, preserves the public unavailable reason,
and advertises `generateEvents` / `generateLayout` only when the on-device model and
guided generation are actually available. PCC remains outside the bridge and still requires a successful
request plus valid managed-entitlement signing; its two-value public availability enum
is not treated as authorization evidence.

The finished local vertical slice asks AFM for an ordered typed event sequence, compiles
stable causal IDs and edges deterministically, validates prior-effect satisfiability, then
sends that immutable plan and typed prop requirements into a separate typed spatial
generation. OpenUI source and `SceneAST` are serialized
from the same layout value. A three-case real-device corpus (including `ja-JP`) passed
`SceneArtifactService` 3/3 after OpenUI parse/round-trip, causal, asset, AABB, exit-clearance,
and grid-reachability checks. The final reviewed run observed event latency of 6.34–8.83 s
and layout latency of 5.34–7.31 s; later event requests reported 159 cached input tokens.
These are spike
observations, not a product reliability or throughput claim. The reproducible fixture and
full values are in `native/afm-bridge/Eval/README.md`.

The generated `native/afm-bridge/.build` cache is removed after final verification, as
required by the handover. No product source file was changed during the research probe.

## Electron + Swift bridge, PCC entitlement, quota, and distribution risks

These are engineering implications, not Apple promises:

1. **Bridge boundary — Inference.** Foundation Models is a native Swift framework/API. An Electron renderer cannot call it directly; a macOS build needs a signed Swift helper/native module or equivalent process boundary, then IPC for requests, streamed deltas, cancellation, availability, errors, structured output, and quota state. Keep the renderer provider-neutral and retain the existing OpenAI-compatible/Qwen route for other platforms.
2. **Entitlement — Verified risk.** The entitlement key is `com.apple.developer.private-cloud-compute`, defaults to false, and Apple says PCC development requires eligibility and a managed-entitlement request. [Entitlement reference](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.private-cloud-compute), [PCC guide](https://developer.apple.com/documentation/FoundationModels/adding-server-side-intelligence-with-private-cloud-compute/)
3. **Eligibility/distribution — Verified risk.** Apple’s access page says PCC access is for developers in the App Store Small Business Program with fewer than two million first-time App Store downloads, with the entitlement assigned to the account; if the threshold or program eligibility is lost, Apple says migration is required within six months. This makes a freely distributed/notarized Electron binary an unsafe assumption for PCC availability. [Apple PCC access](https://developer.apple.com/private-cloud-compute/), [Small Business FAQ](https://developer.apple.com/app-store/small-business-program/)
4. **Quota/fallback — Verified risk.** PCC exposes quota state, reset date, and a possible limit-increase suggestion; requests can fail with quota-limit-reached, network-failure, or service-unavailable errors. Product behavior must degrade to on-device or another provider and must not put PCC in a high-frequency chunk-generation hot path. [PCC guide](https://developer.apple.com/documentation/FoundationModels/adding-server-side-intelligence-with-private-cloud-compute/), [PCC errors](https://developer.apple.com/documentation/foundationmodels/privatecloudcomputelanguagemodel/error)
5. **Adapter distribution — Verified risk.** Apple says each adapter targets one system-model version, is about 160 MB, and should be delivered as a versioned asset rather than bloating the main bundle. OS/model updates therefore imply an adapter matrix and retraining/revalidation cost. [Adapter training toolkit](https://developer.apple.com/apple-intelligence/foundation-models-adapter/)

## Decision for this repository

Use Apple guided generation for a typed intermediate representation, serialize deterministically to OpenUI Lang, and continue to parse/validate with the repository DSL. Route high-frequency/offline generation to on-device AFM or Qwen; treat PCC as an optional macOS 27+ escalation with entitlement, network, quota, and distribution checks. Use OpenJEV only as an experimental NLI verifier/reranker after measuring semantic false positives/negatives. Do not make architecture or product claims based on AFM3 30-TPS or OUI-1 700/1,000-TPS figures until they are reproduced on the target hardware.
