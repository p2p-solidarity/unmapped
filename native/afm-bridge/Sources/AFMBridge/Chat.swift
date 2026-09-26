#if canImport(FoundationModels)
import Foundation
import FoundationModels

// `chat`: one step of a plain conversation, the same shape main sends any chat provider
// (system / user / assistant with tool calls / tool results), answered by the system model inside
// the app. Text streams as `partial` events ({"delta": "..."}); the terminal `result` carries the
// whole text, the tool calls the model asked for, and the tokens spent.
//
// Tools are the host's, not the bridge's: when the model calls one, the bridge records the call,
// stops the turn and returns it, exactly like a Chat Completions server. The host runs the tool and
// sends the whole conversation again with the result appended; the transcript is rebuilt from it.
//
// The budget is the model's own: the transcript, the prompt and any schema are counted with
// `tokenCount`, the answer gets what is left of the context (at most `maxTokens`), and a task whose
// `minTokens` does not fit is refused before anything is generated.
//
// A request with a `schema` (the JSON Schema subset `dynamicSchema` reads) is answered under guided
// generation and its text is the answer's JSON: the host writes that into its own program and
// parses it like any other answer. Properties are generated in the order `required` lists them.

struct ChatToolCallWire: Codable, Sendable {
    let id: String
    let name: String
    let arguments: String
}

private struct ChatMessageWire: Decodable, Sendable {
    let role: String
    let content: String
    let toolCalls: [ChatToolCallWire]?
    let toolCallId: String?
    let name: String?
}

private struct ChatToolWire: Decodable, Sendable {
    let name: String
    let description: String
    let parameters: JSONValue
}

private struct ChatRequest: Decodable, Sendable {
    let messages: [ChatMessageWire]
    let tools: [ChatToolWire]
    let maxTokens: Int
    let minTokens: Int
    let temperature: Double
    let program: ProgramShapeWire?
    let schema: JSONValue?
}

/// Room for the chat template's own tokens around the counted entries.
private let templateReserve = 24

private struct ChatSetupError: Error {
    let message: String
}

/// FoundationModels answers a prompt, never a bare transcript, so a turn that ends in tool results
/// continues with this line after them.
private let continueAfterTools = """
The tools you called have run; their results are above. Finish the request now with your answer. \
Call another tool only if the request still needs a change those calls did not make.
"""

/// The model asked for a host tool: the turn stops here and the call goes back to the host.
private struct HostToolPending: Error {}

private actor ToolCallLog {
    private(set) var calls: [ChatToolCallWire] = []

    func record(name: String, arguments: String) {
        calls.append(ChatToolCallWire(id: "call_\(UUID().uuidString)", name: name, arguments: arguments))
    }
}

@available(macOS 27.0, *)
private struct HostTool: Tool {
    typealias Arguments = GeneratedContent
    typealias Output = String

    let name: String
    let description: String
    let parameters: GenerationSchema
    let log: ToolCallLog

    func call(arguments: GeneratedContent) async throws -> String {
        await log.record(name: name, arguments: arguments.jsonString)
        throw HostToolPending()
    }
}

