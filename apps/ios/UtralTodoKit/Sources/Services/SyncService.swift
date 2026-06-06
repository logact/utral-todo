import Foundation

public struct SyncPushPayload: Codable {
    public let deviceId: String
    public let changes: [RemoteSyncEvent]
}

public struct RemoteSyncEvent: Codable {
    public let id: String
    public let table: String
    public let operation: String
    public let recordId: String
    public let payload: Data?
    public let deviceId: String
    public let createdAt: String
}

public struct SyncPushResponse: Codable {
    public let accepted: Int
    public let rejected: [RejectedChange]
}

public struct RejectedChange: Codable {
    public let recordId: String
    public let reason: String
}

public struct SyncEventsResponse: Codable {
    public let events: [RemoteSyncEvent]
}

public actor SyncService {
    private let api: APIService

    public init(api: APIService) {
        self.api = api
    }

    public func pushChanges(_ events: [RemoteSyncEvent]) async throws -> SyncPushResponse {
        let payload = SyncPushPayload(deviceId: await api.deviceId, changes: events)
        return try await api.post("/sync/push", body: payload)
    }

    public func fetchEvents(since: Date) async throws -> [RemoteSyncEvent] {
        let formatter = ISO8601DateFormatter()
        let body = ["since": formatter.string(from: since)]
        let response: SyncEventsResponse = try await api.post("/sync/events", body: body)
        return response.events
    }

    public func registerDevice(deviceId: String, platform: String, pushToken: String?) async throws {
        let body = [
            "deviceId": deviceId,
            "platform": platform,
            "pushToken": pushToken,
        ] as [String: String?]
        _ = try await api.post("/devices/register", body: body)
    }
}
