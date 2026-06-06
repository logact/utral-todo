import UserNotifications
import UIKit

struct NotificationModule: BridgeModule {
    let name = "notification"

    func handle(action: String, params: [String: BridgeValue]) async throws -> BridgeValue {
        switch action {
        case "requestPermission":
            let center = UNUserNotificationCenter.current()
            let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
            return .bool(granted)

        case "schedule":
            guard let id = params["id"]?.asString,
                  let title = params["title"]?.asString else {
                throw BridgeModuleError.invalidParams
            }
            let body = params["body"]?.asString ?? ""
            let date = params["date"]?.asInt.map { TimeInterval($0 / 1000) } ?? Date().timeIntervalSince1970 + 60

            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            content.sound = .default

            let triggerDate = Date(timeIntervalSince1970: date)
            let components = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: triggerDate)
            let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)

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
