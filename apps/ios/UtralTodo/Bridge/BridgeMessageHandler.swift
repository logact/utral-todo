import WebKit

@MainActor
final class BridgeMessageHandler: NSObject, WKScriptMessageHandler {
    private let webView: WKWebView
    private var modules: [String: BridgeModule] = [:]

    init(webView: WKWebView) {
        self.webView = webView
        super.init()
        registerDefaultModules()
    }

    func register(_ module: BridgeModule) {
        modules[module.name] = module
    }

    private func registerDefaultModules() {
        register(HapticModule())
        register(NotificationModule())
        register(CameraModule())
        register(DeviceModule())
        register(StorageModule())
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == "bridge",
              let body = message.body as? [String: Any],
              let data = try? JSONSerialization.data(withJSONObject: body),
              let bridgeMessage = try? JSONDecoder().decode(BridgeMessage.self, from: data) else {
            return
        }

        Task {
            await handle(message: bridgeMessage)
        }
    }

    private func handle(message: BridgeMessage) async {
        guard let module = modules[message.module] else {
            await sendResponse(.failure(
                id: message.id,
                code: "MODULE_NOT_FOUND",
                message: "Module '\(message.module)' not found"
            ))
            return
        }

        do {
            let result = try await module.handle(
                action: message.action,
                params: message.params ?? [:]
            )
            await sendResponse(.success(id: message.id, result: result))
        } catch {
            await sendResponse(.failure(
                id: message.id,
                code: "ACTION_FAILED",
                message: error.localizedDescription
            ))
        }
    }

    private func sendResponse(_ response: BridgeResponse) async {
        guard let data = try? JSONEncoder().encode(response),
              let json = String(data: data, encoding: .utf8) else {
            return
        }

        let js = "window.__bridge__.resolve('\(response.id)', \(json))"
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            webView.evaluateJavaScript(js) { _, _ in
                continuation.resume()
            }
        }
    }
}
