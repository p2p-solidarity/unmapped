import XCTest
@testable import AFMBridge

#if canImport(FoundationModels)
@available(macOS 27.0, *)
final class EventPlanTests: XCTestCase {
    func testAcceptsAReachableCausalPlan() {
        let plan = EventPlanDraft(
            entryEventID: "enter_room",
            events: [
                CausalEventDraft(
                    id: "enter_room",
                    trigger: .enter,
                    subjectID: nil,
                    requires: [],
                    effects: [],
                    nextEventIDs: ["inspect_altar"]
                ),
                CausalEventDraft(
                    id: "inspect_altar",
                    trigger: .interact,
                    subjectID: "prop1",
                    requires: [],
                    effects: [EffectDraft(key: "altar_seen", operation: .set, value: "true")],
                    nextEventIDs: ["leave_room"]
                ),
                CausalEventDraft(
                    id: "leave_room",
                    trigger: .exit,
                    subjectID: "exit1",
                    requires: [
                        PredicateDraft(key: "altar_seen", operator: .equals, value: "true")
                    ],
                    effects: [],
                    nextEventIDs: []
                ),
            ],
            terminalEventIDs: ["leave_room"]
        )

        XCTAssertNil(validateEventPlan(plan))
    }

    func testRejectsAnUndeclaredTransition() {
        let plan = EventPlanDraft(
            entryEventID: "enter_room",
            events: [
                CausalEventDraft(
                    id: "enter_room",
                    trigger: .enter,
                    subjectID: nil,
                    requires: [],
                    effects: [],
                    nextEventIDs: ["missing"]
                )
            ],
            terminalEventIDs: ["enter_room"]
        )

        XCTAssertEqual(validateEventPlan(plan)?.code, "bridge.invalid_event_plan")
    }

    func testCompilesGeneratedStepsIntoCanonicalCausalReferences() {
        let generated = GeneratedEventSequence(
            steps: [
                GeneratedEventStep(
                    idHint: "enter-room",
                    trigger: .enter,
                    subjectKind: .rock,
                    requires: [],
                    effects: [EffectDraft(key: "room-entered", operation: .set, value: "true")]
                ),
                GeneratedEventStep(
                    idHint: "inspect-altar",
                    trigger: .interact,
                    subjectKind: .altar,
                    requires: [
                        PredicateDraft(key: "room-entered", operator: .equals, value: "true")
                    ],
                    effects: []
                ),
            ]
        )

        let compiled = compileEventSequence(generated)
        let normalized = compiled.eventPlan

        XCTAssertEqual(normalized.entryEventID, "enter_room")
        XCTAssertEqual(normalized.events[0].nextEventIDs, ["inspect_altar"])
        XCTAssertEqual(normalized.events[0].effects[0].key, "room_entered")
        XCTAssertEqual(normalized.events[1].subjectID, "prop1")
        XCTAssertEqual(compiled.subjectRequirements, [SubjectRequirement(id: "prop1", kind: .altar)])
        XCTAssertNil(validateEventPlan(normalized))
    }

    func testRejectsAPreconditionWithNoPrecedingEffect() {
        let plan = EventPlanDraft(
            entryEventID: "enter_room",
            events: [
                CausalEventDraft(
                    id: "enter_room",
                    trigger: .enter,
                    subjectID: nil,
                    requires: [],
                    effects: [],
                    nextEventIDs: ["leave_room"]
                ),
                CausalEventDraft(
                    id: "leave_room",
                    trigger: .exit,
                    subjectID: "exit1",
                    requires: [PredicateDraft(key: "altar_seen", operator: .equals, value: "true")],
                    effects: [],
                    nextEventIDs: []
                ),
            ],
            terminalEventIDs: ["leave_room"]
        )

        XCTAssertEqual(validateEventPlan(plan)?.code, "bridge.invalid_event_plan")
    }

    func testWireContractIncludesNullSubjectAndRemoveValue() throws {
        let event = CausalEventDraft(
            id: "enter_room",
            trigger: .enter,
            subjectID: nil,
            requires: [],
            effects: [EffectDraft(key: "temporary", operation: .remove, value: "true")],
            nextEventIDs: []
        )

        let value = try jsonValue(event)
        XCTAssertEqual(value.objectValue?["subjectId"], .null)
        XCTAssertEqual(
            value.objectValue?["effects"],
            .array([.object([
                "key": .string("temporary"),
                "operation": .string("remove"),
                "value": .string("true"),
            ])])
        )
    }

    func testCompilerDropsGeneratedPreconditionsThatNoPriorEffectCanSatisfy() {
        let generated = GeneratedEventSequence(steps: [
            GeneratedEventStep(
                idHint: "enter",
                trigger: .enter,
                subjectKind: .rock,
                requires: [],
                effects: [],
            ),
            GeneratedEventStep(
                idHint: "inspect",
                trigger: .interact,
                subjectKind: .well,
                requires: [PredicateDraft(key: "locked", operator: .equals, value: "false")],
                effects: [],
            ),
        ])

        let compiled = compileEventSequence(generated)

        XCTAssertTrue(compiled.eventPlan.events[1].requires.isEmpty)
        XCTAssertNil(validateEventPlan(compiled.eventPlan))
    }
}
#endif
