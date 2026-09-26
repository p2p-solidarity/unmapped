#if canImport(FoundationModels)
import Foundation
import FoundationModels

// Two things the small on-device model needs that a large one does not.
//
// A guided program: when main says the answer is one root call of text and bounded text lists
// (a world bible), the model fills those arguments under guided generation and the bridge writes
// `root = Name("…", ["…", …], …)` itself. Left to write the program as text, the model does not
// close a list: 4 of 4 bible runs grew the rules list until the token cap. Nothing is added — the
// arguments are the model's words — and the renderer still parses the program like any other.
//
// A loop guard: in free text the model can repeat one short passage until the cap. The guard stops
// the answer at the second copy, so the repair round has room and the player does not wait for it.

struct ProgramArgWire: Decodable, Sendable {
    let name: String
    let description: String
    let kind: String
    let minItems: Int?
    let maxItems: Int?
}

struct ProgramShapeWire: Decodable, Sendable {
    let root: String
    let args: [ProgramArgWire]
}

@available(macOS 27.0, *)
func programSchema(_ shape: ProgramShapeWire) throws -> GenerationSchema {
    let properties = shape.args.map { arg in
        let schema: DynamicGenerationSchema
        if arg.kind == "list" {
            schema = DynamicGenerationSchema(
                arrayOf: DynamicGenerationSchema(type: String.self),
                minimumElements: arg.minItems,
                maximumElements: arg.maxItems
            )
        } else {
            schema = DynamicGenerationSchema(type: String.self)
        }
        return DynamicGenerationSchema.Property(name: arg.name, description: arg.description, schema: schema)
    }
    return try GenerationSchema(
        root: DynamicGenerationSchema(name: shape.root, properties: properties),
        dependencies: []
    )
}

/// One OpenUI Lang string literal: JSON's escapes, which the language shares.
private func literal(_ value: String) -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.withoutEscapingSlashes]
    guard let data = try? encoder.encode(value) else { return "\"\"" }
    return String(decoding: data, as: UTF8.self)
}

/// The literal without its closing quote: a prefix of the finished literal while the words grow.
private func openLiteral(_ value: String) -> String {
    String(literal(value).dropLast())
}

@available(macOS 27.0, *)
private func stringValue(_ content: GeneratedContent) -> String {
    if case let .string(value) = content.kind { return value }
    return ""
}

/// The program as far as it is written. Every argument before the one being generated is closed;
/// that one is left open — even when its node says complete, a list can still grow — so each
/// snapshot's text extends the previous one and can stream as deltas. With `done`, it is closed.
@available(macOS 27.0, *)
func programText(_ shape: ProgramShapeWire, _ content: GeneratedContent, done: Bool) -> String {
    guard case let .structure(properties, _) = content.kind else {
        return "root = \(shape.root)("
    }
    var parts: [String] = []
    for (index, arg) in shape.args.enumerated() {
        guard let value = properties[arg.name] else { break }
        let later = shape.args.dropFirst(index + 1).contains { properties[$0.name] != nil }
        let closed = done || later
        if arg.kind == "list" {
            guard case let .array(items) = value.kind else {
                parts.append("[")
                break
            }
            let written = items.enumerated().map { position, item in
                closed || position < items.count - 1
                    ? literal(stringValue(item))
                    : openLiteral(stringValue(item))
            }
            parts.append("[" + written.joined(separator: ", ") + (closed ? "]" : ""))
        } else {
            parts.append(closed ? literal(stringValue(value)) : openLiteral(stringValue(value)))
        }
        if !closed { break }
    }
    let body = parts.joined(separator: ", ")
    let complete = done && parts.count == shape.args.count
    return "root = \(shape.root)(\(body)\(complete ? ")" : "")"
}

/// Where the answer starts to loop, or nil. A passage of at least 8 characters that appears five
/// times among the last 40 pieces (split at line breaks and list or sentence punctuation) is a
/// loop; the answer is cut just before its second copy.
func loopCut(_ text: String) -> String.Index? {
    let separators: Set<Character> = ["\n", ",", "，", "、", "。", ";", "；"]
    var pieces: [(text: Substring, start: String.Index)] = []
    var start = text.startIndex
    var index = text.startIndex
    while index < text.endIndex {
        if separators.contains(text[index]) {
            pieces.append((text[start..<index], start))
            start = text.index(after: index)
        }
        index = text.index(after: index)
    }
    let recent = pieces.suffix(40)
    var seen: [String: [String.Index]] = [:]
    for piece in recent {
        let key = piece.text.trimmingCharacters(in: .whitespaces)
        guard key.count >= 8 else { continue }
        seen[key, default: []].append(piece.start)
        if let starts = seen[key], starts.count >= 5 { return starts[1] }
    }
    return nil
}
#endif
