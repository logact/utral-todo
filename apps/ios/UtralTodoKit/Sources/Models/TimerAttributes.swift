import ActivityKit
import WidgetKit
import SwiftUI

public struct TimerAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var timerName: String
        public var currentIndex: Int
        public var totalIntervals: Int
        public var elapsedSeconds: Int
        public var intervalDuration: Int
        public var isRunning: Bool
        public var isCompleted: Bool
        public var pluseId: String
        public var todoId: String?

        public var remainingSeconds: Int {
            max(0, intervalDuration - elapsedSeconds)
        }

        public var formattedRemaining: String {
            let m = remainingSeconds / 60
            let s = remainingSeconds % 60
            return String(format: "%02d:%02d", m, s)
        }

        public var progress: Double {
            guard intervalDuration > 0 else { return 0 }
            return min(1.0, Double(elapsedSeconds) / Double(intervalDuration))
        }

        public init(
            timerName: String,
            currentIndex: Int,
            totalIntervals: Int,
            elapsedSeconds: Int,
            intervalDuration: Int,
            isRunning: Bool,
            isCompleted: Bool,
            pluseId: String,
            todoId: String?
        ) {
            self.timerName = timerName
            self.currentIndex = currentIndex
            self.totalIntervals = totalIntervals
            self.elapsedSeconds = elapsedSeconds
            self.intervalDuration = intervalDuration
            self.isRunning = isRunning
            self.isCompleted = isCompleted
            self.pluseId = pluseId
            self.todoId = todoId
        }

        public static func expandIntervals(_ intervals: [Int], repeatCount: Int) -> [Int] {
            var result: [Int] = []
            for _ in 0..<repeatCount {
                result.append(contentsOf: intervals)
            }
            return result
        }
    }

    public var sessionId: String
    public var intervals: [Int]
    public var repeatCount: Int

    public init(sessionId: String, intervals: [Int], repeatCount: Int) {
        self.sessionId = sessionId
        self.intervals = intervals
        self.repeatCount = repeatCount
    }
}
