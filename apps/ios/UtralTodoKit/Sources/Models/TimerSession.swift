import Foundation
import SwiftData

@Model
public final class TimerSession {
    @Attribute(.unique) public var id: String
    public var type: String
    public var name: String
    public var pluseId: String?
    public var todoId: String?
    public var intervalsData: Data?
    public var repeatCount: Int
    public var startedAt: Date
    public var pausedAt: Date?
    public var completedAt: Date?
    public var currentIndex: Int
    public var elapsedSeconds: Int
    public var status: String
    public var createdAt: Date
    public var updatedAt: Date

    public var intervals: [Int]? {
        get {
            guard let data = intervalsData else { return nil }
            return try? JSONDecoder().decode([Int].self, from: data)
        }
        set {
            intervalsData = newValue.flatMap { try? JSONEncoder().encode($0) }
        }
    }

    public var isRunning: Bool { status == "running" }
    public var isPaused: Bool { status == "paused" }
    public var isCompleted: Bool { status == "completed" }

    public init(
        id: String = UUID().uuidString,
        type: String = "stopwatch",
        name: String,
        pluseId: String? = nil,
        todoId: String? = nil,
        intervals: [Int]? = nil,
        repeatCount: Int = 1,
        startedAt: Date = Date(),
        pausedAt: Date? = nil,
        completedAt: Date? = nil,
        currentIndex: Int = 0,
        elapsedSeconds: Int = 0,
        status: String = "running",
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.type = type
        self.name = name
        self.pluseId = pluseId
        self.todoId = todoId
        self.repeatCount = repeatCount
        self.startedAt = startedAt
        self.pausedAt = pausedAt
        self.completedAt = completedAt
        self.currentIndex = currentIndex
        self.elapsedSeconds = elapsedSeconds
        self.status = status
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.intervalsData = intervals.flatMap { try? JSONEncoder().encode($0) }
    }
}
