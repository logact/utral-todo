import SwiftUI
import SwiftData
import UtralTodoKit

struct InboxView: View {
    @Query(
        filter: #Predicate<Todo> { $0.scheduledDate == nil && $0.status != "done" },
        sort: \Todo.createdAt,
        order: .reverse
    ) private var inboxTodos: [Todo]

    @State private var showQuickCreate = false
    @StateObject private var viewModel = TodayViewModel()

    var body: some View {
        NavigationStack {
            List {
                if inboxTodos.isEmpty {
                    Section {
                        ContentUnavailableView {
                            Label("Inbox is empty", systemImage: "tray")
                        } description: {
                            Text("No unscheduled tasks. Great job!")
                        }
                    }
                } else {
                    Section("\(inboxTodos.count) unscheduled") {
                        ForEach(inboxTodos, id: \.id) { todo in
                            NavigationLink(value: todo) {
                                TodoRow(todo: todo)
                            }
                        }
                        .onDelete { indexSet in
                            for index in indexSet {
                                viewModel.delete(todo: inboxTodos[index])
                            }
                        }
                    }
                }
            }
            .navigationTitle("Inbox")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showQuickCreate = true }) {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showQuickCreate) {
                QuickCreateView { title in
                    viewModel.quickCreate(title: title)
                }
            }
            .navigationDestination(for: Todo.self) { todo in
                TodoDetailView(todo: todo)
            }
        }
    }
}
