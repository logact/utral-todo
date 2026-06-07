import SwiftUI
import WebKit

@MainActor
class WebViewStore: ObservableObject {
    static let shared = WebViewStore()
    weak var webView: WKWebView?

    func triggerSync() {
        guard let webView = webView else { return }
        let js = "window.dispatchEvent(new Event('nativeSyncTrigger'))"
        webView.evaluateJavaScript(js) { _, _ in }
    }
}

struct WebShellView: View {
    @State private var canGoBack = false
    @State private var bridgeHandler: BridgeMessageHandler?

    var body: some View {
        BridgeWebView(canGoBack: $canGoBack) { handler in
            self.bridgeHandler = handler
        }
        .ignoresSafeArea(.container, edges: .bottom)
    }
}
