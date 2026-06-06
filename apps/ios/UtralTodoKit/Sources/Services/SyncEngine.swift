import Foundation
import SwiftData
import Combine

@MainActor
public final class SyncEngine: ObservableObject {
    @Published public private(set) var status: SyncStatus = .idle
    @Published public private(set) var lastError: String?
    @Published public private(set) var pendingCount: Int = 0

    private let api: APIService
    private let syncService: SyncService
    private let modelContext: ModelContext
    private var sseTask: Task<Void, Never>?
    private var isOnline = true

    public enum SyncStatus: String {
        case idle = "idle"
        case syncing = "syncing"
        case offline = "offline"
        case error = "error"
    }

    public init(api: APIService, modelContext: ModelContext) {
        self.api = api
        self.syncService = SyncService(api: api)
        self.modelContext = modelContext
    }

    public func start() {
        connectSSE()
        Task { await processQueue() }
    }

    public func stop() {
        sseTask?.cancel()
        sseTask = nil
    }

    public func setOnline(_ online: Bool) {
        isOnline = online
        if online {
            status = .idle
            Task { await processQueue() }
        } else {
            status = .offline
        }
    }

    // MARK: - Outbound Sync

    public func queueLocalChange(table: String, operation: String, recordId: String, payload: [String: Any]? = nil) async {
        let event = SyncEvent(
            table: table,
            operation: operation,
            recordId: recordId,
            payloadData: payload.flatMap { try? JSONSerialization.data(withJSONObject: $0) },
            deviceId: await api.deviceId
        )
        modelContext.insert(event)
        try? modelContext.save()
        await updatePendingCount()

        if isOnline {
            Task { await processQueue() }
        }
    }

    public func processQueue() async {
        guard isOnline else { return }

        let descriptor = FetchDescriptor<SyncEvent>(sortBy: [SortDescriptor(\.createdAt)])
        guard let events = try? modelContext.fetch(descriptor), !events.isEmpty else { return }

        status = .syncing

        let remoteEvents: [RemoteSyncEvent] = events.map { event in
            RemoteSyncEvent(
                id: event.id,
                table: event.table,
                operation: event.operation,
                recordId: event.recordId,
                payload: event.payloadData,
                deviceId: event.deviceId,
                createdAt: ISO8601DateFormatter().string(from: event.createdAt)
            )
        }

        do {
            let response = try await syncService.pushChanges(remoteEvents)
            if response.rejected.isEmpty {
                // All accepted, clear queue
                for event in events {
                    modelContext.delete(event)
                }
                try? modelContext.save()
            } else {
                // Remove accepted, keep rejected
                let rejectedIds = Set(response.rejected.map(\.recordId))
                for event in events where !rejectedIds.contains(event.recordId) {
                    modelContext.delete(event)
                }
                try? modelContext.save()
                lastError = "\(response.rejected.count) changes rejected"
            }
            status = isOnline ? .idle : .offline
        } catch {
            status = .error
            lastError = String(describing: error)
        }

        await updatePendingCount()
    }

    private func updatePendingCount() async {
        let descriptor = FetchDescriptor<SyncEvent>()
        pendingCount = (try? modelContext.fetchCount(descriptor)) ?? 0
    }

    // MARK: - Inbound Sync (SSE)

    private func connectSSE() {
        sseTask?.cancel()
        sseTask = Task { [weak self] in
            guard let self else { return }
            await self.streamSSE()
        }
    }

    private func streamSSE() async {
        guard let baseURL = URL(string: await api.baseURL) else { return }

        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: true)
        components?.path = "/api/sync/stream"

        guard let url = components?.url else { return }

        var request = URLRequest(url: url)
        request.setValue(await api.deviceId, forHTTPHeaderField: "x-device-id")
        if let token = await api.apiToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        do {
            let (bytes, response) = try await URLSession.shared.bytes(for: request)
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                status = .error
                return
            }

            status = .idle

            var buffer = ""
            for try await byte in bytes {
                let char = Character(UnicodeScalar(byte))
                buffer.append(char)

                if buffer.hasSuffix("\n\n") {
                    await handleSSELine(buffer)
                    buffer = ""
                }
            }
        } catch {
            if Task.isCancelled { return }
            status = .error
            lastError = String(describing: error)
            // Reconnect after delay
            try? await Task.sleep(for: .seconds(5))
            connectSSE()
        }
    }

    private func handleSSELine(_ line: String) async {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.hasPrefix("data: ") else { return }

        let jsonString = String(trimmed.dropFirst(6))
        guard let data = jsonString.data(using: .utf8) else { return }

        do {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601

            if let delta = try? decoder.decode(SSEDelta.self, from: data) {
                for event in delta.events {
                    await applyRemoteEvent(event)
                }
            } else if let single = try? decoder.decode(SSESingle.self, from: data) {
                await applyRemoteEvent(single.event)
            }
        } catch {
            print("[sync] Failed to parse SSE data:", error)
        }
    }

    private func applyRemoteEvent(_ event: RemoteSyncEvent) async {
        // Find existing local record and apply last-write-wins
        let recordId = event.recordId
        let table = event.table

        // Update the corresponding model
        switch table {
        case "todo":
            if let todo = try? modelContext.fetch(FetchDescriptor<Todo>(predicate: #Predicate { $0.id == recordId })).first {
                // Apply update - simplified; in production you'd merge fields
                todo.updatedAt = Date()
                try? modelContext.save()
            }
        default:
            break
        }
    }
}

private struct SSEDelta: Decodable {
    let type: String
    let events: [RemoteSyncEvent]
}

private struct SSESingle: Decodable {
    let type: String
    let event: RemoteSyncEvent
}
