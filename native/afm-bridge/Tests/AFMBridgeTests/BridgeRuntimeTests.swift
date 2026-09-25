import Foundation
import XCTest
@testable import AFMBridge

final class BridgeRuntimeTests: XCTestCase {
    func testRequestEnvelopeRejectsUnknownFields() {
        let data = Data(
            #"{"v":1,"requestId":"req-1","method":"capabilities","payload":{},"extra":true}"#.utf8
        )

        XCTAssertThrowsError(try JSONDecoder().decode(RequestEnvelope.self, from: data))
    }

    func testUnavailableRuntimeReturnsAcceptedThenActionableError() async throws {
        let recorder = LineRecorder()
        let writer = NDJSONWriter(sink: recorder.append)
        let runtime = BridgeRuntime(
            writer: writer,
            runtimeAvailabilityOverride: false,
            unavailableErrorOverride: BridgeError(
                code: "bridge.unavailable",
                message: "Model is unavailable for this test.",
                hint: "Enable the model.",
                retryable: false
            )
        )

        await runtime.submit(line: requestLine(id: "unavailable-1", method: "generateEvents"))
        await runtime.finishInput()

        let events = try recorder.events()
        XCTAssertEqual(events.map { $0["type"] as? String }, ["accepted", "error"])
        XCTAssertEqual((events.last?["error"] as? [String: Any])?["code"] as? String, "bridge.unavailable")
    }

    func testCancelProducesOneTerminalEventForTargetAndAControlResult() async throws {
        let recorder = LineRecorder()
        let writer = NDJSONWriter(sink: recorder.append)
        let runtime = BridgeRuntime(
            writer: writer,
            runtimeAvailabilityOverride: true,
            executor: { _, _ in
                try? await Task.sleep(for: .seconds(5))
                return .result(.object(["late": .bool(true)]))
            }
        )

        await runtime.submit(line: requestLine(id: "target-1", method: "generateEvents"))
        await runtime.submit(line: requestLine(
            id: "cancel-1",
            method: "cancel",
            payload: ["targetRequestId": "target-1"]
        ))
        await runtime.finishInput()

        let events = try recorder.events()
        let targetTerminal = events.filter {
            $0["requestId"] as? String == "target-1" && $0["type"] as? String != "accepted"
        }
        XCTAssertEqual(targetTerminal.count, 1)
        XCTAssertEqual(targetTerminal.first?["type"] as? String, "cancelled")

        let cancelResult = events.first {
            $0["requestId"] as? String == "cancel-1" && $0["type"] as? String == "result"
        }
        XCTAssertEqual((cancelResult?["payload"] as? [String: Any])?["cancelled"] as? Bool, true)
    }
}

private func requestLine(
    id: String,
    method: String,
    payload: [String: Any] = [:]
) -> String {
    let data = try! JSONSerialization.data(withJSONObject: [
        "v": 1,
        "requestId": id,
        "method": method,
        "payload": payload,
    ])
    return String(decoding: data, as: UTF8.self)
}

private final class LineRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private var data = Data()

    func append(_ chunk: Data) {
        lock.lock()
        data.append(chunk)
        lock.unlock()
    }

    func events() throws -> [[String: Any]] {
        lock.lock()
        let snapshot = data
        lock.unlock()
        return try String(decoding: snapshot, as: UTF8.self)
            .split(separator: "\n")
            .map { line in
                try XCTUnwrap(
                    JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any]
                )
            }
    }
}
