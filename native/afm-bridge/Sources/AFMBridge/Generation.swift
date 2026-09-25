#if canImport(FoundationModels)
import Foundation
import FoundationModels

private struct GenerateEventsRequest: Decodable, Sendable {
    let sceneID: String
    let brief: String
    let language: String
    let purpose: String
    let origin: Bool
    let stateContext: String

    private enum CodingKeys: String, CodingKey {
        case sceneID = "sceneId"
        case brief
        case language
        case purpose
        case origin
        case stateContext
    }
}

@available(macOS 27.0, *)
private struct GenerateLayoutRequest: Decodable, Sendable {
    let sceneID: String
    let brief: String
    let language: String
    let purpose: String
    let origin: Bool
    let stateContext: String
    let eventPlan: EventPlanDraft
    let subjectRequirements: [SubjectRequirement]

    private enum CodingKeys: String, CodingKey {
        case sceneID = "sceneId"
        case brief
        case language
        case purpose
        case origin
        case stateContext
        case eventPlan
        case subjectRequirements
    }
}

@available(macOS 27.0, *)
func generateEvents(payload: JSONValue) async -> OperationOutcome {
    let request: GenerateEventsRequest
    do {
        request = try decodePayload(
            GenerateEventsRequest.self,
            payload: payload,
            allowedKeys: ["sceneId", "brief", "language", "purpose", "origin", "stateContext"]
        )
    } catch {
        return invalidPayload(
            "generateEvents requires sceneId, brief, language, purpose, and stateContext strings: \(error.localizedDescription)"
        )
    }
    if let error = validateRequest(sceneID: request.sceneID, brief: request.brief, language: request.language) {
        return .failure(error)
    }

    let started = Date()
    let session = LanguageModelSession(
        model: SystemLanguageModel.default,
        instructions: """
        Produce a small ordered causal event sequence for one game room. Use one to eight steps in
        causal order from room entry to the terminal action. Use short id hints and state keys.
        Every step carries a typed subject kind; it is ignored for enter and exit, but must match
        the prop described by an interact step. Use only the typed trigger, predicate, and effect
        choices. Every effect has a short value, including remove. Every precondition must be
        satisfied by a preceding effect. The bridge assigns stable IDs and edges from array order.
        """
    )
    session.prewarm()
    do {
        var response = try await session.respond(
            to: """
            Scene ID: \(request.sceneID)
            Language: \(request.language)
            Room brief between BEGIN BRIEF and END BRIEF.
            BEGIN BRIEF
            \(request.brief)
            END BRIEF
            Operation: \(request.purpose)
            Existing world state between BEGIN STATE and END STATE. For repair-room, preserve the
            room and fix only what the brief asks. For expand-room, extend it without deleting
            existing content. For new-room, create it from scratch.
            BEGIN STATE
            \(request.stateContext)
            END STATE
            """,
            generating: GeneratedEventSequence.self
        )
        try Task.checkCancellation()
        var compiled = compileEventSequence(response.content)
        if let error = generationPlanError(compiled.eventPlan, origin: request.origin) {
            response = try await session.respond(
                to: """
                The previous plan was rejected: \(error.message)
                Return one complete corrected ordered sequence. Preserve the room brief, include a
                value for every effect, and make each precondition satisfiable by an earlier effect.
                """,
                generating: GeneratedEventSequence.self
            )
            try Task.checkCancellation()
            compiled = compileEventSequence(response.content)
            if let repairedError = generationPlanError(compiled.eventPlan, origin: request.origin) {
                return .failure(repairedError)
            }
        }
        let result: [String: JSONValue] = [
            "sceneId": .string(request.sceneID),
            "eventPlan": try jsonValue(compiled.eventPlan),
            "subjectRequirements": try jsonValue(compiled.subjectRequirements),
            "metrics": generationMetrics(started: started, usage: response.usage),
        ]
        return .result(.object(result))
    } catch is CancellationError {
        return cancelledGeneration()
    } catch {
        return generationFailure(error)
    }
}

