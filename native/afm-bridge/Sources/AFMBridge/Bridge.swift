import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

/// Sends one `partial` event for the request being executed (a chat delta). Ignored once the
/// request is terminal, so a cancelled stream can never write after its `cancelled` event.
typealias PartialEmitter = @Sendable (JSONValue) async -> Void

actor BridgeRuntime {
    typealias Executor = @Sendable (RequestMethod, JSONValue, PartialEmitter) async -> OperationOutcome

    private let writer: NDJSONWriter
    private let runtimeAvailabilityOverride: Bool?
    private let unavailableErrorOverride: BridgeError?
    private let executor: Executor?
    private var active: [String: Task<Void, Never>] = [:]
    private var terminalRequests: Set<String> = []
    /// The last `seq` written per open request: partial events sit between accepted and terminal.
    private var sequences: [String: Int] = [:]

    init(
        writer: NDJSONWriter,
        runtimeAvailabilityOverride: Bool? = nil,
        unavailableErrorOverride: BridgeError? = nil,
        executor: Executor? = nil
    ) {
        self.writer = writer
        self.runtimeAvailabilityOverride = runtimeAvailabilityOverride
        self.unavailableErrorOverride = unavailableErrorOverride
        self.executor = executor
    }

    func submit(line: String) async {
        guard !line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        guard line.utf8.count <= 1_048_576 else {
            await writer.event(EventEnvelope(
                requestID: "unknown",
                sequence: 1,
                type: "error",
                error: BridgeError(
                    code: "protocol.line_too_large",
                    message: "The request line exceeds the 1 MiB protocol limit.",
                    hint: "Send a smaller typed payload on one line.",
                    retryable: false
                )
            ))
            return
        }

        let request: RequestEnvelope
        do {
            request = try JSONDecoder().decode(RequestEnvelope.self, from: Data(line.utf8))
        } catch {
            await writer.event(EventEnvelope(
                requestID: "unknown",
                sequence: 1,
                type: "error",
                error: BridgeError(
                    code: "protocol.invalid_json",
                    message: "The input line is not a valid request envelope.",
                    hint: "Send one UTF-8 JSON object per line with v, requestId, method, and payload.",
                    retryable: false
                )
            ))
            return
        }

        guard request.version == 1 else {
            await reject(
                requestID: request.requestID,
                error: BridgeError(
                    code: "protocol.unsupported_version",
                    message: "Request envelope version \(request.version) is not supported.",
                    hint: "Use envelope version v: 1.",
                    retryable: false
                )
            )
            return
        }

        guard !request.requestID.isEmpty else {
            await reject(
                requestID: "unknown",
                error: BridgeError(
                    code: "protocol.invalid_request_id",
                    message: "requestId must not be empty.",
                    hint: "Provide a stable, non-empty requestId and reuse it for all events for that request.",
                    retryable: false
                )
            )
            return
        }

        guard let method = RequestMethod(rawValue: request.method) else {
            await reject(
                requestID: request.requestID,
                error: BridgeError(
                    code: "protocol.unknown_method",
                    message: "Method \(request.method) is not recognized.",
                    hint: "Use capabilities, planWorld, generateEvents, generateLayout, chat, or cancel.",
                    retryable: false
                )
            )
            return
        }

        guard !active.keys.contains(request.requestID), !terminalRequests.contains(request.requestID) else {
            await reject(
                requestID: request.requestID,
                error: BridgeError(
                    code: "protocol.duplicate_request_id",
                    message: "requestId \(request.requestID) has already been used.",
                    hint: "Use a new requestId for each request; cancellation targets the original requestId.",
                    retryable: false
                )
            )
            return
        }

        if method == .cancel {
            await cancel(requestID: request.requestID, payload: request.payload)
            return
        }

        let requestID = request.requestID
        await writer.event(EventEnvelope(requestID: requestID, sequence: nextSequence(requestID), type: "accepted"))
        let task = Task { [weak self] in
            guard let self else { return }
            let emit: PartialEmitter = { [weak self] payload in
                await self?.partial(requestID: requestID, payload: payload)
            }
            let outcome = await self.execute(method: method, payload: request.payload, emit: emit)
            await self.finish(requestID: requestID, outcome: outcome)
        }
        active[requestID] = task
    }

    func finishInput() async {
        while !active.isEmpty {
            let tasks = Array(active.values)
            for task in tasks {
                await task.value
            }
        }
    }

    private func execute(
        method: RequestMethod,
        payload: JSONValue,
        emit: @escaping PartialEmitter
    ) async -> OperationOutcome {
        if method == .capabilities {
            return .result(capabilitiesPayload())
        }

        guard payload.objectValue != nil else {
            return .failure(BridgeError(
                code: "bridge.invalid_payload",
                message: "The \(method.rawValue) payload must be a JSON object.",
                hint: "Send the method-specific request object described in the bridge protocol.",
                retryable: false
            ))
        }

        guard runtimeAvailabilityOverride ?? foundationModelsRuntimeAvailable else {
            return .failure(unavailableErrorOverride ?? unavailableError())
        }

        if let executor {
            return await executor(method, payload, emit)
        }

#if canImport(FoundationModels)
        if #available(macOS 27.0, *) {
            switch method {
            case .generateEvents:
                return await generateEvents(payload: payload)
            case .generateLayout:
                return await generateLayout(payload: payload)
            case .chat:
                return await chat(payload: payload, emit: emit)
            case .planWorld:
                break
            case .capabilities, .cancel:
                break
            }
        }
#endif

        return .failure(unsupportedError(method))
    }

    private func nextSequence(_ requestID: String) -> Int {
        let next = (sequences[requestID] ?? 0) + 1
        sequences[requestID] = next
        return next
    }

    private func partial(requestID: String, payload: JSONValue) async {
        guard active[requestID] != nil, !terminalRequests.contains(requestID) else { return }
        let sequence = nextSequence(requestID)
        await writer.event(EventEnvelope(requestID: requestID, sequence: sequence, type: "partial", payload: payload))
    }

    private func finish(requestID: String, outcome: OperationOutcome) async {
        active.removeValue(forKey: requestID)
        guard !terminalRequests.contains(requestID) else { return }
        terminalRequests.insert(requestID)
        let sequence = nextSequence(requestID)
        sequences.removeValue(forKey: requestID)

        switch outcome {
        case let .result(payload):
            await writer.event(EventEnvelope(requestID: requestID, sequence: sequence, type: "result", payload: payload))
        case let .failure(error):
            await writer.event(EventEnvelope(requestID: requestID, sequence: sequence, type: "error", error: error))
        }
    }

    private func cancel(requestID: String, payload: JSONValue) async {
        await writer.event(EventEnvelope(requestID: requestID, sequence: nextSequence(requestID), type: "accepted"))

        guard let target = payload.objectValue?["targetRequestId"]?.stringValue, !target.isEmpty else {
            await finish(requestID: requestID, outcome: .failure(BridgeError(
                code: "bridge.invalid_payload",
                message: "cancel requires a non-empty targetRequestId.",
                hint: "Send {\"targetRequestId\": \"<active requestId>\"} as the cancel payload.",
                retryable: false
            )))
            return
        }

        let wasActive = active[target] != nil && !terminalRequests.contains(target)
        active[target]?.cancel()
        active.removeValue(forKey: target)

        if wasActive {
            terminalRequests.insert(target)
            let sequence = nextSequence(target)
            sequences.removeValue(forKey: target)
            await writer.event(EventEnvelope(requestID: target, sequence: sequence, type: "cancelled"))
        }

        await finish(requestID: requestID, outcome: .result(.object([
            "targetRequestId": .string(target),
            "cancelled": .bool(wasActive)
        ])))
    }

    private func reject(requestID: String, error: BridgeError) async {
        guard !terminalRequests.contains(requestID) else { return }
        terminalRequests.insert(requestID)
        await writer.event(EventEnvelope(requestID: requestID, sequence: 1, type: "error", error: error))
    }
}

