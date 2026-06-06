import Foundation
import SwiftData

@Model
public final class Roadmap {
    @Attribute(.unique) public var id: String
    public var goalTodoId: String
    public var phasesData: Data
    public var createdAt: Date
    public var updatedAt: Date

    public var phases: [RoadmapPhase] {
        get {
            (try? JSONDecoder().decode([RoadmapPhase].self, from: phasesData)) ?? []
        }
        set {
            phasesData = (try? JSONEncoder().encode(newValue)) ?? Data()
        }
    }

    public init(
        id: String = UUID().uuidString,
        goalTodoId: String,
        phases: [RoadmapPhase] = [],
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.goalTodoId = goalTodoId
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.phasesData = (try? JSONEncoder().encode(phases)) ?? Data()
    }
}

public struct RoadmapPhase: Codable, Hashable {
    public var id: String
    public var title: String
    public var order: Int
    public var todoIds: [String]
    public var startAt: Date?
    public var endAt: Date?

    public init(
        id: String = UUID().uuidString,
        title: String,
        order: Int = 0,
        todoIds: [String] = [],
        startAt: Date? = nil,
        endAt: Date? = nil
    ) {
        self.id = id
        self.title = title
        self.order = order
        self.todoIds = todoIds
        self.startAt = startAt
        self.endAt = endAt
    }
}
