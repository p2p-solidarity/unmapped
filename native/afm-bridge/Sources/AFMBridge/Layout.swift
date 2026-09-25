#if canImport(FoundationModels)
import Foundation
import FoundationModels

@available(macOS 27.0, *)
@Generable
enum LayoutBiome: String, Codable, Sendable, CaseIterable {
    case meadow
    case onsenTown = "onsen_town"
    case ruinedCastle = "ruined_castle"
    case cyberWorkshop = "cyber_workshop"
    case abyss
    case skyIsle = "sky_isle"
    case snowfield
    case lavaForge = "lava_forge"
    case countryside
}

@available(macOS 27.0, *)
@Generable
enum LayoutTile: String, Codable, Sendable, CaseIterable {
    case grass
    case stone
    case sand
    case snow
    case wood
    case lava
    case water
    case void
}

@available(macOS 27.0, *)
@Generable
enum LayoutObjectKind: String, Codable, Sendable, CaseIterable, Hashable {
    case tree
    case rock
    case torch
    case crate
    case altar
    case well
    case statue
    case pillar
    case fence
    case flower
    case mushroom
    case signpost
    case machineGear = "machine_gear"
    case conveyor
    case boiler
    case pipeStack = "pipe_stack"
    case crane
    case reactor
    case utilityPole = "utility_pole"
    case vendingMachine = "vending_machine"
    case busStop = "bus_stop"
    case railTrack = "rail_track"
    case chimney
    case steelTower = "steel_tower"
    case windmill
    case breakwater
    case house
}

@available(macOS 27.0, *)
@Generable
enum LayoutLightKind: String, Codable, Sendable {
    case ambient
    case sun
    case point
}

@available(macOS 27.0, *)
@Generable
enum LayoutNPCRole: String, Codable, Sendable {
    case merchant, monk, smith, farmer, `guard`, child, elder, bard, stranger
}

@available(macOS 27.0, *)
@Generable
enum LayoutNPCMood: String, Codable, Sendable {
    case calm, joyful, wary, mournful, manic, cryptic
}

@available(macOS 27.0, *)
@Generable(description: "A resident who lives in this room.")
struct LayoutNPCDraft: Codable, Sendable {
    var name: String
    @Guide(.range(0...31)) var x: Int
    @Guide(.range(0...31)) var z: Int
    var role: LayoutNPCRole
    var mood: LayoutNPCMood
    var color: String
}

@available(macOS 27.0, *)
@Generable(description: "A prop placed on the floor. Its stable ID is its one-based array position: prop1, prop2, and so on.")
struct LayoutObjectDraft: Codable, Sendable {
    var kind: LayoutObjectKind
    @Guide(.range(0...31)) var x: Int
    @Guide(.range(0...31)) var z: Int
    @Guide(.range(0.25...4.0)) var scale: Double
}

@available(macOS 27.0, *)
@Generable(description: "A room exit. Its stable ID is its one-based array position: exit1 or exit2.")
struct LayoutExitDraft: Codable, Sendable {
    @Guide(.range(0...31)) var x: Int
    @Guide(.range(0...31)) var z: Int
    var label: String
    var targetSceneID: String?

    private enum CodingKeys: String, CodingKey {
        case x
        case z
        case label
        case targetSceneID = "targetSceneId"
    }
}

@available(macOS 27.0, *)
@Generable
struct LayoutLightDraft: Codable, Sendable {
    var kind: LayoutLightKind
    var color: String
    @Guide(.range(0.0...5.0)) var intensity: Double
    var x: Int?
    var z: Int?
}

@available(macOS 27.0, *)
@Generable(description: "A spatial room layout for an already validated immutable event plan.")
struct SceneLayoutDraft: Codable, Sendable {
    var name: String
    var biome: LayoutBiome
    @Guide(.range(6...32)) var floorWidth: Int
    @Guide(.range(6...32)) var floorDepth: Int
    var floorTile: LayoutTile
    @Guide(.maximumCount(16)) var objects: [LayoutObjectDraft]
    @Guide(.maximumCount(2)) var exits: [LayoutExitDraft]
    @Guide(.maximumCount(3)) var lights: [LayoutLightDraft]
    @Guide(.count(1...3)) var npcs: [LayoutNPCDraft]
}

