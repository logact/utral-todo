import Foundation
import SwiftData

@Model
public final class SyncEvent {
    @Attribute(.unique) public var id: String
    public var table: String
    public var operation: String
    public var recordId: String
    public var payloadData: Data?
    public var deviceId: String
    public var createdAt: Date

    public var payload: [String: Any]? {
        get {
            guard let data = payloadData else { return nil }
            return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        }
    }

    public init(
        id: String = UUID().uuidString,
        table: String,
        operation: String,
        recordId: String,
        payloadData: Data? = nil,
        deviceId: String = "unknown",
        createdAt: Date = Date()
    ) {
        self.id = id
        self.table = table
        self.operation = operation
        self.recordId = recordId
        self.payloadData = payloadData
        self.deviceId = deviceId
        self.createdAt = createdAt
    }
}
