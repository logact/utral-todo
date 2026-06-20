import Foundation
import Network
import UtralTodoKit

enum TimerSyncCoordinator {
    private static var pendingSyncs: [PendingSync] {
        get { (UserDefaults.standard.array(forKey: "pendingTimerSyncs") as? [Data])?.compactMap { try? JSONDecoder().decode(PendingSync.self, from: $0) } ?? [] }
        set {
            let data = try? newValue.map { try JSONEncoder().encode($0) }
            UserDefaults.standard.set(data, forKey: "pendingTimerSyncs")
        }
    }

    private static var periodicTimer: Timer?
    private static var monitor: NWPathMonitor?
    private static var isNetworkAvailable = true

    struct PendingSync: Codable {
        let sessionId: String
        let operation: String
        let elapsedSeconds: Int
        let currentIndex: Int
        let status: String
        let startedAt: TimeInterval?
        let timestamp: TimeInterval
    }

    // MARK: - Public API

    static func startPeriodicSync(sessionId: String, interval: TimeInterval = 30) {
        stopPeriodicSync()
        periodicTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { _ in
            guard let state = SharedTimerStore.loadTimerState(), state.isRunning else { return }
            Task {
                await syncTimerState(sessionId: state.sessionId, state: state)
            }
        }
        startNetworkMonitor()
    }

    static func stopPeriodicSync() {
        periodicTimer?.invalidate()
        periodicTimer = nil
    }

    static func syncOnStateChange(sessionId: String, elapsedSeconds: Int, currentIndex: Int, status: String, startedAt: TimeInterval?) async {
        let sync = PendingSync(
            sessionId: sessionId,
            operation: status == "running" ? "update" : "update",
            elapsedSeconds: elapsedSeconds,
            currentIndex: currentIndex,
            status: status,
            startedAt: startedAt,
            timestamp: Date().timeIntervalSince1970
        )

        if isNetworkAvailable {
            await sendSync(sync)
        } else {
            queueSync(sync)
        }
    }

    static func flushPendingSyncs() async {
        let pending = pendingSyncs
        guard !pending.isEmpty else { return }

        var succeeded: [String] = []
        for sync in pending {
            await sendSync(sync)
            succeeded.append(sync.sessionId)
        }

        pendingSyncs = pendingSyncs.filter { !succeeded.contains($0.sessionId) }
    }

    // MARK: - Private

    private static func syncTimerState(sessionId: String, state: SharedTimerStore.SharedTimerState) async {
        let sync = PendingSync(
            sessionId: sessionId,
            operation: "update",
            elapsedSeconds: state.elapsedSeconds,
            currentIndex: state.currentIndex,
            status: state.isRunning ? "running" : (state.isCompleted ? "completed" : "paused"),
            startedAt: state.startedAt,
            timestamp: Date().timeIntervalSince1970
        )

        if isNetworkAvailable {
            await sendSync(sync)
        } else {
            queueSync(sync)
        }
    }

    private static func sendSync(_ sync: PendingSync) async {
        guard let serverUrl = UserDefaults.standard.string(forKey: "syncServerUrl"),
              let url = URL(string: "\(serverUrl)/api/timer-sessions/\(sync.sessionId)/timer-state") else {
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let apiToken = UserDefaults.standard.string(forKey: "syncApiToken") {
            request.setValue("Bearer \(apiToken)", forHTTPHeaderField: "Authorization")
        }

        if let deviceId = UserDefaults.standard.string(forKey: "deviceId") {
            request.setValue(deviceId, forHTTPHeaderField: "x-device-id")
        }

        var body: [String: Any] = [
            "elapsedSeconds": sync.elapsedSeconds,
            "currentIndex": sync.currentIndex,
            "status": sync.status,
        ]
        if let startedAt = sync.startedAt {
            body["startedAt"] = startedAt * 1000
        }

        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
                queueSync(sync)
                return
            }
        } catch {
            queueSync(sync)
        }
    }

    private static func queueSync(_ sync: PendingSync) {
        var pending = pendingSyncs
        pending.removeAll { $0.sessionId == sync.sessionId }
        pending.append(sync)
        pendingSyncs = pending
    }

    private static func startNetworkMonitor() {
        guard monitor == nil else { return }
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { path in
            isNetworkAvailable = path.status == .satisfied
            if path.status == .satisfied {
                Task { await flushPendingSyncs() }
            }
        }
        monitor.start(queue: DispatchQueue.global(qos: .utility))
        self.monitor = monitor
    }
}
