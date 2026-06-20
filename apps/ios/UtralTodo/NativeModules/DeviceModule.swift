import UIKit

@MainActor
struct DeviceModule: BridgeModule {
    let name = "device"

    func handle(action: String, params: [String: BridgeValue]) async throws -> BridgeValue {
        switch action {
        case "getInfo":
            let device = UIDevice.current
            return .object([
                "platform": .string("ios"),
                "model": .string(device.model),
                "systemName": .string(device.systemName),
                "systemVersion": .string(device.systemVersion),
                "name": .string(device.name),
                "deviceId": .string(deviceId()),
                "pushToken": UserDefaults.standard.string(forKey: "apnsPushToken").map(BridgeValue.string) ?? .null,
                "isPad": .bool(UIDevice.current.userInterfaceIdiom == .pad),
                "isDarkMode": .bool(UITraitCollection.current.userInterfaceStyle == .dark),
            ])

        case "getPushToken":
            let token = UserDefaults.standard.string(forKey: "apnsPushToken")
            return token.map(BridgeValue.string) ?? .null

        case "vibrate":
            // Lightweight vibration - use haptic instead for modern devices
            return .bool(true)

        default:
            throw BridgeModuleError.unknownAction(action)
        }
    }

    private func deviceId() -> String {
        if let id = UserDefaults.standard.string(forKey: "deviceId") {
            return id
        }
        let newId = UUID().uuidString
        UserDefaults.standard.set(newId, forKey: "deviceId")
        return newId
    }
}
