import SwiftUI
import SwiftData
import UtralTodoKit

struct ContentView: View {
    @Query(
        filter: #Predicate<Todo> {
            $0.status != "done"
        },
        sort: \Todo.order
    ) private var activeTodos: [Todo]

    var body: some View {
        NavigationStack {
            List {
                Section("Today") {
                    let todayTodos = activeTodos.filter { todo in
                        guard let scheduled = todo.scheduledDate else { return false }
                        return Calendar.current.isDateInToday(scheduled)
                    }

                    if todayTodos.isEmpty {
                        Text("No tasks for today")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(todayTodos, id: \.id) { todo in
                            NavigationLink(value: todo) {
                                WatchTodoRow(todo: todo)
                            }
                        }
                    }
                }

                Section("Active") {
                    let otherTodos = activeTodos.filter { todo in
                        guard let scheduled = todo.scheduledDate else { return true }
                        return !Calendar.current.isDateInToday(scheduled)
                    }

                    if otherTodos.isEmpty {
                        Text("All caught up!")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(otherTodos.prefix(5), id: \.id) { todo in
                            NavigationLink(value: todo) {
                                WatchTodoRow(todo: todo)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Utral")
            .navigationDestination(for: Todo.self) { todo in
                WatchTodoDetailView(todo: todo)
            }
        }
    }
}

struct WatchTodoRow: View {
    let todo: Todo

    var body: some View {
        HStack {
            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)

            Text(todo.title)
                .font(.system(size: 16, weight: .medium))
                .lineLimit(2)
                .strikethrough(todo.isDone)

            Spacer()

            if todo.estimatedMinutes > 0 {
                Text("\(todo.estimatedMinutes)m")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }

    private var statusColor: Color {
        switch todo.status {
        case "done": return .green
        case "in_progress": return .orange
        default: return .gray
        }
    }
}
