import SwiftUI
import UtralTodoKit

struct WatchTodoDetailView: View {
    @Bindable var todo: Todo
    @State private var showTimer = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(todo.title)
                    .font(.system(size: 18, weight: .semibold))
                    .lineLimit(3)

                HStack {
                    Circle()
                        .fill(statusColor)
                        .frame(width: 8, height: 8)
                    Text(todo.displayStatus)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if todo.estimatedMinutes > 0 {
                    Label("\(todo.estimatedMinutes) min", systemImage: "clock")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Divider()

                VStack(spacing: 8) {
                    Button(action: toggleStatus) {
                        HStack {
                            Image(systemName: todo.isDone ? "arrow.uturn.backward" : "checkmark.circle.fill")
                            Text(todo.isDone ? "Reopen" : "Complete")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(todo.isDone ? .orange : .green)

                    if !todo.isDone {
                        Button(action: { showTimer = true }) {
                            HStack {
                                Image(systemName: "timer")
                                Text("Timer")
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                    }
                }
            }
            .padding(.horizontal, 4)
        }
        .navigationTitle("Task")
        .sheet(isPresented: $showTimer) {
            WatchTimerView(todo: todo)
        }
    }

    private func toggleStatus() {
        if todo.isDone {
            todo.status = "pending"
            todo.completedAt = nil
        } else {
            todo.status = "done"
            todo.completedAt = Date()
        }
        todo.updatedAt = Date()
        dismiss()
    }

    private var statusColor: Color {
        switch todo.status {
        case "done": return .green
        case "in_progress": return .orange
        default: return .gray
        }
    }
}
