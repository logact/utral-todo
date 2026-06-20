import SwiftUI
import WebKit

struct BridgeWebView: UIViewRepresentable {
    @Binding var canGoBack: Bool
    let onBridgeReady: (BridgeMessageHandler) -> Void

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // Inject bridge script before any page loads
        let bridgeScript = WKUserScript(
            source: BridgeWebView.bridgeJS,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        )
        config.userContentController.addUserScript(bridgeScript)

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        WebViewStore.shared.webView = webView
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.bounces = true
        webView.scrollView.alwaysBounceVertical = true

        // Add safe area insets handling via CSS injection
        let viewportScript = WKUserScript(
            source: """
                document.documentElement.style.setProperty('--sat', env(safe-area-inset-top) + 'px');
                document.documentElement.style.setProperty('--sar', env(safe-area-inset-right) + 'px');
                document.documentElement.style.setProperty('--sab', env(safe-area-inset-bottom) + 'px');
                document.documentElement.style.setProperty('--sal', env(safe-area-inset-left) + 'px');
            """,
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(viewportScript)

        let handler = BridgeMessageHandler(webView: webView)
        config.userContentController.add(handler, name: "bridge")

        let errorScript = WKUserScript(
            source: """
                window.onerror = function(msg, url, line, col, error) {
                    console.error('[JS Error]', msg, url, line, col, error);
                };
                window.addEventListener('unhandledrejection', function(e) {
                    console.error('[Unhandled Promise]', e.reason);
                });
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        )
        config.userContentController.addUserScript(errorScript)

        DispatchQueue.main.async {
            onBridgeReady(handler)
        }

        loadContent(in: webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    private func loadContent(in webView: WKWebView) {
        if let url = Bundle.main.url(forResource: "index", withExtension: "html") {
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        } else {
            let html = """
                <html><body style="font-family:system-ui;padding:40px;text-align:center;">
                <h1>Utral Todo</h1>
                <p>Web content not found.</p>
                <p>Build the mobile app and copy <code>dist/</code> to the app bundle.</p>
                </body></html>
            """
            webView.loadHTMLString(html, baseURL: nil)
        }
    }

    class Coordinator: NSObject, WKNavigationDelegate {
        var parent: BridgeWebView

        init(_ parent: BridgeWebView) {
            self.parent = parent
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            parent.canGoBack = webView.canGoBack
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            decisionHandler(.allow)
        }
    }

    static let bridgeJS = """
        (function() {
            if (window.__bridge__) return;

            const pending = new Map();
            let idCounter = 0;

            function makeValue(value) {
                if (value === null || value === undefined) return null;
                if (typeof value === 'string') return value;
                if (typeof value === 'number') return Number.isInteger(value) ? value : value;
                if (typeof value === 'boolean') return value;
                if (Array.isArray(value)) return value.map(makeValue);
                if (typeof value === 'object') {
                    const obj = {};
                    for (const k of Object.keys(value)) obj[k] = makeValue(value[k]);
                    return obj;
                }
                return String(value);
            }

            window.__bridge__ = {
                isNative: true,
                platform: 'ios',
                platformName: 'iOS',
                version: '1.0.0',

                call: function(module, action, params) {
                    return new Promise(function(resolve, reject) {
                        const id = 'bridge_' + (++idCounter);
                        pending.set(id, { resolve: resolve, reject: reject });
                        try {
                            window.webkit.messageHandlers.bridge.postMessage({
                                id: id,
                                module: module,
                                action: action,
                                params: params || {}
                            });
                        } catch (e) {
                            pending.delete(id);
                            reject(e);
                        }
                    });
                },

                resolve: function(id, response) {
                    const req = pending.get(id);
                    if (!req) return;
                    pending.delete(id);
                    if (response && response.error) {
                        req.reject(new Error(response.error.message || 'Unknown error'));
                    } else {
                        req.resolve(response && response.result !== undefined ? response.result : response);
                    }
                },

                reject: function(id, error) {
                    const req = pending.get(id);
                    if (!req) return;
                    pending.delete(id);
                    req.reject(new Error(error && error.message ? error.message : String(error)));
                }
            };

            // Dispatch event so the web app knows the bridge is ready
            window.dispatchEvent(new Event('nativebridgeReady'));
        })();
    """
}
