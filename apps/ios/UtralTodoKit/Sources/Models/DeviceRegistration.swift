import Foundation
import SwiftData

@Model
public final class DeviceRegistration {
    @Attribute(.unique) public var id: String
    public var deviceId: String
    public var platform: String
    public var pushToken: String?
    public var serverUrl: String
    public var apiToken: String?
    public var registeredAt: Date

    public init(
        id: String = UUID().uuidString,
        deviceId: String,
        platform: String = "ios",
        pushToken: String? = nil,
        serverUrl: String = "",
        apiToken: String? = nil,
        registeredAt: Date = Date()
    ) {
        self.id = id
        self.deviceId = deviceId
        self.platform = platform
        self.pushToken = pushToken
        self.serverUrl = serverUrl
        self.apiToken = apiToken
        self.registeredAt = registeredAt
    }
}
