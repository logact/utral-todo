import Foundation
import SwiftData

@Model
public final class Project {
    @Attribute(.unique) public var id: String
    public var title: String
    public var description: String
    public var status: String
    public var color: String
    public var createdAt: Date
    public var updatedAt: Date
    public var deadline: Date?

    public init(
        id: String = UUID().uuidString,
        title: String,
        description: String = "",
        status: String = "active",
        color: String = "#6366f1",
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        deadline: Date? = nil
    ) {
        self.id = id
        self.title = title
        self.description = description
        self.status = status
        self.color = color
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.deadline = deadline
    }
}