@available(macOS 27.0, *)
func chat(payload: JSONValue, emit: @escaping PartialEmitter) async -> OperationOutcome {
    let request: ChatRequest
    do {
        request = try decodePayload(
            ChatRequest.self,
            payload: payload,
            allowedKeys: ["messages", "tools", "maxTokens", "minTokens", "temperature", "program", "schema"]
        )
    } catch {
        return invalidPayload(
            "chat requires messages, tools, maxTokens, minTokens, and temperature: \(error.localizedDescription)"
        )
    }
    guard (1...128).contains(request.messages.count), (1...32_768).contains(request.maxTokens),
          (1...request.maxTokens).contains(request.minTokens) else {
        return invalidPayload("chat needs 1 to 128 messages and 1 ≤ minTokens ≤ maxTokens ≤ 32,768.")
    }
    if let program = request.program, !request.tools.isEmpty || program.args.isEmpty {
        return invalidPayload("a program answer needs at least one argument and no tools.")
    }
    if request.schema != nil, !request.tools.isEmpty || request.program != nil {
        return invalidPayload("a schema answer takes no tools and no program shape.")
    }

    let log = ToolCallLog()
    let tools: [HostTool]
    let entries: [Transcript.Entry]
    let prompt: String
    let schema: GenerationSchema?
    do {
        tools = try request.tools.map { tool in
            HostTool(
                name: tool.name,
                description: tool.description,
                parameters: try GenerationSchema(
                    root: dynamicSchema(named: tool.name, tool.parameters),
                    dependencies: []
                ),
                log: log
            )
        }
        (entries, prompt) = try chatTranscript(request.messages, tools: tools)
        if let answer = request.schema {
            schema = try GenerationSchema(root: dynamicSchema(named: "Answer", answer), dependencies: [])
        } else {
            schema = try request.program.map(programSchema)
        }
    } catch let error as ChatSetupError {
        return invalidPayload(error.message)
    } catch {
        return invalidPayload("chat could not be prepared: \(error.localizedDescription)")
    }

    let model = SystemLanguageModel.default
    let maxTokens: Int
    do {
        var used = try await model.tokenCount(
            for: entries + [.prompt(Transcript.Prompt(segments: [textSegment(prompt)]))]
        )
        if let schema { used += try await model.tokenCount(for: schema) }
        let room = model.contextSize - used - templateReserve
        guard room >= request.minTokens else {
            return .failure(BridgeError(
                code: "bridge.context_exceeded",
                message: "This task needs \(used) tokens of prompt and at least \(request.minTokens) of answer, but Apple on-device holds \(model.contextSize) in all.",
                hint: "Switch to Cloud API in Settings → Model, or shorten what the task sends.",
                retryable: false
            ))
        }
        maxTokens = min(request.maxTokens, room)
    } catch {
        return chatFailure(error)
    }

    let session = LanguageModelSession(model: model, tools: tools, transcript: Transcript(entries: entries))
    let options = GenerationOptions(temperature: request.temperature, maximumResponseTokens: maxTokens)
    var text = ""
    var finish = "stop"
    /// Streams what extends the text so far; the finished text is the result either way.
    func advance(to next: String) async {
        if next.count > text.count, next.hasPrefix(text) {
            await emit(.object(["delta": .string(String(next.dropFirst(text.count)))]))
        }
        text = next
    }
    do {
        if let program = request.program, let schema {
            var last: GeneratedContent?
            for try await snapshot in session.streamResponse(to: prompt, schema: schema, options: options) {
                try Task.checkCancellation()
                last = snapshot.content
                await advance(to: programText(program, snapshot.content, done: false))
            }
            try Task.checkCancellation()
            if let last { await advance(to: programText(program, last, done: true)) }
        } else if let schema {
            var last: GeneratedContent?
            for try await snapshot in session.streamResponse(to: prompt, schema: schema, options: options) {
                try Task.checkCancellation()
                last = snapshot.content
                await advance(to: snapshot.content.jsonString)
            }
            try Task.checkCancellation()
            if let last { await advance(to: last.jsonString) }
        } else {
            for try await snapshot in session.streamResponse(to: prompt, options: options) {
                try Task.checkCancellation()
                if let cut = loopCut(snapshot.content) {
                    text = String(snapshot.content[..<cut])
                    finish = "repetition"
                    break
                }
                await advance(to: snapshot.content)
            }
            try Task.checkCancellation()
        }
    } catch {
        if error is CancellationError || Task.isCancelled { return cancelledGeneration() }
        // A host tool ends the turn by throwing; however the framework wraps that, the recorded
        // call is the answer.
        if await log.calls.isEmpty { return chatFailure(error) }
    }

    let usage = session.usage
    if finish == "stop", usage.output.totalTokenCount >= maxTokens { finish = "length" }
    do {
        return .result(.object([
            "text": .string(text),
            "toolCalls": try jsonValue(await log.calls),
            "usage": .object([
                "input": .number(Double(usage.input.totalTokenCount)),
                "cached": .number(Double(usage.input.cachedTokenCount)),
                "output": .number(Double(usage.output.totalTokenCount)),
            ]),
            "maxTokens": .number(Double(maxTokens)),
            "finish": .string(finish),
        ]))
    } catch {
        return generationFailure(error)
    }
}

