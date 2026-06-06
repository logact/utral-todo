import Foundation
import UtralTodoKit

@MainActor
final class TodoDetailViewModel: ObservableObject {
    func save(todo: Todo) {
        // Save changes and queue for sync
        print("Saving: \(todo.title)")
    }
}
