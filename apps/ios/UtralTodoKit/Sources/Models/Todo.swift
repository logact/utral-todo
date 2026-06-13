import Foundation
import SwiftData

@Model
public final class Todo {
    @Attribute(.unique) public var id: String
    public var parentId: String?
    public var title: String
    public var desc: String
    public var status: String
    public var priority: String
    public var estimatedMinutes: Int
    public var tagsData: Data?
    public var createdAt: Date
    public var updatedAt: Date
    public var dueDate: Date?
    public var scheduledDate: Date?
    public var startedAt: Date?
    public var completedAt: Date?
    public var repeatRuleData: Data?
    public var order: Int
    public var isGoal: Bool

    public var tags: [String] {
        get {
            guard let data = tagsData else { return [] }
            return (try? JSONDecoder().decode([String].self, from: data)) ?? []
        }
        set {
            tagsData = try? JSONEncoder().encode(newValue)
        }
    }

    public init(
        id: String = UUID().uuidString,
        parentId: String? = nil,
        title: String,
        desc: String = "",
        status: String = "pending",
        priority: String = "medium",
        estimatedMinutes: Int = 60,
        tags: [String] = [],
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        dueDate: Date? = nil,
        scheduledDate: Date? = nil,
        startedAt: Date? = nil,
        completedAt: Date? = nil,
        order: Int = 0,
        isGoal: Bool = false
    ) {
        self.id = id
        self.parentId = parentId
        self.title = title
        self.desc = desc
        self.status = status
        self.priority = priority
        self.estimatedMinutes = estimatedMinutes
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.dueDate = dueDate
        self.scheduledDate = scheduledDate
        self.startedAt = startedAt
        self.completedAt = completedAt
        self.order = order
        self.isGoal = isGoal
        self.tagsData = try? JSONEncoder().encode(tags)
    }
}

public extension Todo {
    var isDone: Bool { status == "done" }
    var isInProgress: Bool { status == "in_progress" }
    var isPending: Bool { status == "pending" }
    var displayStatus: String {
        switch status {
        case "pending": return "Pending"
        case "in_progress": return "In Progress"
        case "done": return "Done"
        default: return status
        }
    }
}
