#if canImport(FoundationModels)
import Foundation
import FoundationModels

@available(macOS 27.0, *)
@available(macOS 27.0, *)
@Generable
enum EventTriggerDraft: String, Codable, Sendable {
    case enter
    case interact
    case exit
}

@available(macOS 27.0, *)
@Generable
enum PredicateOperatorDraft: String, Codable, Sendable {
    case equals
    case notEquals = "not-equals"
    case exists
}

@available(macOS 27.0, *)
@Generable
struct PredicateDraft: Codable, Sendable {
    var key: String
    var `operator`: PredicateOperatorDraft
    var value: String?
}

@available(macOS 27.0, *)
@Generable
enum EffectOperationDraft: String, Codable, Sendable {
    case set
    case remove
}

@available(macOS 27.0, *)
@Generable
struct EffectDraft: Codable, Sendable {
    var key: String
    var operation: EffectOperationDraft
    // The shared TypeScript Effect contract requires value for every operation,
    // including remove. Consumers may ignore it for remove, but it stays on the wire.
    var value: String
}

@available(macOS 27.0, *)
struct CausalEventDraft: Codable, Sendable {
    var id: String
    var trigger: EventTriggerDraft
    var subjectID: String?
    var requires: [PredicateDraft]
    var effects: [EffectDraft]
    var nextEventIDs: [String]

    private enum CodingKeys: String, CodingKey {
        case id
        case trigger
        case subjectID = "subjectId"
        case requires
        case effects
        case nextEventIDs = "nextEventIds"
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(trigger, forKey: .trigger)
        // subjectId is required-but-nullable in the shared TypeScript contract.
        try container.encode(subjectID, forKey: .subjectID)
        try container.encode(requires, forKey: .requires)
        try container.encode(effects, forKey: .effects)
        try container.encode(nextEventIDs, forKey: .nextEventIDs)
    }
}

@available(macOS 27.0, *)
struct EventPlanDraft: Codable, Sendable {
    var entryEventID: String
    var events: [CausalEventDraft]
    var terminalEventIDs: [String]

    private enum CodingKeys: String, CodingKey {
        case entryEventID = "entryEventId"
        case events
        case terminalEventIDs = "terminalEventIds"
    }
}

@available(macOS 27.0, *)
@Generable(description: "One step in an ordered causal room sequence.")
struct GeneratedEventStep: Sendable {
    var idHint: String
    var trigger: EventTriggerDraft
    // Ignored for enter/exit; for interact this is carried into layout validation.
    var subjectKind: LayoutObjectKind
    @Guide(.maximumCount(8)) var requires: [PredicateDraft]
    @Guide(.maximumCount(8)) var effects: [EffectDraft]
}

@available(macOS 27.0, *)
@Generable(description: "An ordered causal sequence from room entry to its terminal event.")
struct GeneratedEventSequence: Sendable {
    @Guide(.count(1...8)) var steps: [GeneratedEventStep]
}

@available(macOS 27.0, *)
struct SubjectRequirement: Codable, Sendable, Equatable {
    let id: String
    let kind: LayoutObjectKind
}

@available(macOS 27.0, *)
struct CompiledEventSequence: Sendable {
    let eventPlan: EventPlanDraft
    let subjectRequirements: [SubjectRequirement]
}