@available(macOS 27.0, *)
func compileLayout(
    sceneID: String,
    eventPlan: EventPlanDraft,
    subjectRequirements: [SubjectRequirement],
    draft: SceneLayoutDraft,
    origin: Bool = false
) -> OperationOutcome {
    let normalized = normalizeLayout(draft, origin: origin)
    if let error = validateLayout(
        eventPlan: eventPlan,
        subjectRequirements: subjectRequirements,
        draft: normalized,
        origin: origin
    ) {
        return .failure(error)
    }

    do {
        let eventPlanValue = try jsonValue(eventPlan)
        let floor = JSONValue.object([
            "width": .number(Double(normalized.floorWidth)),
            "depth": .number(Double(normalized.floorDepth)),
            "tile": .string(normalized.floorTile.rawValue),
        ])
        let objects = normalized.objects.enumerated().map { index, object in
            JSONValue.object([
                "id": .string("prop\(index + 1)"),
                "kind": .string(object.kind.rawValue),
                "x": .number(Double(object.x)),
                "z": .number(Double(object.z)),
            ])
        }
        let exits = normalized.exits.enumerated().map { index, exit in
            JSONValue.object([
                "id": .string("exit\(index + 1)"),
                "x": .number(Double(exit.x)),
                "z": .number(Double(exit.z)),
                "targetSceneId": exit.targetSceneID.map(JSONValue.string) ?? .null,
            ])
        }
        let lights = normalized.lights.enumerated().map { index, light in
            var value: [String: JSONValue] = [
                "id": .string("light\(index + 1)"),
                "kind": .string(light.kind.rawValue),
                "color": .string(light.color),
                "intensity": .number(light.intensity),
            ]
            if let x = light.x { value["x"] = .number(Double(x)) }
            if let z = light.z { value["z"] = .number(Double(z)) }
            return JSONValue.object(value)
        }
        return .result(.object([
            "sceneId": .string(sceneID),
            "source": .string(openUISource(normalized)),
            "ast": .object([
                "sceneId": .string(sceneID),
                "eventPlan": eventPlanValue,
                "floor": floor,
                "objects": .array(objects),
                "exits": .array(exits),
                "lights": .array(lights),
            ]),
        ]))
    } catch {
        return .failure(BridgeError(
            code: "bridge.encoding_failed",
            message: "The validated layout could not be encoded: \(error.localizedDescription)",
            hint: "Retry the request; report this bridge bug if it repeats.",
            retryable: false
        ))
    }
}

@available(macOS 27.0, *)
private func normalizeLayout(_ draft: SceneLayoutDraft, origin: Bool) -> SceneLayoutDraft {
    let allX = draft.objects.map(\.x) + draft.exits.map(\.x) + draft.lights.compactMap(\.x)
    let allZ = draft.objects.map(\.z) + draft.exits.map(\.z) + draft.lights.compactMap(\.z)
    let minimum = origin ? 12 : 6
    let maximum = origin ? 24 : 32
    let width = min(maximum, max(minimum, draft.floorWidth, (allX.max() ?? 0) + 1))
    let depth = min(maximum, max(minimum, draft.floorDepth, (allZ.max() ?? 0) + 1))
    let spawn = (x: width / 2, z: depth / 2)

    var usedExits = Set<String>()
    let exits = (origin ? [] : draft.exits).map { exit in
        let point = nearestPoint(
            to: (clamp(exit.x, upperBound: width), clamp(exit.z, upperBound: depth)),
            width: width,
            depth: depth
        ) { x, z in
            !usedExits.contains("\(x),\(z)") && (x != spawn.x || z != spawn.z)
        }
        usedExits.insert("\(point.x),\(point.z)")
        return LayoutExitDraft(
            x: point.x,
            z: point.z,
            label: exit.label,
            targetSceneID: exit.targetSceneID.flatMap(validSceneID)
        )
    }

    var placedObjects: [LayoutObjectDraft] = []
    for object in draft.objects {
        let scale = min(4, max(0.25, object.scale))
        let target = (clamp(object.x, upperBound: width), clamp(object.z, upperBound: depth))
        let point = nearestPoint(to: target, width: width, depth: depth) { x, z in
            guard x != spawn.x || z != spawn.z else { return false }
            guard exits.allSatisfy({ max(abs(x - $0.x), abs(z - $0.z)) >= 3 }) else {
                return false
            }
            return placedObjects.allSatisfy { placed in
                let radius = 0.25 * (scale + placed.scale)
                return Double(abs(x - placed.x)) >= radius || Double(abs(z - placed.z)) >= radius
            }
        }
        placedObjects.append(LayoutObjectDraft(kind: object.kind, x: point.x, z: point.z, scale: scale))
    }

    let lights = draft.lights.map { light in
        guard light.kind == .point else {
            return LayoutLightDraft(
                kind: light.kind,
                color: light.color,
                intensity: light.intensity,
                x: nil,
                z: nil
            )
        }
        return LayoutLightDraft(
            kind: light.kind,
            color: light.color,
            intensity: light.intensity,
            x: clamp(light.x ?? spawn.x, upperBound: width),
            z: clamp(light.z ?? spawn.z, upperBound: depth)
        )
    }
    var placedNPCs: [LayoutNPCDraft] = []
    for npc in draft.npcs {
        let target = (clamp(npc.x, upperBound: width), clamp(npc.z, upperBound: depth))
        let point = nearestPoint(to: target, width: width, depth: depth) { x, z in
            guard x != spawn.x || z != spawn.z else { return false }
            guard exits.allSatisfy({ max(abs(x - $0.x), abs(z - $0.z)) >= 2 }) else {
                return false
            }
            guard placedObjects.allSatisfy({ $0.x != x || $0.z != z }) else { return false }
            return placedNPCs.allSatisfy { $0.x != x || $0.z != z }
        }
        placedNPCs.append(LayoutNPCDraft(
            name: npc.name,
            x: point.x,
            z: point.z,
            role: npc.role,
            mood: npc.mood,
            color: npc.color
        ))
    }
    return SceneLayoutDraft(
        name: draft.name,
        biome: draft.biome,
        floorWidth: width,
        floorDepth: depth,
        floorTile: draft.floorTile,
        objects: placedObjects,
        exits: exits,
        lights: lights,
        npcs: placedNPCs
    )
}

