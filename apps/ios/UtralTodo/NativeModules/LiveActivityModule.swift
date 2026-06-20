import Foundation
import ActivityKit

struct LiveActivityModule: BridgeModule {
    let name = "liveActivity"

    func handle(action: String, params: [String: BridgeValue]) async throws -> BridgeValue {
        switch action {
        case "start":
            guard let sessionId = params["sessionId"]?.asString,
                  let timerName = params["timerName"]?.asString,
                  let pluseId = params["pluseId"]?.asString else {
                throw BridgeModuleError.invalidParams
            }
            let todoId = params["todoId"]?.asString
            let intervals = params["intervals"]?.asArray?.compactMap { $0.asInt } ?? []
            let repeatCount = params["repeatCount"]?.asInt ?? 1
            let currentIndex = params["currentIndex"]?.asInt ?? 0
            let elapsedSeconds = params["elapsedSeconds"]?.asInt ?? 0

            LiveActivityManager.startActivity(
                sessionId: sessionId,
                timerName: timerName,
                pluseId: pluseId,
                todoId: todoId,
                intervals: intervals,
                repeatCount: repeatCount,
                currentIndex: currentIndex,
                elapsedSeconds: elapsedSeconds
            )
            return .bool(true)

        case "update":
            guard let currentIndex = params["currentIndex"]?.asInt,
                  let elapsedSeconds = params["elapsedSeconds"]?.asInt else {
                throw BridgeModuleError.invalidParams
            }
            let isRunning = params["isRunning"]?.asBool ?? true
            let isCompleted = params["isCompleted"]?.asBool ?? false
            let timerName = params["timerName"]?.asString

            if let name = timerName {
                LiveActivityManager.updateActivityWithName(
                    timerName: name,
                    currentIndex: currentIndex,
                    elapsedSeconds: elapsedSeconds,
                    isRunning: isRunning,
                    isCompleted: isCompleted
                )
            } else {
                LiveActivityManager.updateActivity(
                    currentIndex: currentIndex,
                    elapsedSeconds: elapsedSeconds,
                    isRunning: isRunning,
                    isCompleted: isCompleted
                )
            }
            return .bool(true)

        case "end":
            let isCompleted = params["isCompleted"]?.asBool ?? false
            LiveActivityManager.endActivity(isCompleted: isCompleted)
            return .bool(true)

        case "isEnabled":
            return .bool(ActivityAuthorizationInfo().areActivitiesEnabled)

        case "restore":
            LiveActivityManager.restoreActivity()
            return .bool(true)

        case "startPeriodicUpdates":
            let interval = params["interval"]?.asDouble ?? 10
            LiveActivityManager.startPeriodicUpdates(interval: interval)
            return .bool(true)

        case "stopPeriodicUpdates":
            LiveActivityManager.stopPeriodicUpdates()
            return .bool(true)

        default:
            throw BridgeModuleError.unknownAction(action)
        }
    }
}
