import SwiftUI
import UtralTodoKit

struct SettingsView: View {
    @StateObject private var viewModel = SettingsViewModel()
    @State private var showRegistrationAlert = false
    @State private var registrationMessage = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Server") {
                    TextField("Server URL", text: $viewModel.serverUrl)
                        .autocapitalization(.none)
                        .keyboardType(.URL)

                    SecureField("API Token", text: Binding(
                        get: { viewModel.apiToken ?? "" },
                        set: { viewModel.apiToken = $0.isEmpty ? nil : $0 }
                    ))
                    .autocapitalization(.none)
                }

                Section("Device") {
                    LabeledContent("Device ID", value: viewModel.deviceId)
                    if let token = viewModel.pushToken {
                        LabeledContent("Push Token", value: token.prefix(16) + "...")
                    }

                    Button("Register Device") {
                        Task {
                            await registerDevice()
                        }
                    }
                    .disabled(viewModel.serverUrl.isEmpty)
                }

                Section("Sync") {
                    Toggle("Enable Sync", isOn: $viewModel.syncEnabled)

                    if let lastSync = viewModel.lastSyncDate {
                        LabeledContent("Last Sync", value: lastSync.formatted())
                    }

                    Button("Force Sync Now") {
                        Task {
                            await viewModel.forceSync()
                        }
                    }
                    .disabled(!viewModel.syncEnabled || viewModel.serverUrl.isEmpty)
                }

                Section("About") {
                    LabeledContent("Version", value: "1.0.0")
                    LabeledContent("Platform", value: "iOS")
                }
            }
            .navigationTitle("Settings")
            .alert("Registration", isPresented: $showRegistrationAlert) {
                Button("OK") { }
            } message: {
                Text(registrationMessage)
            }
            .onReceive(NotificationCenter.default.publisher(for: .apnsTokenReceived)) { notification in
                if let token = notification.object as? String {
                    viewModel.pushToken = token
                }
            }
        }
    }

    private func registerDevice() async {
        do {
            let api = APIService(
                baseURL: viewModel.serverUrl,
                apiToken: viewModel.apiToken,
                deviceId: viewModel.deviceId
            )
            let syncService = SyncService(api: api)
            try await syncService.registerDevice(
                deviceId: viewModel.deviceId,
                platform: "ios",
                pushToken: viewModel.pushToken
            )
            registrationMessage = "Device registered successfully"
        } catch {
            registrationMessage = "Failed: \(error.localizedDescription)"
        }
        showRegistrationAlert = true
    }
}
