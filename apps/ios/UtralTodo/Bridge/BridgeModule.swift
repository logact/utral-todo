import Foundation

protocol BridgeModule {
    var name: String { get }
    func handle(action: String, params: [String: BridgeValue]) async throws -> BridgeValue
}

extension BridgeValue {
    var asString: String? {
        if case .string(let value) = self { return value }
        return nil
    }

    var asInt: Int? {
        if case .int(let value) = self { return value }
        return nil
    }

    var asBool: Bool? {
        if case .bool(let value) = self { return value }
        return nil
    }

    var asObject: [String: BridgeValue]? {
        if case .object(let value) = self { return value }
        return nil
    }

    var asDouble: Double? {
        if case .double(let value) = self { return value }
        if case .int(let value) = self { return Double(value) }
        return nil
    }
}