private func clamp(_ value: Int, upperBound: Int) -> Int {
    min(max(0, value), upperBound - 1)
}

private func nearestPoint(
    to target: (x: Int, z: Int),
    width: Int,
    depth: Int,
    accepting: (Int, Int) -> Bool
) -> (x: Int, z: Int) {
    let candidates = (0..<width).flatMap { x in (0..<depth).map { z in (x: x, z: z) } }
    return candidates
        .sorted {
            let first = abs($0.x - target.x) + abs($0.z - target.z)
            let second = abs($1.x - target.x) + abs($1.z - target.z)
            if first != second { return first < second }
            if $0.z != $1.z { return $0.z < $1.z }
            return $0.x < $1.x
        }
        .first(where: { accepting($0.x, $0.z) }) ?? target
}

@available(macOS 27.0, *)
private func validateLayout(
    eventPlan: EventPlanDraft,
    subjectRequirements: [SubjectRequirement],
    draft: SceneLayoutDraft,
    origin: Bool
) -> BridgeError? {
    guard (6...32).contains(draft.floorWidth), (6...32).contains(draft.floorDepth) else {
        return invalidLayout("Floor dimensions must be between 6 and 32 tiles.")
    }
    guard draft.objects.count <= 16, draft.exits.count <= 2, draft.lights.count <= 3,
          (1...3).contains(draft.npcs.count) else {
        return invalidLayout("A layout supports at most 16 props, 2 exits, 3 lights, and 1 to 3 residents.")
    }
    if origin {
        guard draft.biome == .countryside,
              (12...24).contains(draft.floorWidth), (12...24).contains(draft.floorDepth),
              draft.floorTile == .grass || draft.floorTile == .sand,
              draft.exits.isEmpty,
              draft.lights.contains(where: { $0.kind == .sun }) else {
            return invalidLayout(
                "An open-land origin needs countryside, a 12 to 24 tile grass or sand floor, one sun, and no exits."
            )
        }
    }
    let inBounds: (Int, Int) -> Bool = { x, z in
        x >= 0 && z >= 0 && x < draft.floorWidth && z < draft.floorDepth
    }
    guard draft.objects.allSatisfy({ inBounds($0.x, $0.z) && (0.25...4).contains($0.scale) }) else {
        return invalidLayout("Every prop must be inside the floor and use a scale between 0.25 and 4.")
    }
    guard draft.exits.allSatisfy({ inBounds($0.x, $0.z) }) else {
        return invalidLayout("Every exit must be inside the floor.")
    }
    guard draft.npcs.allSatisfy({ inBounds($0.x, $0.z) && isHexColor($0.color) }) else {
        return invalidLayout("Every resident must be inside the floor and use a #rrggbb color.")
    }
    for light in draft.lights {
        guard isHexColor(light.color), (0...5).contains(light.intensity) else {
            return invalidLayout("Every light needs a #rrggbb color and intensity between 0 and 5.")
        }
        switch light.kind {
        case .ambient, .sun:
            guard light.x == nil, light.z == nil else {
                return invalidLayout("Ambient and sun lights must not have coordinates.")
            }
        case .point:
            guard let x = light.x, let z = light.z, inBounds(x, z) else {
                return invalidLayout("Point lights need in-bounds x and z coordinates.")
            }
        }
    }
    for event in eventPlan.events {
        guard let subject = event.subjectID else { continue }
        if event.trigger == .interact,
           indexedValue(subject, prefix: "prop").map({ $0 <= draft.objects.count }) != true {
            return invalidLayout("The layout does not contain required subject \(subject).")
        }
        if event.trigger == .exit,
           indexedValue(subject, prefix: "exit").map({ $0 <= draft.exits.count }) != true {
            return invalidLayout("The layout does not contain required subject \(subject).")
        }
    }
    let interactSubjects = Set(
        eventPlan.events
            .filter { $0.trigger == .interact }
            .compactMap(\.subjectID)
    )
    guard Set(subjectRequirements.map(\.id)) == interactSubjects else {
        return invalidLayout("Subject requirements must describe every interact subject exactly once.")
    }
    for requirement in subjectRequirements {
        guard let index = indexedValue(requirement.id, prefix: "prop"),
              index <= draft.objects.count,
              draft.objects[index - 1].kind == requirement.kind else {
            return invalidLayout(
                "Required subject \(requirement.id) must be a \(requirement.kind.rawValue)."
            )
        }
    }
    return nil
}

