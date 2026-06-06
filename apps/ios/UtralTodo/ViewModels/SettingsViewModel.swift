import Foundation

@MainActor
final class SettingsViewModel: ObservableObject {
    @Published var serverUrl: String {
        didSet { UserDefaults.standard.set(serverUrl, forKey: "serverUrl") }
    }

    @Published var apiToken: String? {
        didSet { UserDefaults.standard.set(apiToken, forKey: "apiToken") }
    }

    @Published var syncEnabled: Bool {
        didSet { UserDefaults.standard.set(syncEnabled, forKey: "syncEnabled") }
    }

    @Published var pushToken: String?

    let deviceId: String

    var lastSyncDate: Date? {
        UserDefaults.standard.object(forKey: "lastSyncDate") as? Date
    }

    init() {
        self.serverUrl = UserDefaults.standard.string(forKey: "serverUrl") ?? ""
        self.apiToken = UserDefaults.standard.string(forKey: "apiToken")
        self.syncEnabled = UserDefaults.standard.bool(forKey: "syncEnabled")
        self.pushToken = UserDefaults.standard.string(forKey: "apnsPushToken")

        if let saved = UserDefaults.standard.string(forKey: "deviceId") {
            self.deviceId = saved
        } else {
            let id = UUID().uuidString
            UserDefaults.standard.set(id, forKey: "deviceId")
            self.deviceId = id
        }
    }

    func forceSync() async {
        print("Force sync...")
        UserDefaults.standard.set(Date(), forKey: "lastSyncDate")
    }
}
