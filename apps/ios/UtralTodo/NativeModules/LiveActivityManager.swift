import Foundation
import ActivityKit
import UtralTodoKit

enum LiveActivityManager {
    private static var currentActivity: Activity<TimerAttributes>?
    private static var periodicUpdateTimer: Timer?

    static func startActivity(
        sessionId: String,
        timerName: String,
        pluseId: String,
        todoId: String?,
        intervals: [Int],
        repeatCount: Int,
        currentIndex: Int = 0,
        elapsedSeconds: Int = 0
    ) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            print("[LiveActivity] Activities not enabled")
            return
        }

        let attributes = TimerAttributes(
            sessionId: sessionId,
            intervals: intervals,
            repeatCount: repeatCount
        )

        let expanded = TimerAttributes.ContentState.expandIntervals(intervals, repeatCount: repeatCount)
        let currentDuration = currentIndex < expanded.count ? expanded[currentIndex] : 0

        let state = TimerAttributes.ContentState(
            timerName: timerName,
            currentIndex: currentIndex,
            totalIntervals: expanded.count,
            elapsedSeconds: elapsedSeconds,
            intervalDuration: currentDuration,
            isRunning: true,
            isCompleted: false,
            pluseId: pluseId,
            todoId: todoId
        )

        do {
            let activity = try Activity<TimerAttributes>.request(
                attributes: attributes,
                content: .init(state: state, staleDate: nil)
            )
            currentActivity = activity
            SharedTimerStore.saveActivityId(activity.id)

            let sharedState = SharedTimerStore.SharedTimerState(
                sessionId: sessionId,
                timerName: timerName,
                pluseId: pluseId,
                todoId: todoId,
                intervals: intervals,
                repeatCount: repeatCount,
                currentIndex: currentIndex,
                elapsedSeconds: elapsedSeconds,
                isRunning: true,
                isCompleted: false,
                startedAt: Date().timeIntervalSince1970
            )
            SharedTimerStore.saveTimerState(sharedState)

            print("[LiveActivity] Started: \(activity.id)")
        } catch {
            print("[LiveActivity] Failed to start: \(error)")
        }
    }

    static func updateActivity(
        currentIndex: Int,
        elapsedSeconds: Int,
        isRunning: Bool,
        isCompleted: Bool
    ) {
        guard let activity = currentActivity else {
            print("[LiveActivity] No active activity to update")
            return
        }

        let attrs = activity.attributes
        let expanded = TimerAttributes.ContentState.expandIntervals(attrs.intervals, repeatCount: attrs.repeatCount)
        let currentDuration = currentIndex < expanded.count ? expanded[currentIndex] : 0

        let state = TimerAttributes.ContentState(
            timerName: activity.attributes.sessionId,
            currentIndex: currentIndex,
            totalIntervals: expanded.count,
            elapsedSeconds: elapsedSeconds,
            intervalDuration: currentDuration,
            isRunning: isRunning,
            isCompleted: isCompleted,
            pluseId: "",
            todoId: nil
        )

        Task {
            await activity.update(.init(state: state, staleDate: nil))
        }

        if let sharedState = SharedTimerStore.loadTimerState() {
            let updated = SharedTimerStore.SharedTimerState(
                sessionId: sharedState.sessionId,
                timerName: sharedState.timerName,
                pluseId: sharedState.pluseId,
                todoId: sharedState.todoId,
                intervals: sharedState.intervals,
                repeatCount: sharedState.repeatCount,
                currentIndex: currentIndex,
                elapsedSeconds: elapsedSeconds,
                isRunning: isRunning,
                isCompleted: isCompleted,
                startedAt: sharedState.startedAt
            )
            SharedTimerStore.saveTimerState(updated)
        }
    }

    static func updateActivityWithName(
        timerName: String,
        currentIndex: Int,
        elapsedSeconds: Int,
        isRunning: Bool,
        isCompleted: Bool
    ) {
        guard let activity = currentActivity else { return }

        let attrs = activity.attributes
        let expanded = TimerAttributes.ContentState.expandIntervals(attrs.intervals, repeatCount: attrs.repeatCount)
        let currentDuration = currentIndex < expanded.count ? expanded[currentIndex] : 0

        let state = TimerAttributes.ContentState(
            timerName: timerName,
            currentIndex: currentIndex,
            totalIntervals: expanded.count,
            elapsedSeconds: elapsedSeconds,
            intervalDuration: currentDuration,
            isRunning: isRunning,
            isCompleted: isCompleted,
            pluseId: "",
            todoId: nil
        )

        Task {
            await activity.update(.init(state: state, staleDate: nil))
        }

        if let sharedState = SharedTimerStore.loadTimerState() {
            let updated = SharedTimerStore.SharedTimerState(
                sessionId: sharedState.sessionId,
                timerName: timerName,
                pluseId: sharedState.pluseId,
                todoId: sharedState.todoId,
                intervals: sharedState.intervals,
                repeatCount: sharedState.repeatCount,
                currentIndex: currentIndex,
                elapsedSeconds: elapsedSeconds,
                isRunning: isRunning,
                isCompleted: isCompleted,
                startedAt: sharedState.startedAt
            )
            SharedTimerStore.saveTimerState(updated)
        }
    }

    static func endActivity(isCompleted: Bool) {
        guard let activity = currentActivity else { return }

        let attrs = activity.attributes
        let expanded = TimerAttributes.ContentState.expandIntervals(attrs.intervals, repeatCount: attrs.repeatCount)

        let state = TimerAttributes.ContentState(
            timerName: attrs.sessionId,
            currentIndex: expanded.count - 1,
            totalIntervals: expanded.count,
            elapsedSeconds: expanded.last ?? 0,
            intervalDuration: expanded.last ?? 0,
            isRunning: false,
            isCompleted: isCompleted,
            pluseId: "",
            todoId: nil
        )

        Task {
            await activity.end(.init(state: state, staleDate: Date().addingTimeInterval(300)), dismissalPolicy: .after(Date().addingTimeInterval(300)))
        }

        currentActivity = nil
        SharedTimerStore.clearActivityId()
        SharedTimerStore.clearTimerState()
    }

    static func restoreActivity() {
        guard let activityId = SharedTimerStore.loadActivityId() else { return }

        Task {
            for activity in Activity<TimerAttributes>.activities {
                if activity.id == activityId {
                    currentActivity = activity
                    print("[LiveActivity] Restored: \(activityId)")
                    return
                }
            }
            SharedTimerStore.clearActivityId()
        }
    }

    // MARK: - Periodic Updates

    static func startPeriodicUpdates(interval: TimeInterval = 10) {
        stopPeriodicUpdates()
        periodicUpdateTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { _ in
            updateFromSharedState()
        }
    }

    static func stopPeriodicUpdates() {
        periodicUpdateTimer?.invalidate()
        periodicUpdateTimer = nil
    }

    static func updateFromSharedState() {
        guard let activity = currentActivity,
              let sharedState = SharedTimerStore.loadTimerState() else { return }

        let attrs = activity.attributes
        let expanded = TimerAttributes.ContentState.expandIntervals(attrs.intervals, repeatCount: attrs.repeatCount)
        let currentDuration = sharedState.currentIndex < expanded.count ? expanded[sharedState.currentIndex] : 0

        let state = TimerAttributes.ContentState(
            timerName: sharedState.timerName,
            currentIndex: sharedState.currentIndex,
            totalIntervals: expanded.count,
            elapsedSeconds: sharedState.elapsedSeconds,
            intervalDuration: currentDuration,
            isRunning: sharedState.isRunning,
            isCompleted: sharedState.isCompleted,
            pluseId: sharedState.pluseId,
            todoId: sharedState.todoId
        )

        Task {
            await activity.update(.init(state: state, staleDate: nil))
        }
    }
}
