import Foundation
import UIKit

struct SyncModule: BridgeModule {
    let name = "sync"

    private var defaults: UserDefaults { UserDefaults.standard }

    func handle(action: String, params: [String: BridgeValue]) async throws -> BridgeValue {
        switch action {
        case "getDeviceId":
            return .string(deviceId())

        case "getSyncConfig":
            var result: [String: BridgeValue] = [:]
            if let serverUrl = defaults.string(forKey: "syncServerUrl") {
                result["serverUrl"] = .string(serverUrl)
            }
            if let apiToken = defaults.string(forKey: "syncApiToken") {
                result["apiToken"] = .string(apiToken)
            }
            return .object(result)

        case "setSyncConfig":
            if let serverUrl = params["serverUrl"]?.asString {
                defaults.set(serverUrl, forKey: "syncServerUrl")
            }
            if let apiToken = params["apiToken"]?.asString {
                defaults.set(apiToken, forKey: "syncApiToken")
            }
            return .bool(true)

        case "registerDevice":
            try await registerDeviceWithServer()
            return .bool(true)

        case "syncPendingTimers":
            await TimerSyncCoordinator.flushPendingSyncs()
            return .bool(true)

        default:
            throw BridgeModuleError.unknownAction(action)
        }
    }

    private func deviceId() -> String {
        if let id = defaults.string(forKey: "deviceId") {
            return id
        }
        let newId = UUID().uuidString
        defaults.set(newId, forKey: "deviceId")
        return newId
    }

    private func registerDeviceWithServer() async throws {
        guard let serverUrl = defaults.string(forKey: "syncServerUrl") else {
            throw SyncModuleError.noServerConfigured
        }

        let id = deviceId()
        let pushToken = defaults.string(forKey: "apnsPushToken")
        let appVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String

        let urlString = serverUrl.hasSuffix("/") ? serverUrl + "api/devices/register" : serverUrl + "/api/devices/register"
        guard let url = URL(string: urlString) else {
            throw SyncModuleError.invalidUrl
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let apiToken = defaults.string(forKey: "syncApiToken") {
            request.setValue("Bearer \(apiToken)", forHTTPHeaderField: "Authorization")
        }

        let body: [String: String?] = [
            "deviceId": id,
            "platform": "ios",
            "name": await MainActor.run { UIDevice.current.name },
            "pushToken": pushToken,
            "appVersion": appVersion,
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (_, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
            throw SyncModuleError.registrationFailed
        }
    }
}

enum SyncModuleError: Error, LocalizedError {
    case noServerConfigured
    case invalidUrl
    case registrationFailed

    var errorDescription: String? {
        switch self {
        case .noServerConfigured: return "No sync server URL configured"
        case .invalidUrl: return "Invalid server URL"
        case .registrationFailed: return "Device registration failed"
        }
    }
}
