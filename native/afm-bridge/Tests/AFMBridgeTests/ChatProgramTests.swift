import Foundation
import XCTest
@testable import AFMBridge
#if canImport(FoundationModels)
import FoundationModels
#endif

// Failures these guard (E2E cannot pick the model's words or its loops):
// 1. A quote, backslash or newline in the model's words breaks the program the bridge writes, or
//    changes the words, so a valid answer is thrown away or saved altered.
// 2. A snapshot's program text is not a prefix of the finished one, so the streamed preview and
//    the saved program disagree.
// 3. The loop guard cuts an answer that does not loop (a program with repeated short parts), which
//    would silently drop the rest of a valid answer.
// 4. The loop guard misses a real loop, so a looping answer burns the whole budget again.

final class ChatProgramTests: XCTestCase {
    private let shape = ProgramShapeWire(root: "Bible", args: [
        ProgramArgWire(name: "premise", description: "p", kind: "text", minItems: nil, maxItems: nil),
        ProgramArgWire(name: "rules", description: "r", kind: "list", minItems: 1, maxItems: 3),
        ProgramArgWire(name: "look", description: "l", kind: "text", minItems: nil, maxItems: nil),
    ])

    func testFinishedProgramKeepsTheModelsWordsExactly() throws {
#if canImport(FoundationModels)
        guard #available(macOS 27.0, *) else { throw XCTSkip("needs macOS 27") }
        let content = structure([
            ("premise", .string("他說\"風\"來了\\路\n下一行")),
            ("rules", .array([text("a \"b\""), text("c/d")])),
            ("look", .string("藍")),
        ])
        let program = programText(shape, content, done: true)
        XCTAssertEqual(
            program,
            #"root = Bible("他說\"風\"來了\\路\n下一行", ["a \"b\"", "c/d"], "藍")"#
        )
        let literal = try XCTUnwrap(program.split(separator: "(", maxSplits: 1).last?.split(separator: ",").first)
        XCTAssertEqual(try JSONDecoder().decode(String.self, from: Data(literal.utf8)), "他說\"風\"來了\\路\n下一行")
#else
        throw XCTSkip("FoundationModels is not available")
#endif
    }

    func testPartialProgramIsAPrefixOfTheFinishedOne() throws {
#if canImport(FoundationModels)
        guard #available(macOS 27.0, *) else { throw XCTSkip("needs macOS 27") }
        let partial = structure([("premise", .string("霧")), ("rules", .array([text("a")]))])
        let finished = structure([
            ("premise", .string("霧")),
            ("rules", .array([text("a"), text("b")])),
            ("look", .string("藍")),
        ])
        let early = programText(shape, partial, done: false)
        let final = programText(shape, finished, done: true)
        XCTAssertTrue(final.hasPrefix(early), "\(early) is not a prefix of \(final)")
        XCTAssertTrue(final.hasSuffix(")"))
#else
        throw XCTSkip("FoundationModels is not available")
#endif
    }

    func testLoopGuardLeavesAProgramWithRepeatedShortPartsAlone() {
        let scene = (1...12).map { "tree\($0) = Prop(\"tree\", \($0), 4, 1)" }.joined(separator: "\n")
        let bible = #"root = Bible("霧散後的群島。", "平靜。", ["風箏是交通工具。", "燈是指南。", "島民互相信任。"], ["武器", "戰爭"], "n", "v", "l")"#
        XCTAssertNil(loopCut(scene))
        XCTAssertNil(loopCut(bible))
    }

    func testLoopGuardCutsBeforeTheSecondCopy() throws {
        let head = "root = Bible(\"霧\", \"靜\", [\"風箏是唯一的交通工具。\""
        let loop = String(repeating: ", \"漂浮是未來的方式。\"", count: 6)
        let text = head + loop
        let cut = try XCTUnwrap(loopCut(text))
        let kept = String(text[..<cut])
        XCTAssertEqual(kept.components(separatedBy: "漂浮是未來的方式").count - 1, 1)
        XCTAssertTrue(kept.hasPrefix(head))
    }

#if canImport(FoundationModels)
    @available(macOS 27.0, *)
    private func text(_ value: String) -> GeneratedContent {
        GeneratedContent(kind: .string(value))
    }

    @available(macOS 27.0, *)
    private func structure(_ pairs: [(String, GeneratedContent.Kind)]) -> GeneratedContent {
        GeneratedContent(kind: .structure(
            properties: Dictionary(uniqueKeysWithValues: pairs.map { ($0.0, GeneratedContent(kind: $0.1)) }),
            orderedKeys: pairs.map(\.0)
        ))
    }
#endif
}
