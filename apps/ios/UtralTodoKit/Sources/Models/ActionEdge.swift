import Foundation
import SwiftData

@Model
public final class ActionEdge {
    @Attribute(.unique) public var id: String
    public var fromTodoId: String
    public var toTodoId: String
    public var type: String
    public var createdAt: Date
    public var updatedAt: Date

    public var versionWall: Int = 0
    public var versionCounter: Int = 0
    public var versionNode: String = ""
    public var deletedAtWall: Int? = nil
    public var deletedAtCounter: Int? = nil
    public var deletedAtNode: String? = nil

    public init(
        id: String = UUID().uuidString,
        fromTodoId: String,
        toTodoId: String,
        type: String,
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        versionWall: Int = 0,
        versionCounter: Int = 0,
        versionNode: String = ""
    ) {
        self.id = id
        self.fromTodoId = fromTodoId
        self.toTodoId = toTodoId
        self.type = type
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.versionWall = versionWall
        self.versionCounter = versionCounter
        self.versionNode = versionNode
    }
}