@available(macOS 27.0, *)
func generateLayout(payload: JSONValue) async -> OperationOutcome {
    let request: GenerateLayoutRequest
    do {
        request = try decodePayload(
            GenerateLayoutRequest.self,
            payload: payload,
            allowedKeys: [
                "sceneId", "brief", "language", "purpose", "origin", "stateContext", "eventPlan",
                "subjectRequirements"
            ]
        )
    } catch {
        return invalidPayload(
            "generateLayout requires sceneId, brief, language, purpose, stateContext, eventPlan, and subjectRequirements: \(error.localizedDescription)"
        )
    }
    if let error = validateRequest(sceneID: request.sceneID, brief: request.brief, language: request.language) {
        return .failure(error)
    }
    if let error = validateEventPlan(request.eventPlan) {
        return .failure(error)
    }

    let encodedPlan: String
    let encodedRequirements: String
    do {
        let data = try JSONEncoder().encode(request.eventPlan)
        encodedPlan = String(decoding: data, as: UTF8.self)
        let requirementData = try JSONEncoder().encode(request.subjectRequirements)
        encodedRequirements = String(decoding: requirementData, as: UTF8.self)
    } catch {
        return .failure(BridgeError(
            code: "bridge.encoding_failed",
            message: "The validated event plan could not be encoded.",
            hint: "Retry the request; report this bridge bug if it repeats.",
            retryable: false
        ))
    }

    let started = Date()
    let session = LanguageModelSession(
        model: SystemLanguageModel.default,
        instructions: """
        Lay out one small game room for the immutable causal event plan. Do not change the plan.
        Create props in the exact propN array positions and kinds listed by subject requirements,
        plus enough exits for every exitN subject. A quiet open-land origin may have no exit.
        Include one to three residents and obey every operation-specific correction in the brief. Keep all
        coordinates within the generated floor. Only include exits required by the event plan;
        avoid placing objects on exits and leave open walking space to every exit. Ambient and sun
        lights have no coordinates; point lights have both. Colors use lowercase #rrggbb.
        """
    )
    session.prewarm()
    do {
        var response = try await session.respond(
            to: """
            Scene ID: \(request.sceneID)
            Language: \(request.language)
            Room brief between BEGIN BRIEF and END BRIEF.
            BEGIN BRIEF
            \(request.brief)
            END BRIEF
            Immutable event plan: \(encodedPlan)
            Required prop subjects: \(encodedRequirements)
            Operation: \(request.purpose)
            Open-land origin: \(request.origin)
            Existing world state between BEGIN STATE and END STATE. Preserve it for repair-room;
            retain it and add to it for expand-room.
            BEGIN STATE
            \(request.stateContext)
            END STATE
            """,
            generating: SceneLayoutDraft.self
        )
        try Task.checkCancellation()
        var compiled = compileLayout(
            sceneID: request.sceneID,
            eventPlan: request.eventPlan,
            subjectRequirements: request.subjectRequirements,
            draft: response.content,
            origin: request.origin
        )
        if case let .failure(error) = compiled {
            response = try await session.respond(
                to: """
                The previous layout was rejected: \(error.message)
                Return one complete corrected layout. Keep every coordinate below its own floor
                width and depth, preserve all required propN and exitN subjects, and avoid overlaps.
                """,
                generating: SceneLayoutDraft.self
            )
            try Task.checkCancellation()
            compiled = compileLayout(
                sceneID: request.sceneID,
                eventPlan: request.eventPlan,
                subjectRequirements: request.subjectRequirements,
                draft: response.content,
                origin: request.origin
            )
        }
        guard case let .result(payload) = compiled, var object = payload.objectValue else {
            return compiled
        }
        object["metrics"] = generationMetrics(started: started, usage: response.usage)
        return .result(.object(object))
    } catch is CancellationError {
        return cancelledGeneration()
    } catch {
        return generationFailure(error)
    }
}

@available(macOS 27.0, *)
private func generationPlanError(_ plan: EventPlanDraft, origin: Bool) -> BridgeError? {
    if let error = validateEventPlan(plan) { return error }
    if origin && plan.events.contains(where: { $0.trigger == .exit }) {
        return BridgeError(
            code: "bridge.invalid_event_plan",
            message: "An open-land origin must not contain an exit event.",
            hint: "End with an enter or interact event; the land continues beyond every edge.",
            retryable: true
        )
    }
    return nil
}

@available(macOS 27.0, *)
private func generationMetrics(
    started: Date,
    usage: LanguageModelSession.Usage
) -> JSONValue {
    .object([
        "durationMs": .number(Date().timeIntervalSince(started) * 1_000),
        "inputTokens": .number(Double(usage.input.totalTokenCount)),
        "cachedInputTokens": .number(Double(usage.input.cachedTokenCount)),
        "outputTokens": .number(Double(usage.output.totalTokenCount)),
        "reasoningTokens": .number(Double(usage.output.reasoningTokenCount)),
    ])
}

private func decodePayload<T: Decodable>(
    _ type: T.Type,
    payload: JSONValue,
    allowedKeys: Set<String>
) throws -> T {
    guard let object = payload.objectValue else {
        throw PayloadDecodingError.notAnObject
    }
    let unknownKeys = Set(object.keys).subtracting(allowedKeys)
    guard unknownKeys.isEmpty else {
        throw PayloadDecodingError.unknownKeys(unknownKeys.sorted())
    }
    let data = try JSONEncoder().encode(payload)
    return try JSONDecoder().decode(type, from: data)
}

private enum PayloadDecodingError: LocalizedError {
    case notAnObject
    case unknownKeys([String])

    var errorDescription: String? {
        switch self {
        case .notAnObject:
            return "payload must be a JSON object"
        case let .unknownKeys(keys):
            return "unknown fields: \(keys.joined(separator: ", "))"
        }
    }
}

private func validateRequest(sceneID: String, brief: String, language: String) -> BridgeError? {
    guard !sceneID.isEmpty, sceneID.count <= 64 else {
        return requestError("sceneId must contain between 1 and 64 characters.")
    }
    guard !brief.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, brief.count <= 2_000 else {
        return requestError("brief must contain between 1 and 2,000 characters.")
    }
    guard !language.isEmpty, language.count <= 32 else {
        return requestError("language must contain between 1 and 32 characters.")
    }
    return nil
}

private func requestError(_ message: String) -> BridgeError {
    BridgeError(
        code: "bridge.invalid_payload",
        message: message,
        hint: "Send the typed request payload documented for this bridge method.",
        retryable: false
    )
}

private func invalidPayload(_ message: String) -> OperationOutcome {
    .failure(requestError(message))
}

private func generationFailure(_ error: Error) -> OperationOutcome {
    .failure(BridgeError(
        code: "bridge.generation_failed",
        message: "Foundation Models generation failed: \(error.localizedDescription)",
        hint: "Check Apple Intelligence availability and retry. Invalid drafts are never returned as scenes.",
        retryable: true
    ))
}

private func cancelledGeneration() -> OperationOutcome {
    .failure(BridgeError(
        code: "bridge.cancelled",
        message: "Foundation Models generation was cancelled.",
        hint: "Start a new request if generation is still needed.",
        retryable: true
    ))
}
#endif
