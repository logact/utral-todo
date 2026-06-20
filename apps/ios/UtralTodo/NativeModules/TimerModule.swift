import UserNotifications

struct TimerModule: BridgeModule {
    let name = "timer"

    func handle(action: String, params: [String: BridgeValue]) async throws -> BridgeValue {
        switch action {
        case "schedule":
            guard let id = params["id"]?.asString,
                  let title = params["title"]?.asString else {
                throw BridgeModuleError.invalidParams
            }
            let body = params["body"]?.asString ?? ""
            let seconds = params["seconds"]?.asDouble ?? params["seconds"]?.asInt.map(Double.init) ?? 60

            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            content.sound = .default
            content.userInfo = ["timerId": id]

            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, seconds), repeats: false)
            let request = UNNotificationRequest(identifier: id, content: content, trigger: trigger)
            try await UNUserNotificationCenter.current().add(request)
            return .bool(true)

        case "cancel":
            guard let id = params["id"]?.asString else {
                throw BridgeModuleError.invalidParams
            }
            UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [id])
            return .bool(true)

        case "cancelAll":
            UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
            return .bool(true)

        case "startBackground":
            guard let id = params["id"]?.asString,
                  let endTime = params["endTime"]?.asDouble else {
                throw BridgeModuleError.invalidParams
            }
            let intervals = params["intervals"]?.asArray?.compactMap { $0.asInt } ?? []
            let repeatCount = params["repeatCount"]?.asInt ?? 1
            let currentIndex = params["currentIndex"]?.asInt ?? 0
            let elapsedSeconds = params["elapsedSeconds"]?.asInt ?? 0
            let pluseId = params["pluseId"]?.asString
            let todoId = params["todoId"]?.asString
            let startedAt = params["startedAt"]?.asDouble

            TimerBackgroundService.startBackgroundTimer(
                id: id,
                endTime: endTime / 1000,
                intervals: intervals,
                repeatCount: repeatCount,
                currentIndex: currentIndex,
                elapsedSeconds: elapsedSeconds,
                pluseId: pluseId,
                todoId: todoId,
                startedAt: startedAt.map { $0 / 1000 }
            )
            TimerSyncCoordinator.startPeriodicSync(sessionId: id)
            return .bool(true)

        case "stopBackground":
            guard let id = params["id"]?.asString else {
                throw BridgeModuleError.invalidParams
            }
            TimerBackgroundService.stopBackgroundTimer(id: id)
            return .bool(true)

        case "stopAllBackground":
            TimerBackgroundService.stopAllBackgroundTimers()
            return .bool(true)

        case "getElapsedOnResume":
            guard let id = params["id"]?.asString else {
                throw BridgeModuleError.invalidParams
            }
            guard let result = TimerBackgroundService.getElapsedOnResume(id: id) else {
                return .object(["found": .bool(false)])
            }
            return .object([
                "found": .bool(true),
                "elapsed": .int(result.elapsed),
                "currentIndex": .int(result.currentIndex),
                "shouldComplete": .bool(result.shouldComplete),
                "completedIntervals": .array(result.completedIntervals.map { .int($0) })
            ])

        case "getActiveTimerId":
            let id = TimerBackgroundService.getActiveTimerId()
            if let id = id {
                return .string(id)
            }
            return .null

        case "syncTimerState":
            guard let sessionId = params["sessionId"]?.asString else {
                throw BridgeModuleError.invalidParams
            }
            let elapsedSeconds = params["elapsedSeconds"]?.asInt ?? 0
            let currentIndex = params["currentIndex"]?.asInt ?? 0
            let status = params["status"]?.asString ?? "running"
            let startedAt = params["startedAt"]?.asDouble

            await TimerSyncCoordinator.syncOnStateChange(
                sessionId: sessionId,
                elapsedSeconds: elapsedSeconds,
                currentIndex: currentIndex,
                status: status,
                startedAt: startedAt
            )
            return .bool(true)

        case "stopSync":
            guard params["sessionId"]?.asString != nil else {
                throw BridgeModuleError.invalidParams
            }
            TimerSyncCoordinator.stopPeriodicSync()
            return .bool(true)

        default:
            throw BridgeModuleError.unknownAction(action)
        }
    }
}
