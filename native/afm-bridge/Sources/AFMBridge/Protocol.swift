import Foundation

enum JSONValue: Codable, Sendable, Equatable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Value is not valid JSON"
            )
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        switch self {
        case .null:
            try container.encodeNil()
        case let .bool(value):
            try container.encode(value)
        case let .number(value):
            try container.encode(value)
        case let .string(value):
            try container.encode(value)
        case let .array(value):
            try container.encode(value)
        case let .object(value):
            try container.encode(value)
        }
    }

    var objectValue: [String: JSONValue]? {
        guard case let .object(value) = self else { return nil }
        return value
    }

    var stringValue: String? {
        guard case let .string(value) = self else { return nil }
        return value
    }
}

func jsonValue<T: Encodable>(_ value: T) throws -> JSONValue {
    let data = try JSONEncoder().encode(value)
    return try JSONDecoder().decode(JSONValue.self, from: data)
}

struct RequestEnvelope: Decodable, Sendable {
    let version: Int
    let requestID: String
    let method: String
    let payload: JSONValue

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case version = "v"
        case requestID = "requestId"
        case method
        case payload
    }

    init(from decoder: Decoder) throws {
        let dynamic = try decoder.container(keyedBy: DynamicCodingKey.self)
        let allowed = Set(CodingKeys.allCases.map(\.rawValue))
        let unknown = Set(dynamic.allKeys.map(\.stringValue)).subtracting(allowed)
        guard unknown.isEmpty else {
            throw DecodingError.dataCorruptedError(
                forKey: dynamic.allKeys.first { unknown.contains($0.stringValue) }!,
                in: dynamic,
                debugDescription: "Unknown envelope fields: \(unknown.sorted().joined(separator: ", "))"
            )
        }
        let container = try decoder.container(keyedBy: CodingKeys.self)
        version = try container.decode(Int.self, forKey: .version)
        requestID = try container.decode(String.self, forKey: .requestID)
        method = try container.decode(String.self, forKey: .method)
        payload = try container.decodeIfPresent(JSONValue.self, forKey: .payload) ?? .object([:])
    }
}

enum RequestMethod: String, Sendable {
    case capabilities
    case planWorld
    case generateEvents
    case generateLayout
    case cancel
}

struct BridgeError: Encodable, Sendable {
    let code: String
    let message: String
    let hint: String
    let retryable: Bool
}

struct EventEnvelope: Encodable, Sendable {
    let version: Int
    let requestID: String
    let sequence: Int
    let type: String
    let payload: JSONValue?
    let error: BridgeError?

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case version = "v"
        case requestID = "requestId"
        case sequence = "seq"
        case type
        case payload
        case error
    }

    init(
        requestID: String,
        sequence: Int,
        type: String,
        payload: JSONValue? = nil,
        error: BridgeError? = nil
    ) {
        version = 1
        self.requestID = requestID
        self.sequence = sequence
        self.type = type
        self.payload = payload
        self.error = error
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(version, forKey: .version)
        try container.encode(requestID, forKey: .requestID)
        try container.encode(sequence, forKey: .sequence)
        try container.encode(type, forKey: .type)
        if let payload {
            try container.encode(payload, forKey: .payload)
        }
        if let error {
            try container.encode(error, forKey: .error)
        }
    }
}

private struct DynamicCodingKey: CodingKey {
    let stringValue: String
    let intValue: Int?

    init?(stringValue: String) {
        self.stringValue = stringValue
        intValue = nil
    }

    init?(intValue: Int) {
        stringValue = String(intValue)
        self.intValue = intValue
    }
}

enum OperationOutcome: Sendable {
    case result(JSONValue)
    case failure(BridgeError)
}

actor NDJSONWriter {
    private let encoder: JSONEncoder
    private let sink: @Sendable (Data) -> Void

    init(sink: @escaping @Sendable (Data) -> Void = { data in
        FileHandle.standardOutput.write(data)
    }) {
        encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        self.sink = sink
    }

    func event(_ event: EventEnvelope) {
        let data: Data
        do {
            data = try encoder.encode(event)
        } catch {
            log("fatal output encoding failure for request \(event.requestID): \(error)")
            fatalError("AFM bridge cannot preserve its terminal-event guarantee")
        }
        var line = data
        line.append(0x0A)
        sink(line)
    }

    func log(_ message: String) {
        let line = "afm-bridge: \(message)\n"
        FileHandle.standardError.write(Data(line.utf8))
    }
}