@available(macOS 27.0, *)
private func chatTranscript(
    _ messages: [ChatMessageWire],
    tools: [HostTool]
) throws -> ([Transcript.Entry], String) {
    let system = messages.filter { $0.role == "system" }.map(\.content).joined(separator: "\n\n")
    var turns = messages.filter { $0.role != "system" }
    guard let last = turns.last else {
        throw ChatSetupError(message: "chat needs a user message or a tool result.")
    }
    let prompt: String
    switch last.role {
    case "user":
        prompt = last.content
        turns.removeLast()
    case "tool":
        prompt = continueAfterTools
    default:
        throw ChatSetupError(message: "chat must end with a user message or a tool result.")
    }

    var entries: [Transcript.Entry] = []
    if !system.isEmpty || !tools.isEmpty {
        entries.append(.instructions(Transcript.Instructions(
            segments: system.isEmpty ? [] : [textSegment(system)],
            toolDefinitions: tools.map { Transcript.ToolDefinition(tool: $0) }
        )))
    }
    for message in turns {
        switch message.role {
        case "user":
            entries.append(.prompt(Transcript.Prompt(segments: [textSegment(message.content)])))
        case "assistant":
            if !message.content.isEmpty {
                entries.append(.response(Transcript.Response(segments: [textSegment(message.content)])))
            }
            if let calls = message.toolCalls, !calls.isEmpty {
                entries.append(.toolCalls(Transcript.ToolCalls(try calls.map { call in
                    Transcript.ToolCall(
                        id: call.id,
                        toolName: call.name,
                        arguments: try GeneratedContent(json: call.arguments)
                    )
                })))
            }
        case "tool":
            guard let id = message.toolCallId, let name = message.name else {
                throw ChatSetupError(message: "a tool result needs toolCallId and name.")
            }
            entries.append(.toolOutput(Transcript.ToolOutput(
                id: id,
                toolName: name,
                segments: [textSegment(message.content)]
            )))
        default:
            throw ChatSetupError(message: "unknown chat role \(message.role).")
        }
    }
    return (entries, prompt)
}

@available(macOS 27.0, *)
private func textSegment(_ content: String) -> Transcript.Segment {
    .text(Transcript.TextSegment(content: content))
}