private var foundationModelsRuntimeAvailable: Bool {
#if canImport(FoundationModels)
    if #available(macOS 27.0, *) {
        let model = SystemLanguageModel.default
        return model.isAvailable && model.capabilities.contains(.guidedGeneration)
    }
    return false
#else
    return false
#endif
}

private func unavailableError() -> BridgeError {
#if canImport(FoundationModels)
    if #available(macOS 27.0, *) {
        switch SystemLanguageModel.default.availability {
        case .available:
            return BridgeError(
                code: "bridge.guided_generation_unavailable",
                message: "The system model is available but does not support guided generation.",
                hint: "Use a model with guided generation or route to another inference provider.",
                retryable: false
            )
        case let .unavailable(reason):
            return modelUnavailableError(reason)
        }
    }
    return BridgeError(
        code: "bridge.unavailable",
        message: "This helper requires macOS 27 or newer for FoundationModels.",
        hint: "Run the helper on macOS 27+ or route the request to another inference provider.",
        retryable: false
    )
#else
    return BridgeError(
        code: "bridge.unavailable",
        message: "This build was compiled without the FoundationModels framework.",
        hint: "Build on macOS with an SDK that provides FoundationModels, or route the request to another inference provider.",
        retryable: false
    )
#endif
}

private func capabilitiesPayload() -> JSONValue {
#if canImport(FoundationModels)
    let compiled = true
    let availability: JSONValue
    let generationAvailable: Bool
    let vocabulary: JSONValue
    if #available(macOS 27.0, *) {
        let model = SystemLanguageModel.default
        let guidedGeneration = model.capabilities.contains(.guidedGeneration)
        generationAvailable = model.isAvailable && guidedGeneration
        let status: String
        switch model.availability {
        case .available:
            status = "available"
        case let .unavailable(reason):
            status = availabilityReason(reason)
        }
        availability = .object([
            "compiled": .bool(compiled),
            "runtimeAvailable": .bool(generationAvailable),
            "status": .string(status),
            "guidedGeneration": .bool(guidedGeneration),
            "contextTokens": .number(Double(model.contextSize))
        ])
        vocabulary = .object([
            "biomes": .array(LayoutBiome.allCases.map { .string($0.rawValue) }),
            "tiles": .array(LayoutTile.allCases.map { .string($0.rawValue) }),
            "propKinds": .array(LayoutObjectKind.allCases.map { .string($0.rawValue) })
        ])
    } else {
        generationAvailable = false
        availability = .object([
            "compiled": .bool(compiled),
            "runtimeAvailable": .bool(false),
            "status": .string("macos_27_required")
        ])
        vocabulary = emptyLayoutVocabulary
    }
