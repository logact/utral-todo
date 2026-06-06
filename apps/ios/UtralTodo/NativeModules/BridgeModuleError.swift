import Foundation

enum BridgeModuleError: Error, LocalizedError {
    case unknownAction(String)
    case invalidParams

    var errorDescription: String? {
        switch self {
        case .unknownAction(let action):
            return "Unknown action: \(action)"
        case .invalidParams:
            return "Invalid or missing parameters"
        }
    }
}
