import XCTest
@testable import AFMBridge

#if canImport(FoundationModels)
import FoundationModels

@available(macOS 27.0, *)
final class AvailabilityTests: XCTestCase {
    func testMapsAppleIntelligenceDisabledToAnActionableUnavailableError() {
        let error = modelUnavailableError(.appleIntelligenceNotEnabled)

        XCTAssertEqual(error.code, "bridge.unavailable")
        XCTAssertFalse(error.retryable)
        XCTAssertTrue(error.hint.contains("Enable Apple Intelligence"))
    }

    func testMarksModelDownloadAsRetryable() {
        let error = modelUnavailableError(.modelNotReady)

        XCTAssertEqual(error.code, "bridge.unavailable")
        XCTAssertTrue(error.retryable)
    }
}
#endif
