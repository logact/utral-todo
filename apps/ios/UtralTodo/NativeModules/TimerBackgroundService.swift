import Foundation
import UserNotifications

enum TimerBackgroundService {
    private static let activeTimerKey = "timerBackgroundActiveId"

    struct TimerInfo: Codable {
        let id: String
        let endTime: TimeInterval
        let intervals: [Int]
        let repeatCount: Int
        let currentIndex: Int
        let elapsedSeconds: Int
        let pluseId: String?
        let todoId: String?
        let startedAt: TimeInterval?
    }

    static func startBackgroundTimer(
        id: String,
        endTime: TimeInterval,
        intervals: [Int],
        repeatCount: Int,
        currentIndex: Int,
        elapsedSeconds: Int,
        pluseId: String?,
        todoId: String?,
        startedAt: TimeInterval? = nil
    ) {
        let info = TimerInfo(
            id: id,
            endTime: endTime,
            intervals: intervals,
            repeatCount: repeatCount,
            currentIndex: currentIndex,
            elapsedSeconds: elapsedSeconds,
            pluseId: pluseId,
            todoId: todoId,
            startedAt: startedAt ?? Date().timeIntervalSince1970
        )

        saveTimerInfo(info)
        UserDefaults.standard.set(id, forKey: activeTimerKey)

        scheduleIntervalNotifications(for: info)
    }

    static func stopBackgroundTimer(id: String) {
        cancelNotifications(for: id)
        UserDefaults.standard.removeObject(forKey: timerInfoKey(id))
        if UserDefaults.standard.string(forKey: activeTimerKey) == id {
            UserDefaults.standard.removeObject(forKey: activeTimerKey)
        }
    }

    static func stopAllBackgroundTimers() {
        let defaults = UserDefaults.standard
        let keys = defaults.dictionaryRepresentation().keys
            .filter { $0.hasPrefix("timerBackground_") }
        for key in keys {
            let id = String(key.dropFirst("timerBackground_".count))
            stopBackgroundTimer(id: id)
        }
        defaults.removeObject(forKey: activeTimerKey)
    }

    static func getElapsedOnResume(id: String) -> (elapsed: Int, currentIndex: Int, shouldComplete: Bool, completedIntervals: [Int])? {
        guard let info = getTimerInfo(id: id) else { return nil }

        let now = Date().timeIntervalSince1970
        let remaining = calculateRemaining(for: info)
        let totalElapsed = info.elapsedSeconds + Int(now - (info.endTime - Double(remaining)))

        let expanded = expandIntervals(info.intervals, repeatCount: info.repeatCount)
        var accumulated = 0
        var completedIntervals: [Int] = []
        var currentIndex = info.currentIndex

        for (i, duration) in expanded.enumerated() {
            accumulated += duration
            if i < info.currentIndex { continue }
            if totalElapsed >= accumulated {
                completedIntervals.append(i)
                currentIndex = i + 1
            } else {
                break
            }
        }

        let allDone = currentIndex >= expanded.count
        let elapsedInCurrent = allDone ? 0 : totalElapsed - accumulatedForIndex(expanded, upTo: currentIndex - 1)

        return (
            elapsed: elapsedInCurrent,
            currentIndex: currentIndex,
            shouldComplete: allDone,
            completedIntervals: completedIntervals
        )
    }

    static func getActiveTimerId() -> String? {
        return UserDefaults.standard.string(forKey: activeTimerKey)
    }

    static func getTimerInfo(id: String) -> TimerInfo? {
        guard let data = UserDefaults.standard.data(forKey: timerInfoKey(id)) else { return nil }
        return try? JSONDecoder().decode(TimerInfo.self, from: data)
    }