@available(macOS 27.0, *)
func compileEventSequence(_ sequence: GeneratedEventSequence) -> CompiledEventSequence {
    var propSubjects: [LayoutObjectKind: String] = [:]
    var exitSubjects: [String: String] = [:]
    func subject(for step: GeneratedEventStep) -> String? {
        switch step.trigger {
        case .enter:
            return nil
        case .interact:
            if let existing = propSubjects[step.subjectKind] { return existing }
            let mapped = "prop\(propSubjects.count + 1)"
            propSubjects[step.subjectKind] = mapped
            return mapped
        case .exit:
            let key = normalizedIdentifier(step.idHint)
            if let existing = exitSubjects[key] { return existing }
            let mapped = "exit\(exitSubjects.count + 1)"
            exitSubjects[key] = mapped
            return mapped
        }
    }

    var usedIDs = Set<String>()
    let ids = sequence.steps.map { step in
        let base = normalizedIdentifier(step.idHint)
        var candidate = base
        var suffix = 2
        while usedIDs.contains(candidate) {
            candidate = "\(base)_\(suffix)"
            suffix += 1
        }
        usedIDs.insert(candidate)
        return candidate
    }
    guard let entryID = ids.first, let terminalID = ids.last else {
        return CompiledEventSequence(
            eventPlan: EventPlanDraft(entryEventID: "", events: [], terminalEventIDs: []),
            subjectRequirements: []
        )
    }
    var priorEffects: [EffectDraft] = []
    var events: [CausalEventDraft] = []
    for (index, step) in sequence.steps.enumerated() {
        let effects = step.effects.map { effect in
            EffectDraft(
                key: normalizedIdentifier(effect.key),
                operation: effect.operation,
                value: effect.value
            )
        }
        let requirements = step.requires
            .map { predicate in
                PredicateDraft(
                    key: normalizedIdentifier(predicate.key),
                    operator: predicate.operator,
                    value: predicate.operator == .exists ? nil : predicate.value
                )
            }
            .filter { predicate in
                priorEffects.contains { effectCanSatisfy($0, predicate: predicate) }
            }
        events.append(
            CausalEventDraft(
                id: ids[index],
                trigger: step.trigger,
                subjectID: subject(for: step),
                requires: requirements,
                effects: effects,
                nextEventIDs: index + 1 < ids.count ? [ids[index + 1]] : []
            )
        )
        priorEffects.append(contentsOf: effects)
    }
    let eventPlan = EventPlanDraft(
        entryEventID: entryID,
        events: events,
        terminalEventIDs: [terminalID]
    )
    let requirements = propSubjects
        .map { SubjectRequirement(id: $0.value, kind: $0.key) }
        .sorted { $0.id < $1.id }
    return CompiledEventSequence(eventPlan: eventPlan, subjectRequirements: requirements)
}

@available(macOS 27.0, *)
func validateEventPlan(_ plan: EventPlanDraft) -> BridgeError? {
    guard !plan.events.isEmpty, plan.events.count <= 16 else {
        return invalidEventPlan("An event plan must contain between 1 and 16 events.")
    }
    guard !plan.terminalEventIDs.isEmpty, plan.terminalEventIDs.count <= 4 else {
        return invalidEventPlan("An event plan must contain between 1 and 4 terminal events.")
    }

    var eventByID: [String: CausalEventDraft] = [:]
    for event in plan.events {
        guard isDSLIdentifier(event.id) else {
            return invalidEventPlan("Event ID \(event.id) is not a valid OpenUI identifier.")
        }
        guard eventByID[event.id] == nil else {
            return invalidEventPlan("Event ID \(event.id) is duplicated.")
        }
        guard validSubject(event) else {
            return invalidEventPlan("Event \(event.id) has a subject that does not match its trigger.")
        }
        for predicate in event.requires {
            guard isDSLIdentifier(predicate.key) else {
                return invalidEventPlan("Predicate keys must be OpenUI identifiers.")
            }
            if predicate.operator == .exists, predicate.value != nil {
                return invalidEventPlan("An exists predicate must not include a value.")
            }
            if predicate.operator != .exists, predicate.value == nil {
                return invalidEventPlan("Equals and not-equals predicates require a value.")
            }
        }
        for effect in event.effects {
            guard isDSLIdentifier(effect.key) else {
                return invalidEventPlan("Effect keys must be OpenUI identifiers.")
            }
        }
        eventByID[event.id] = event
    }

    guard let entryEvent = eventByID[plan.entryEventID] else {
        return invalidEventPlan(
            "Entry event \(plan.entryEventID) is not among declared IDs \(eventByID.keys.sorted())."
        )
    }
    guard entryEvent.trigger == .enter, entryEvent.requires.isEmpty else {
        return invalidEventPlan("The entry event must use the enter trigger and have no preconditions.")
    }
    guard Set(plan.terminalEventIDs).count == plan.terminalEventIDs.count else {
        return invalidEventPlan("Terminal event IDs must be unique.")
    }
    for terminalID in plan.terminalEventIDs {
        guard let terminal = eventByID[terminalID] else {
            return invalidEventPlan("Terminal event \(terminalID) is not declared.")
        }
        guard terminal.nextEventIDs.isEmpty else {
            return invalidEventPlan("Terminal event \(terminalID) must not have successors.")
        }
    }
    for event in plan.events {
        guard Set(event.nextEventIDs).count == event.nextEventIDs.count else {
            return invalidEventPlan("Event \(event.id) has duplicate successors.")
        }
        for nextID in event.nextEventIDs where eventByID[nextID] == nil {
            return invalidEventPlan("Event \(event.id) transitions to undeclared event \(nextID).")
        }
    }

    var reachable = Set([plan.entryEventID])
    var queue = [plan.entryEventID]
    while let current = queue.first {
        queue.removeFirst()
        for nextID in eventByID[current]?.nextEventIDs ?? [] where reachable.insert(nextID).inserted {
            queue.append(nextID)
        }
    }
    guard reachable.count == eventByID.count else {
        return invalidEventPlan("Every event must be reachable from the entry event.")
    }
    guard plan.terminalEventIDs.allSatisfy(reachable.contains) else {
        return invalidEventPlan("Every terminal event must be reachable from the entry event.")
    }
    if let error = validateCausalPreconditions(plan: plan, eventByID: eventByID) {
        return error
    }
    return nil
}

