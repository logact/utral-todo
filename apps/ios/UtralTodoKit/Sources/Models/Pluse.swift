import Foundation
import SwiftData

@Model
public final class Pluse {
    @Attribute(.unique) public var id: String
    public var name: String
    public var desc: String
    public var details: String
    public var intervalsData: Data
    public var repeatCount: Int
    public var intervalTodosData: Data?
    public var autoAdvance: Bool
    public var createdAt: Date
    public var updatedAt: Date

    public var intervals: [Int] {
        get {
            (try? JSONDecoder().decode([Int].self, from: intervalsData)) ?? [25]
        }
        set {
            intervalsData = (try? JSONEncoder().encode(newValue)) ?? Data()
        }
    }

    public var intervalTodos: [Int: String]? {
        get {
            guard let data = intervalTodosData else { return nil }
            let dict = (try? JSONDecoder().decode([String: String].self, from: data)) ?? [:]
            var result: [Int: String] = [:]
            for (key, value) in dict {
                if let idx = Int(key) { result[idx] = value }
            }
            return result
        }
        set {
            guard let newValue else {
                intervalTodosData = nil
                return
            }
            var dict: [String: String] = [:]
            for (key, value) in newValue { dict[String(key)] = value }
            intervalTodosData = try? JSONEncoder().encode(dict)
        }
    }

    public init(
        id: String = UUID().uuidString,
        name: String,
        description: String = "",
        details: String = "",
        intervals: [Int] = [25],
        repeatCount: Int = 1,
        intervalTodos: [Int: String]? = nil,
        autoAdvance: Bool = true,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.name = name
        self.desc = description
        self.details = details
        self.repeatCount = repeatCount
        self.autoAdvance = autoAdvance
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.intervalsData = (try? JSONEncoder().encode(intervals)) ?? Data()
        if let intervalTodos {
            var dict: [String: String] = [:]
            for (key, value) in intervalTodos { dict[String(key)] = value }
            self.intervalTodosData = try? JSONEncoder().encode(dict)
        }
    }
}
