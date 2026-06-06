import SwiftUI
import SwiftData
import UtralTodoKit

@main
struct UtralTodoWatchApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .modelContainer(sharedWatchModelContainer)
        }
    }
}

@MainActor
let sharedWatchModelContainer: ModelContainer = {
    let schema = Schema([
        Todo.self,
        Project.self,
        TodoLog.self,
        TodoRelation.self,
        TimerSession.self,
        Roadmap.self,
        ActionEdge.self,
        Pluse.self,
        SyncEvent.self,
        DeviceRegistration.self,
    ])
    let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)
    do {
        return try ModelContainer(for: schema, configurations: [config])
    } catch {
        fatalError("Failed to create watch ModelContainer: \(error)")
    }
}()
