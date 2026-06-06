import Foundation
import SwiftData

@Model
public final class TodoLog {
    @Attribute(.unique) public var id: String
    public var todoId: String
    public var type: String
    public var content: String
    public var minutesSpent: Int?
    public var metadataData: Data?
    public var createdAt: Date
    public var updatedAt: Date

    public init(
        id: String = UUID().uuidString,
        todoId: String,
        type: String,
        content: String,
        minutesSpent: Int? = nil,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.todoId = todoId
        self.type = type
        self.content = content
        self.minutesSpent = minutesSpent
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}
