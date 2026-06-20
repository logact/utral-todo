import Foundation
import ActivityKit

public enum SharedTimerStore {
    public static let appGroupId = "group.com.logat.utralTodo"

    private static var sharedDefaults: UserDefaults? {
        UserDefaults(suiteName: appGroupId)
    }

    public struct SharedTimerState: Codable {
        public let sessionId: String
        public let timerName: String
        public let pluseId: String
        public let todoId: String?
        public let intervals: [Int]
        public let repeatCount: Int
        public let currentIndex: Int
        public let elapsedSeconds: Int
        public let isRunning: Bool
        public let isCompleted: Bool
        public let startedAt: TimeInterval

        public var currentIntervalDuration: Int {
            let expanded = Self.expandIntervals(intervals, repeatCount: repeatCount)
            guard currentIndex < expanded.count else { return 0 }
            return expanded[currentIndex]
        }

        public var totalIntervals: Int {
            Self.expandIntervals(intervals, repeatCount: repeatCount).count
        }

        public static func expandIntervals(_ intervals: [Int], repeatCount: Int) -> [Int] {
            var result: [Int] = []
            for _ in 0..<repeatCount {
                result.append(contentsOf: intervals)
            }
            return result
        }

        public init(
            sessionId: String,
            timerName: String,
            pluseId: String,
            todoId: String?,
            intervals: [Int],
            repeatCount: Int,
            currentIndex: Int,
            elapsedSeconds: Int,
            isRunning: Bool,
            isCompleted: Bool,
            startedAt: TimeInterval
        ) {
            self.sessionId = sessionId
            self.timerName = timerName
            self.pluseId = pluseId
            self.todoId = todoId
            self.intervals = intervals
            self.repeatCount = repeatCount
            self.currentIndex = currentIndex
            self.elapsedSeconds = elapsedSeconds
            self.isRunning = isRunning
            self.isCompleted = isCompleted
            self.startedAt = startedAt
        }
    }

    public static func saveTimerState(_ state: SharedTimerState) {
        guard let data = try? JSONEncoder().encode(state) else { return }
        sharedDefaults?.set(data, forKey: "activeTimerState")
    }

    public static func loadTimerState() -> SharedTimerState? {
        guard let data = sharedDefaults?.data(forKey: "activeTimerState") else { return nil }
        return try? JSONDecoder().decode(SharedTimerState.self, from: data)
    }

    public static func clearTimerState() {
        sharedDefaults?.removeObject(forKey: "activeTimerState")
    }

    public static func saveActivityId(_ activityId: String) {
        sharedDefaults?.set(activityId, forKey: "liveActivityId")
    }

    public static func loadActivityId() -> String? {
        sharedDefaults?.string(forKey: "liveActivityId")
    }

    public static func clearActivityId() {
        sharedDefaults?.removeObject(forKey: "liveActivityId")
    }
}
