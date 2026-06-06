import SwiftUI

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
