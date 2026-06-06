import SwiftUI
import SwiftData

struct ContentView: View {
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            TodayView()
                .tabItem {
                    Label("Today", systemImage: "calendar")
                }
                .tag(0)

            InboxView()
                .tabItem {
                    Label("Inbox", systemImage: "tray")
                }
                .tag(1)

            ProjectListView()
                .tabItem {
                    Label("Projects", systemImage: "folder")
                }
                .tag(2)

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gear")
                }
                .tag(3)
        }
    }
}
