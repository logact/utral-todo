import UIKit
import AVFoundation

struct CameraModule: BridgeModule {
    let name = "camera"

    func handle(action: String, params: [String: BridgeValue]) async throws -> BridgeValue {
        switch action {
        case "capture", "pickFromLibrary":
            // For now, return a placeholder. Full camera integration requires
            // UIViewController presentation which is beyond the bridge pattern.
            // The web app can use the native file picker or navigator.mediaDevices.
            return .object([
                "available": .bool(true),
                "note": .string("Use navigator.mediaDevices.getUserMedia or input[type=file] in the web app")
            ])

        case "checkPermission":
            let status = AVCaptureDevice.authorizationStatus(for: .video)
            let granted: Bool
            switch status {
            case .authorized: granted = true
            case .notDetermined, .denied, .restricted: granted = false
            @unknown default: granted = false
            }
            return .object(["granted": .bool(granted)])

        default:
            throw BridgeModuleError.unknownAction(action)
        }
    }
}
