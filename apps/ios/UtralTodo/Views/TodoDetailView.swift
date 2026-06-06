import SwiftUI
import UtralTodoKit

struct TodoDetailView: View {
    @Bindable var todo: Todo
    @StateObject private var viewModel = TodoDetailViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            Section {
                TextField("Title", text: $todo.title)
                    .font(.headline)

                Picker("Status", selection: $todo.status) {
                    Text("Pending").tag("pending")
                    Text("In Progress").tag("in_progress")
                    Text("Done").tag("done")
                }

                Picker("Priority", selection: $todo.priority) {
                    Text("Low").tag("low")
                    Text("Medium").tag("medium")
                    Text("High").tag("high")
                }
            }

            Section("Details") {
                TextEditor(text: $todo.description)
                    .frame(minHeight: 60)

                DatePicker("Due Date", selection: Binding(
                    get: { todo.dueDate ?? Date() },
                    set: { todo.dueDate = $0 }
                ), displayedComponents: .date)

                DatePicker("Scheduled", selection: Binding(
                    get: { todo.scheduledDate ?? Date() },
                    set: { todo.scheduledDate = $0 }
                ), displayedComponents: .date)

                Stepper("Estimated: \(todo.estimatedMinutes) min", value: $todo.estimatedMinutes, in: 0...480, step: 15)
            }

            Section {
                Button(todo.isDone ? "Mark as Pending" : "Mark as Done") {
                    if todo.isDone {
                        todo.status = "pending"
                        todo.completedAt = nil
                    } else {
                        todo.status = "done"
                        todo.completedAt = Date()
                    }
                    todo.updatedAt = Date()
                }
                .foregroundStyle(todo.isDone ? .orange : .green)
            }
        }
        .navigationTitle("Edit Todo")
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") {
                    todo.updatedAt = Date()
                    viewModel.save(todo: todo)
                    dismiss()
                }
            }
        }
    }
}
