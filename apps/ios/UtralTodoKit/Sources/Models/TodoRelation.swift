import Foundation
import SwiftData

@Model
public final class TodoRelation {
    @Attribute(.unique) public var id: String
    public var fromTodoId: String
    public var toTodoId: String
    public var type: String
    public var createdAt: Date
    public var updatedAt: Date

    public init(
        id: String = UUID().uuidString,
        fromTodoId: String,
        toTodoId: String,
        type: String,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.fromTodoId = fromTodoId
        self.toTodoId = toTodoId
        self.type = type
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}
