import SwiftUI

@main
struct UtralTodoApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self)
    private var appDelegate

    var body: some Scene {
        WindowGroup {
            WebShellView()
        }
    }
}

class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        application.registerForRemoteNotifications()
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        UserDefaults.standard.set(token, forKey: "apnsPushToken")
        NotificationCenter.default.post(name: .apnsTokenReceived, object: token)

        // Auto-register device with server if sync is configured
        Task {
            await autoRegisterDevice()
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        print("APNS registration failed:", error)
    }

    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        // Handle silent push (content-available: 1) by triggering sync in web view
        let aps = userInfo["aps"] as? [String: Any]
        let contentAvailable = aps?["content-available"] as? Int

        if contentAvailable == 1 {
            Task { @MainActor in
                WebViewStore.shared.triggerSync()
                completionHandler(.newData)
            }
        } else {
            completionHandler(.noData)
        }
    }

    private func autoRegisterDevice() async {
        guard UserDefaults.standard.string(forKey: "syncServerUrl") != nil else { return }

        let syncModule = SyncModule()
        do {
            _ = try await syncModule.handle(action: "registerDevice", params: [:])
            print("[AppDelegate] Device auto-registered with sync server")
        } catch {
            print("[AppDelegate] Auto-registration failed:", error)
        }
    }
}

extension Notification.Name {
    static let apnsTokenReceived = Notification.Name("apnsTokenReceived")
}
