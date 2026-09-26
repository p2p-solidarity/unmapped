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
            executor: { _, _, _ in
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

    // Guards: a streamed chat numbers its partial events between accepted and the terminal event,
    // and a cancel after partials takes the next number. Main's transport kills the helper on any
    // gap or repeat, so a wrong number here would end every request in flight.
    func testPartialEventsAreNumberedBeforeTheTerminalEvent() async throws {
        let recorder = LineRecorder()
        let runtime = BridgeRuntime(
            writer: NDJSONWriter(sink: recorder.append),
            runtimeAvailabilityOverride: true,
            executor: { _, _, emit in
                await emit(.object(["delta": .string("a")]))
                await emit(.object(["delta": .string("b")]))
                return .result(.object(["text": .string("ab")]))
            }
        )

        await runtime.submit(line: requestLine(id: "chat-1", method: "chat"))
        await runtime.finishInput()

        let events = try recorder.events()
        XCTAssertEqual(events.map { $0["type"] as? String }, ["accepted", "partial", "partial", "result"])
        XCTAssertEqual(events.map { $0["seq"] as? Int }, [1, 2, 3, 4])
    }

    func testCancelAfterPartialEventsTakesTheNextSequence() async throws {
        let recorder = LineRecorder()
        let runtime = BridgeRuntime(
            writer: NDJSONWriter(sink: recorder.append),
            runtimeAvailabilityOverride: true,
            executor: { _, _, emit in
                await emit(.object(["delta": .string("a")]))
                try? await Task.sleep(for: .seconds(5))
                await emit(.object(["delta": .string("late")]))
                return .result(.object(["text": .string("late")]))
            }
        )

        await runtime.submit(line: requestLine(id: "chat-2", method: "chat"))
        while try recorder.events().count < 2 { try await Task.sleep(for: .milliseconds(10)) }
        await runtime.submit(line: requestLine(
            id: "cancel-2",
            method: "cancel",
            payload: ["targetRequestId": "chat-2"]
        ))
        await runtime.finishInput()

        let target = try recorder.events().filter { $0["requestId"] as? String == "chat-2" }
        XCTAssertEqual(target.map { $0["type"] as? String }, ["accepted", "partial", "cancelled"])
        XCTAssertEqual(target.map { $0["seq"] as? Int }, [1, 2, 3])
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
