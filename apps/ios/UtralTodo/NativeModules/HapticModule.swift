import UIKit

struct HapticModule: BridgeModule {
    let name = "haptic"

    func handle(action: String, params: [String: BridgeValue]) async throws -> BridgeValue {
        switch action {
        case "impact":
            let style = params["style"]?.asString ?? "medium"
            let feedbackStyle: UIImpactFeedbackGenerator.FeedbackStyle
            switch style {
            case "light": feedbackStyle = .light
            case "medium": feedbackStyle = .medium
            case "heavy": feedbackStyle = .heavy
            case "soft": feedbackStyle = .soft
            case "rigid": feedbackStyle = .rigid
            default: feedbackStyle = .medium
            }
            let generator = UIImpactFeedbackGenerator(style: feedbackStyle)
            generator.prepare()
            generator.impactOccurred()
            return .bool(true)

        case "notification":
            let type = params["type"]?.asString ?? "success"
            let feedbackType: UINotificationFeedbackGenerator.FeedbackType
            switch type {
            case "success": feedbackType = .success
            case "warning": feedbackType = .warning
            case "error": feedbackType = .error
            default: feedbackType = .success
            }
            let generator = UINotificationFeedbackGenerator()
            generator.prepare()
            generator.notificationOccurred(feedbackType)
            return .bool(true)

        case "selection":
            let generator = UISelectionFeedbackGenerator()
            generator.prepare()
            generator.selectionChanged()
            return .bool(true)

        default:
            throw BridgeModuleError.unknownAction(action)
        }
    }
}