@available(macOS 27.0, *)
private func openUISource(_ draft: SceneLayoutDraft) -> String {
    let lightIDs = draft.lights.indices.map { "light\($0 + 1)" }
    let objectIDs = draft.objects.indices.map { "prop\($0 + 1)" }
    let exitIDs = draft.exits.indices.map { "exit\($0 + 1)" }
    let npcIDs = draft.npcs.indices.map { "npc\($0 + 1)" }
    let children = ["floor1"] + lightIDs + objectIDs + npcIDs + exitIDs
    var lines = [
        "root = Scene(\(dslString(draft.name)), \(dslString(draft.biome.rawValue)), [\(children.joined(separator: ", "))])",
        "floor1 = Floor(\(draft.floorWidth), \(draft.floorDepth), \(dslString(draft.floorTile.rawValue)))",
    ]
    for (index, light) in draft.lights.enumerated() {
        var arguments = [
            dslString(light.kind.rawValue),
            dslString(light.color),
            dslNumber(light.intensity),
        ]
        if light.kind == .point, let x = light.x, let z = light.z {
            arguments.append(String(x))
            arguments.append(String(z))
        }
        lines.append("light\(index + 1) = Light(\(arguments.joined(separator: ", ")))")
    }
    for (index, object) in draft.objects.enumerated() {
        var arguments = [dslString(object.kind.rawValue), String(object.x), String(object.z)]
        if object.scale != 1 { arguments.append(dslNumber(object.scale)) }
        lines.append("prop\(index + 1) = Prop(\(arguments.joined(separator: ", ")))")
    }
    for (index, npc) in draft.npcs.enumerated() {
        lines.append(
            "npc\(index + 1) = NPC(\(dslString("resident_\(index + 1)")), \(dslString(npc.name)), \(npc.x), \(npc.z), \(dslString(npc.role.rawValue)), \(dslString(npc.mood.rawValue)), \(dslString(npc.color)))"
        )
    }
    for (index, exit) in draft.exits.enumerated() {
        var arguments = [String(exit.x), String(exit.z), dslString(exit.label)]
        if let target = exit.targetSceneID { arguments.append(dslString(target)) }
        lines.append("exit\(index + 1) = Exit(\(arguments.joined(separator: ", ")))")
    }
    return lines.joined(separator: "\n")
}

private func dslString(_ value: String) -> String {
    let data = try? JSONEncoder().encode(value)
    return data.flatMap { String(data: $0, encoding: .utf8) } ?? "\"\""
}

private func dslNumber(_ value: Double) -> String {
    value.rounded() == value ? String(Int(value)) : String(value)
}

private func indexedValue(_ value: String, prefix: String) -> Int? {
    guard value.hasPrefix(prefix) else { return nil }
    return Int(value.dropFirst(prefix.count))
}

private func isHexColor(_ value: String) -> Bool {
    guard value.count == 7, value.first == "#" else { return false }
    return value.dropFirst().allSatisfy(\.isHexDigit)
}

private func validSceneID(_ value: String) -> String? {
    guard (1...80).contains(value.count),
          let first = value.first,
          first.isASCII,
          first.isLowercase || first.isNumber,
          value.allSatisfy({
              $0.isASCII && ($0.isLowercase || $0.isNumber || $0 == "_" || $0 == "-")
          }) else {
        return nil
    }
    return value
}

private func invalidLayout(_ message: String) -> BridgeError {
    BridgeError(
        code: "bridge.invalid_layout",
        message: message,
        hint: "Regenerate the layout from the same validated event plan and keep every required subject in bounds.",
        retryable: true
    )
}
#endif