@available(macOS 27.0, *)
private func validateCausalPreconditions(
    plan: EventPlanDraft,
    eventByID: [String: CausalEventDraft]
) -> BridgeError? {
    var predecessors: [String: Set<String>] = [:]
    for event in plan.events {
        for nextID in event.nextEventIDs {
            predecessors[nextID, default: []].insert(event.id)
        }
    }

    func ancestorEffects(of eventID: String) -> [EffectDraft] {
        var visited = Set<String>()
        var queue = Array(predecessors[eventID] ?? [])
        var effects: [EffectDraft] = []
        while let current = queue.popLast() {
            guard visited.insert(current).inserted, let event = eventByID[current] else { continue }
            effects.append(contentsOf: event.effects)
            queue.append(contentsOf: predecessors[current] ?? [])
        }
        return effects
    }

    for event in plan.events where event.id != plan.entryEventID {
        let priorEffects = ancestorEffects(of: event.id)
        for predicate in event.requires {
            let satisfiable = priorEffects.contains { effectCanSatisfy($0, predicate: predicate) }
            if !satisfiable {
                return invalidEventPlan(
                    "Event \(event.id) has precondition \(predicate.key) that no preceding effect can satisfy."
                )
            }
        }
    }
    return nil
}

@available(macOS 27.0, *)
private func effectCanSatisfy(_ effect: EffectDraft, predicate: PredicateDraft) -> Bool {
    guard effect.key == predicate.key else { return false }
    switch predicate.operator {
    case .exists:
        return effect.operation == .set
    case .equals:
        return effect.operation == .set && effect.value == predicate.value
    case .notEquals:
        return effect.operation == .remove || effect.value != predicate.value
    }
}

@available(macOS 27.0, *)
private func validSubject(_ event: CausalEventDraft) -> Bool {
    switch event.trigger {
    case .enter:
        return event.subjectID == nil
    case .interact:
        return event.subjectID.map { isIndexedIdentifier($0, prefix: "prop") } ?? false
    case .exit:
        return event.subjectID.map { isIndexedIdentifier($0, prefix: "exit") } ?? false
    }
}

private func isDSLIdentifier(_ value: String) -> Bool {
    guard let first = value.first, first == "_" || first.isLowercase else { return false }
    return value.dropFirst().allSatisfy { $0 == "_" || $0.isLetter || $0.isNumber }
}

private func normalizedIdentifier(_ value: String) -> String {
    let lowered = value.lowercased()
    var output = ""
    var previousWasUnderscore = false
    for character in lowered {
        let allowed = character.isASCII && (character.isLetter || character.isNumber)
        if allowed {
            output.append(character)
            previousWasUnderscore = false
        } else if !previousWasUnderscore {
            output.append("_")
            previousWasUnderscore = true
        }
    }
    output = output.trimmingCharacters(in: CharacterSet(charactersIn: "_"))
    if output.isEmpty { return "event" }
    if output.first?.isNumber == true { return "_\(output)" }
    return output
}

private func isIndexedIdentifier(_ value: String, prefix: String) -> Bool {
    guard value.hasPrefix(prefix) else { return false }
    let suffix = value.dropFirst(prefix.count)
    guard let first = suffix.first, first != "0" else { return false }
    return !suffix.isEmpty && suffix.allSatisfy(\.isNumber)
}

private func invalidEventPlan(_ message: String) -> BridgeError {
    BridgeError(
        code: "bridge.invalid_event_plan",
        message: message,
        hint: "Regenerate a connected plan with unique IDs, declared transitions, and reachable terminal events.",
        retryable: true
    )
}
#endif
