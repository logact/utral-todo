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

        default:
            throw BridgeModuleError.unknownAction(action)
        }
    }
}