/// The JSON Schema subset `defineTool` and answer schemas use (object in `required` order → string
/// with an optional enum or pattern, number or integer with bounds, boolean, array with optional
/// minItems/maxItems) as a schema the model's decoder enforces.
@available(macOS 27.0, *)
private func dynamicSchema(named name: String, _ node: JSONValue) throws -> DynamicGenerationSchema {
    guard let object = node.objectValue, let type = object["type"]?.stringValue else {
        throw ChatSetupError(message: "tool schema \(name) has no type.")
    }
    let description = object["description"]?.stringValue
    let minimum = object["minimum"]?.numberValue
    let maximum = object["maximum"]?.numberValue
    switch type {
    case "object":
        let properties = object["properties"]?.objectValue ?? [:]
        let listed = (object["required"]?.arrayValue ?? []).compactMap(\.stringValue)
        let required = Set(listed)
        // A JSON object has no order, so the model writes the properties in `required`'s order.
        let rank = { (key: String) in listed.firstIndex(of: key) ?? listed.count }
        return DynamicGenerationSchema(
            name: name,
            description: description,
            properties: try properties.keys.sorted { (rank($0), $0) < (rank($1), $1) }.map { key in
                let child = properties[key] ?? .null
                return DynamicGenerationSchema.Property(
                    name: key,
                    description: child.objectValue?["description"]?.stringValue,
                    schema: try dynamicSchema(named: "\(name)_\(key)", child),
                    isOptional: !required.contains(key)
                )
            }
        )
    case "string":
        let choices = (object["enum"]?.arrayValue ?? []).compactMap(\.stringValue)
        if !choices.isEmpty {
            return DynamicGenerationSchema(name: name, description: description, anyOf: choices)
        }
        if var pattern = object["pattern"]?.stringValue {
            // The guide holds the whole value to the pattern, so JSON Schema's anchors are dropped.
            if pattern.hasPrefix("^") { pattern.removeFirst() }
            if pattern.hasSuffix("$") { pattern.removeLast() }
            do {
                return DynamicGenerationSchema(type: String.self, guides: [.pattern(try Regex(pattern))])
            } catch {
                throw ChatSetupError(message: "schema \(name) has an invalid pattern.")
            }
        }
        return DynamicGenerationSchema(type: String.self)
    case "integer":
        var guides: [GenerationGuide<Int>] = []
        if let minimum { guides.append(.minimum(Int(minimum.rounded(.up)))) }
        if let maximum { guides.append(.maximum(Int(maximum.rounded(.down)))) }
        return DynamicGenerationSchema(type: Int.self, guides: guides)
    case "number":
        var guides: [GenerationGuide<Double>] = []
        if let minimum { guides.append(.minimum(minimum)) }
        if let maximum { guides.append(.maximum(maximum)) }
        return DynamicGenerationSchema(type: Double.self, guides: guides)
    case "boolean":
        return DynamicGenerationSchema(type: Bool.self)
    case "array":
        guard let items = object["items"] else {
            throw ChatSetupError(message: "tool schema \(name) is an array without items.")
        }
        let bound = { (key: String) in object[key]?.numberValue.map { Int($0) } }
        return DynamicGenerationSchema(
            arrayOf: try dynamicSchema(named: "\(name)_item", items),
            minimumElements: bound("minItems"),
            maximumElements: bound("maxItems")
        )
    default:
        throw ChatSetupError(message: "tool schema \(name) has unsupported type \(type).")
    }
}

@available(macOS 27.0, *)
private func chatFailure(_ error: Error) -> OperationOutcome {
    guard let generation = error as? LanguageModelSession.GenerationError else {
        return generationFailure(error)
    }
    switch generation {
    case .exceededContextWindowSize:
        return .failure(BridgeError(
            code: "bridge.context_exceeded",
            message: "The conversation does not fit the on-device model's \(SystemLanguageModel.default.contextSize)-token context.",
            hint: "Switch to a model with a larger context in Settings → Model.",
            retryable: false
        ))
    case .guardrailViolation, .refusal:
        return .failure(BridgeError(
            code: "bridge.refused",
            message: "Apple's on-device model declined this request: \(generation.localizedDescription)",
            hint: "Try again with different words, or switch to another model in Settings → Model.",
            retryable: true
        ))
    case .unsupportedLanguageOrLocale:
        return .failure(BridgeError(
            code: "bridge.unsupported_language",
            message: "Apple's on-device model does not support this language.",
            hint: "Choose a language Apple Intelligence supports, or another model in Settings → Model.",
            retryable: false
        ))
    case .rateLimited, .concurrentRequests, .assetsUnavailable:
        return .failure(BridgeError(
            code: "bridge.busy",
            message: "Apple's on-device model is busy or still preparing: \(generation.localizedDescription)",
            hint: "Wait a moment and try again.",
            retryable: true
        ))
    default:
        return generationFailure(error)
    }
}
#endif
