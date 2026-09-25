import XCTest
@testable import AFMBridge

#if canImport(FoundationModels)
@available(macOS 27.0, *)
final class LayoutCompilationTests: XCTestCase {
    private func resident() -> LayoutNPCDraft {
        LayoutNPCDraft(
            name: "Aki", x: 4, z: 5, role: .farmer, mood: .calm, color: "#aabbcc"
        )
    }

    func testCompilesOneTypedDraftIntoMatchingCanonicalSourceAndAST() {
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
                    effects: [],
                    nextEventIDs: ["leave_room"]
                ),
                CausalEventDraft(
                    id: "leave_room",
                    trigger: .exit,
                    subjectID: "exit1",
                    requires: [],
                    effects: [],
                    nextEventIDs: []
                ),
            ],
            terminalEventIDs: ["leave_room"]
        )
        let draft = SceneLayoutDraft(
            name: "Shrine",
            biome: .meadow,
            floorWidth: 8,
            floorDepth: 8,
            floorTile: .grass,
            objects: [LayoutObjectDraft(kind: .altar, x: 2, z: 3, scale: 1)],
            exits: [
                LayoutExitDraft(x: 6, z: 6, label: "next", targetSceneID: "room-2")
            ],
            lights: [
                LayoutLightDraft(
                    kind: .ambient,
                    color: "#ffffff",
                    intensity: 1,
                    x: nil,
                    z: nil
                )
            ],
            npcs: [resident()]
        )

        let result = compileLayout(
            sceneID: "room-1",
            eventPlan: plan,
            subjectRequirements: [SubjectRequirement(id: "prop1", kind: .altar)],
            draft: draft
        )

        guard case let .result(payload) = result else {
            return XCTFail("Expected layout compilation to succeed")
        }
        XCTAssertEqual(
            payload.objectValue?["source"]?.stringValue,
            """
            root = Scene("Shrine", "meadow", [floor1, light1, prop1, npc1, exit1])
            floor1 = Floor(8, 8, "grass")
            light1 = Light("ambient", "#ffffff", 1)
            prop1 = Prop("altar", 2, 3)
            npc1 = NPC("resident_1", "Aki", 4, 5, "farmer", "calm", "#aabbcc")
            exit1 = Exit(6, 6, "next", "room-2")
            """
        )
        XCTAssertEqual(payload.objectValue?["ast"]?.objectValue?["sceneId"]?.stringValue, "room-1")
    }

    func testRejectsALayoutThatOmitsARequiredSubject() {
        let plan = EventPlanDraft(
            entryEventID: "inspect_altar",
            events: [
                CausalEventDraft(
                    id: "inspect_altar",
                    trigger: .interact,
                    subjectID: "prop2",
                    requires: [],
                    effects: [],
                    nextEventIDs: []
                )
            ],
            terminalEventIDs: ["inspect_altar"]
        )
        let draft = SceneLayoutDraft(
            name: "Shrine",
            biome: .meadow,
            floorWidth: 8,
            floorDepth: 8,
            floorTile: .grass,
            objects: [LayoutObjectDraft(kind: .altar, x: 2, z: 3, scale: 1)],
            exits: [LayoutExitDraft(x: 6, z: 6, label: "next", targetSceneID: nil)],
            lights: [],
            npcs: [resident()]
        )

        let result = compileLayout(
            sceneID: "room-1",
            eventPlan: plan,
            subjectRequirements: [SubjectRequirement(id: "prop2", kind: .altar)],
            draft: draft
        )

        guard case let .failure(error) = result else {
            return XCTFail("Expected a missing prop2 subject to be rejected")
        }
        XCTAssertEqual(error.code, "bridge.invalid_layout")
    }

    func testRejectsARequiredSubjectWithTheWrongKind() {
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
                    effects: [],
                    nextEventIDs: []
                ),
            ],
            terminalEventIDs: ["inspect_altar"]
        )
        let draft = SceneLayoutDraft(
            name: "Wrong shrine",
            biome: .meadow,
            floorWidth: 8,
            floorDepth: 8,
            floorTile: .grass,
            objects: [LayoutObjectDraft(kind: .tree, x: 2, z: 3, scale: 1)],
            exits: [LayoutExitDraft(x: 6, z: 6, label: "next", targetSceneID: nil)],
            lights: [],
            npcs: [resident()]
        )

        let result = compileLayout(
            sceneID: "room-1",
            eventPlan: plan,
            subjectRequirements: [SubjectRequirement(id: "prop1", kind: .altar)],
            draft: draft
        )

        guard case let .failure(error) = result else {
            return XCTFail("Expected the altar/tree mismatch to be rejected")
        }
        XCTAssertTrue(error.message.contains("altar"))
    }

    func testDropsAnInvalidEmptyTargetSceneID() {
        let plan = EventPlanDraft(
            entryEventID: "enter_room",
            events: [CausalEventDraft(
                id: "enter_room",
                trigger: .enter,
                subjectID: nil,
                requires: [],
                effects: [],
                nextEventIDs: [],
            )],
            terminalEventIDs: ["enter_room"]
        )
        let draft = SceneLayoutDraft(
            name: "Room",
            biome: .meadow,
            floorWidth: 8,
            floorDepth: 8,
            floorTile: .grass,
            objects: [],
            exits: [LayoutExitDraft(x: 6, z: 6, label: "next", targetSceneID: "")],
            lights: [],
            npcs: [resident()]
        )

        let result = compileLayout(
            sceneID: "room-1",
            eventPlan: plan,
            subjectRequirements: [],
            draft: draft
        )

        guard case let .result(payload) = result else {
            return XCTFail("Expected an invalid optional target to be normalized away")
        }
        XCTAssertEqual(
            payload.objectValue?["source"]?.stringValue,
            """
            root = Scene("Room", "meadow", [floor1, npc1, exit1])
            floor1 = Floor(8, 8, "grass")
            npc1 = NPC("resident_1", "Aki", 4, 5, "farmer", "calm", "#aabbcc")
            exit1 = Exit(6, 6, "next")
            """
        )
    }
}
#endif
