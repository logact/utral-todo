import Foundation

struct StorageModule: BridgeModule {
    let name = "storage"

    private var defaults: UserDefaults { UserDefaults.standard }

    func handle(action: String, params: [String: BridgeValue]) async throws -> BridgeValue {
        switch action {
        case "getItem":
            guard let key = params["key"]?.asString else {
                throw BridgeModuleError.invalidParams
            }
            if let value = defaults.string(forKey: key) {
                return .string(value)
            }
            return .null

        case "setItem":
            guard let key = params["key"]?.asString,
                  let value = params["value"]?.asString else {
                throw BridgeModuleError.invalidParams
            }
            defaults.set(value, forKey: key)
            return .bool(true)

        case "removeItem":
            guard let key = params["key"]?.asString else {
                throw BridgeModuleError.invalidParams
            }
            defaults.removeObject(forKey: key)
            return .bool(true)

        case "getAll":
            let dict = defaults.dictionaryRepresentation()
            var result: [String: BridgeValue] = [:]
            for (key, value) in dict where !key.hasPrefix("_") {
                if let str = value as? String {
                    result[key] = .string(str)
                }
            }
            return .object(result)

        default:
            throw BridgeModuleError.unknownAction(action)
        }
    }
}
