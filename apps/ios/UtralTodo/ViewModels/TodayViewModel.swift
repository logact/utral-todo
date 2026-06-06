import Foundation
import SwiftData
import UtralTodoKit

@MainActor
final class TodayViewModel: ObservableObject {
    func quickCreate(title: String) {
        // In a real app, this would use the ModelContext from the environment
        // For now, this is a placeholder that demonstrates the pattern
        print("Quick create: \(title)")
    }

    func delete(todo: Todo) {
        print("Delete: \(todo.title)")
    }

    func refresh() async {
        // Fetch today's data from server
        print("Refreshing today's data...")
    }
}