#else
    let generationAvailable = false
    let availability = JSONValue.object([
        "compiled": .bool(false),
        "runtimeAvailable": .bool(false),
        "status": .string("framework_unavailable")
    ])
    let vocabulary = emptyLayoutVocabulary
#endif

    let methods = ["capabilities", "planWorld", "generateEvents", "generateLayout", "chat", "cancel"].map { name in
        let status: String
        if name == "capabilities" || name == "cancel" {
            status = "available"
        } else if (name == "generateEvents" || name == "generateLayout" || name == "chat") && generationAvailable {
            status = "available"
        } else {
            status = "unsupported"
        }
        return JSONValue.object([
            "method": .string(name),
            "status": .string(status)
        ])
    }

    return .object([
        "protocolVersion": .number(1),
        "bridgeVersion": .string("0.3.0"),
        "platform": .string("macOS"),
        "operatingSystem": .string(ProcessInfo.processInfo.operatingSystemVersionString),
        "foundationModels": availability,
        "layoutVocabulary": vocabulary,
        "methods": .array(methods)
    ])
}

private var emptyLayoutVocabulary: JSONValue {
    .object([
        "biomes": .array([]),
        "tiles": .array([]),
        "propKinds": .array([])
    ])
}

private func unsupportedError(_ method: RequestMethod) -> BridgeError {
    BridgeError(
        code: "bridge.unsupported_operation",
        message: "\(method.rawValue) is not implemented by this spike.",
        hint: "Use generateEvents followed by generateLayout, or route this operation to another provider.",
        retryable: false
    )
}

#if canImport(FoundationModels)
@available(macOS 27.0, *)
func modelUnavailableError(
    _ reason: SystemLanguageModel.Availability.UnavailableReason
) -> BridgeError {
    BridgeError(
        code: "bridge.unavailable",
        message: "The on-device system language model is unavailable: \(availabilityReason(reason)).",
        hint: availabilityHint(reason),
        retryable: reason == .modelNotReady
    )
}

@available(macOS 27.0, *)
private func availabilityReason(
    _ reason: SystemLanguageModel.Availability.UnavailableReason
) -> String {
    switch reason {
    case .deviceNotEligible:
        return "device_not_eligible"
    case .appleIntelligenceNotEnabled:
        return "apple_intelligence_not_enabled"
    case .modelNotReady:
        return "model_not_ready"
    @unknown default:
        return "unknown"
    }
}

@available(macOS 27.0, *)
private func availabilityHint(
    _ reason: SystemLanguageModel.Availability.UnavailableReason
) -> String {
    switch reason {
    case .deviceNotEligible:
        return "Use an Apple Intelligence-capable Mac or route the request to another inference provider."
    case .appleIntelligenceNotEnabled:
        return "Enable Apple Intelligence in System Settings, or route the request to another provider."
    case .modelNotReady:
        return "Wait for the on-device model to finish downloading, then retry."
    @unknown default:
        return "Check Apple Intelligence availability or route the request to another provider."
    }
}
#endif
