import SwiftUI
import ActivityKit
import UtralTodoKit

@main
struct UtralTodoApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self)
    private var appDelegate

    var body: some Scene {
        WindowGroup {
            WebShellView()
                .onAppear {
                    LiveActivityManager.restoreActivity()
                    Task {
                        await TimerRecovery.recoverOnLaunch()
                    }
                }
        }
    }
}

class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        application.registerForRemoteNotifications()
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        center.requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
            if let error = error {
                print("[AppDelegate] Notification permission error:", error)
            } else {
                print("[AppDelegate] Notification permission granted: \(granted)")
                if granted {
                    let content = UNMutableNotificationContent()
                    content.title = "Utral Todo"
                    content.body = "Notifications are working!"
                    content.sound = .default
                    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 5, repeats: false)
                    let request = UNNotificationRequest(identifier: "test-notification", content: content, trigger: trigger)
                    UNUserNotificationCenter.current().add(request)
                }
            }
        }
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

extension AppDelegate: UNUserNotificationCenterDelegate {
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        completionHandler()
    }
}

extension Notification.Name {
    static let apnsTokenReceived = Notification.Name("apnsTokenReceived")
}

enum TimerRecovery {
    static func recoverOnLaunch() async {
        guard let sharedState = SharedTimerStore.loadTimerState() else { return }

        let elapsed = Int(Date().timeIntervalSince1970 - sharedState.startedAt)
        let expanded = SharedTimerStore.SharedTimerState.expandIntervals(
            sharedState.intervals,
            repeatCount: sharedState.repeatCount
        )

        var currentIndex = sharedState.currentIndex
        var accumulated = 0
        var shouldComplete = false

        for (i, duration) in expanded.enumerated() {
            accumulated += duration
            if i < sharedState.currentIndex { continue }
            if elapsed >= accumulated {
                currentIndex = i + 1
            } else {
                break
            }
        }

        shouldComplete = currentIndex >= expanded.count
        let elapsedInCurrent = shouldComplete ? 0 : elapsed - (currentIndex > 0 ? expanded[0..<currentIndex].reduce(0, +) : 0)

        if shouldComplete {
            LiveActivityManager.endActivity(isCompleted: true)
            let sessionId = sharedState.pluseId
            let module = TimerModule()
            _ = try? await module.handle(action: "cancel", params: ["id": .string(sessionId)])
            await TimerSyncCoordinator.syncOnStateChange(
                sessionId: sharedState.sessionId,
                elapsedSeconds: elapsed,
                currentIndex: currentIndex,
                status: "completed",
                startedAt: sharedState.startedAt
            )
        } else {
            LiveActivityManager.updateActivity(
                currentIndex: currentIndex,
                elapsedSeconds: elapsedInCurrent,
                isRunning: true,
                isCompleted: false
            )
            TimerBackgroundService.startBackgroundTimer(
                id: sharedState.sessionId,
                endTime: Date().timeIntervalSince1970 + Double(expanded[currentIndex] - elapsedInCurrent),
                intervals: sharedState.intervals,
                repeatCount: sharedState.repeatCount,
                currentIndex: currentIndex,
                elapsedSeconds: elapsedInCurrent,
                pluseId: sharedState.pluseId,
                todoId: sharedState.todoId,
                startedAt: sharedState.startedAt
            )
            TimerSyncCoordinator.startPeriodicSync(sessionId: sharedState.sessionId)
        }
    }
}