    static func updateTimerInfo(id: String, currentIndex: Int, elapsedSeconds: Int) {
        guard let old = getTimerInfo(id: id) else { return }
        let updated = TimerInfo(
            id: old.id,
            endTime: old.endTime,
            intervals: old.intervals,
            repeatCount: old.repeatCount,
            currentIndex: currentIndex,
            elapsedSeconds: elapsedSeconds,
            pluseId: old.pluseId,
            todoId: old.todoId,
            startedAt: old.startedAt
        )
        saveTimerInfo(updated)
    }

    private static func timerInfoKey(_ id: String) -> String {
        "timerBackground_\(id)"
    }

    private static func saveTimerInfo(_ info: TimerInfo) {
        if let data = try? JSONEncoder().encode(info) {
            UserDefaults.standard.set(data, forKey: timerInfoKey(info.id))
        }
    }

    private static func calculateRemaining(for info: TimerInfo) -> Int {
        let expanded = expandIntervals(info.intervals, repeatCount: info.repeatCount)
        guard info.currentIndex < expanded.count else { return 0 }
        return expanded[info.currentIndex] - info.elapsedSeconds
    }

    private static func expandIntervals(_ intervals: [Int], repeatCount: Int) -> [Int] {
        var result: [Int] = []
        for _ in 0..<repeatCount {
            result.append(contentsOf: intervals)
        }
        return result
    }

    private static func accumulatedForIndex(_ expanded: [Int], upTo index: Int) -> Int {
        guard index >= 0 else { return 0 }
        var sum = 0
        for i in 0...min(index, expanded.count - 1) {
            sum += expanded[i]
        }
        return sum
    }

    private static func scheduleIntervalNotifications(for info: TimerInfo) {
        cancelNotifications(for: info.id)

        let expanded = expandIntervals(info.intervals, repeatCount: info.repeatCount)
        var accumulated = 0

        for (i, duration) in expanded.enumerated() {
            accumulated += duration
            if i < info.currentIndex { continue }

            let remaining = accumulated - info.elapsedSeconds
            if remaining <= 0 { continue }

            let content = UNMutableNotificationContent()
            content.title = "\(info.id) — Interval \(i + 1) complete"
            content.body = "Your timer interval has finished."
            content.sound = .default
            content.userInfo = [
                "timerId": info.id,
                "type": "timerIntervalComplete",
                "index": i,
                "isLast": i == expanded.count - 1
            ]

            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: TimeInterval(remaining), repeats: false)
            let requestId = "\(info.id)_interval_\(i)"
            let request = UNNotificationRequest(identifier: requestId, content: content, trigger: trigger)
            UNUserNotificationCenter.current().add(request)
        }
    }

    private static func cancelNotifications(for id: String) {
        var ids = [id]
        for i in 0..<100 {
            ids.append("\(id)_interval_\(i)")
        }
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ids)
    }

    // MARK: - Periodic Live Activity Updates

    static func schedulePeriodicLiveActivityUpdates(id: String) {
        let expanded = expandIntervals(
            (getTimerInfo(id: id)?.intervals) ?? [],
            repeatCount: (getTimerInfo(id: id)?.repeatCount) ?? 1
        )
        guard !expanded.isEmpty else { return }

        var accumulated = 0
        for (i, duration) in expanded.enumerated() {
            accumulated += duration
            let remaining = accumulated - ((getTimerInfo(id: id)?.elapsedSeconds) ?? 0)
            if remaining <= 0 { continue }

            let content = UNMutableNotificationContent()
            content.title = "liveActivityUpdate"
            content.userInfo = [
                "timerId": id,
                "type": "liveActivityUpdate"
            ]

            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: TimeInterval(remaining), repeats: false)
            let requestId = "\(id)_liveactivity_\(i)"
            let request = UNNotificationRequest(identifier: requestId, content: content, trigger: trigger)
            UNUserNotificationCenter.current().add(request)
        }
    }

    static func cancelPeriodicLiveActivityUpdates(id: String) {
        var ids: [String] = []
        for i in 0..<100 {
            ids.append("\(id)_liveactivity_\(i)")
        }
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ids)
    }
}
